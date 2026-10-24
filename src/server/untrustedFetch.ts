import 'server-only';
import { lookup as dnsLookup, LookupAddress, LookupOptions } from 'node:dns';
import { request as httpRequest, IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';

/**
 * Fetch from a server that outsiders control (token logo URLs, inscription
 * content), without ever decompressing what it sends.
 *
 * Node's fetch() decompresses gzip/deflate/Brotli on its own, starting as the
 * first bytes arrive, so a hostile server can feed its decoders even when the
 * caller asked for identity and meant to refuse anything else (Brotli decoder
 * out-of-bounds write, CVE-2026-111497, Oct 2026). node:http(s) never
 * decompresses: here any Content-Encoding other than identity is refused
 * before a single body byte is read, on every Node version.
 *
 * It also never reaches inside the network (server-side request forgery): a
 * token creator could point a logo at localhost, a private address or a cloud
 * metadata endpoint. Every hop, redirects included, must use a standard port
 * and resolve only to public addresses. The check runs inside the
 * connection's own DNS lookup, so the address that passes is the one used
 * (a second, different answer can't slip in between: DNS rebinding).
 */

export class UntrustedFetchError extends Error {
  constructor(readonly reason: 'encoded' | 'too-large' | 'redirects' | 'protocol' | 'blocked', message: string) {
    super(message);
  }
}

export interface UntrustedResponse {
  status: number;
  ok: boolean;
  contentType: string; // the full header, e.g. 'text/html; charset=utf-8'
  body: Buffer;
}

interface Options {
  timeoutMs: number;
  maxBytes: number;
  headers?: Record<string, string>;
  maxRedirects?: number;
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const PORTS = new Set(['', '80', '443']);

// Addresses that aren't the public internet: loopback, private, link-local (cloud metadata
// lives at 169.254.169.254), carrier-grade NAT, documentation, benchmarking, multicast, reserved
const PRIVATE = new BlockList();
for (const [net, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) PRIVATE.addSubnet(net, bits, 'ipv4');
for (const [net, bits] of [
  ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32],
] as const) PRIVATE.addSubnet(net, bits, 'ipv6');

/** True for any address outside the public internet, including IPv4 hidden inside IPv6 forms */
export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return PRIVATE.check(address, 'ipv4');
  if (family !== 6) return true;
  const lower = address.toLowerCase();
  // ::ffff:a.b.c.d (mapped) and 64:ff9b::a.b.c.d (NAT64) reach IPv4 hosts
  const embedded = lower.match(/^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (embedded) return PRIVATE.check(embedded, 'ipv4');
  const hex = lower.match(/^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const [hi, lo] = [parseInt(hex[1], 16), parseInt(hex[2], 16)];
    return PRIVATE.check(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`, 'ipv4');
  }
  return PRIVATE.check(address, 'ipv6');
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** dns.lookup that refuses to hand the connection anything but public addresses */
function publicLookup(hostname: string, options: LookupOptions, callback: LookupCallback) {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, []);
    const list = addresses as LookupAddress[];
    const blocked = list.find((a) => isPrivateAddress(a.address));
    if (blocked || list.length === 0) {
      return callback(new UntrustedFetchError('blocked', `${hostname} resolves to a non-public address`) as NodeJS.ErrnoException, []);
    }
    if (options.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

function once(url: URL, options: Options): Promise<IncomingMessage> {
  const send = url.protocol === 'https:' ? httpsRequest : url.protocol === 'http:' ? httpRequest : null;
  if (!send) return Promise.reject(new UntrustedFetchError('protocol', `Unsupported protocol ${url.protocol}`));
  if (!PORTS.has(url.port)) return Promise.reject(new UntrustedFetchError('blocked', `Port ${url.port} is not allowed`));
  // A literal IP skips DNS, so check it here; names are checked in publicLookup
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) && isPrivateAddress(host)) return Promise.reject(new UntrustedFetchError('blocked', `${host} is not a public address`));
  return new Promise((resolve, reject) => {
    const req = send(url, {
      method: 'GET',
      headers: { ...options.headers, 'Accept-Encoding': 'identity' },
      signal: AbortSignal.timeout(options.timeoutMs),
      lookup: publicLookup as never,
    });
    req.on('response', resolve);
    req.on('error', reject);
    req.end();
  });
}

export async function fetchUntrusted(input: string, options: Options): Promise<UntrustedResponse> {
  let url = new URL(input);
  for (let hop = 0; ; hop++) {
    const res = await once(url, options);
    const status = res.statusCode ?? 0;

    if (REDIRECTS.has(status) && res.headers.location) {
      res.destroy();
      if (hop >= (options.maxRedirects ?? 3)) throw new UntrustedFetchError('redirects', 'Too many redirects');
      url = new URL(res.headers.location, url);
      continue;
    }

    // Refuse anything compressed before reading it
    const encoding = (res.headers['content-encoding'] ?? '').trim().toLowerCase();
    if (encoding && encoding !== 'identity') {
      res.destroy();
      throw new UntrustedFetchError('encoded', `Refused Content-Encoding: ${encoding}`);
    }

    const declared = Number(res.headers['content-length']);
    if (declared > options.maxBytes) {
      res.destroy();
      throw new UntrustedFetchError('too-large', `Body of ${declared} bytes is over the ${options.maxBytes} limit`);
    }

    const body = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > options.maxBytes) {
          res.destroy();
          reject(new UntrustedFetchError('too-large', `Body is over the ${options.maxBytes} limit`));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });

    return {
      status,
      ok: status >= 200 && status < 300,
      contentType: res.headers['content-type'] ?? '',
      body,
    };
  }
}
