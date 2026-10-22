import 'server-only';
import { request as httpRequest, IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';

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
 */

export class UntrustedFetchError extends Error {
  constructor(readonly reason: 'encoded' | 'too-large' | 'redirects' | 'protocol', message: string) {
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

function once(url: URL, options: Options): Promise<IncomingMessage> {
  const send = url.protocol === 'https:' ? httpsRequest : url.protocol === 'http:' ? httpRequest : null;
  if (!send) return Promise.reject(new UntrustedFetchError('protocol', `Unsupported protocol ${url.protocol}`));
  return new Promise((resolve, reject) => {
    const req = send(url, {
      method: 'GET',
      headers: { ...options.headers, 'Accept-Encoding': 'identity' },
      signal: AbortSignal.timeout(options.timeoutMs),
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
