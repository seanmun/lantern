/**
 * Sync codes: end-to-end encryption for moving settings between browsers.
 *
 * A code is 12 random Crockford base32 characters (60 bits), shown as
 * K7QM-2XRP-9TDA. PBKDF2 stretches it into 64 bytes: the first 32 are an
 * AES-GCM key that never leaves the browser, the last 32 are the lookup id
 * the server files the ciphertext under. Each half is a separate PBKDF2
 * block, so the id reveals nothing about the key. The salt is fixed because
 * the id must be reproducible from the code alone; with 60 random bits and
 * 600k iterations, guessing codes is out of reach.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const LENGTH = 12;
const ITERATIONS = 600_000;
const SALT = new TextEncoder().encode('lantern.sync.v1');

export function generateSyncCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(LENGTH));
  return formatSyncCode(Array.from(bytes, (b) => ALPHABET[b & 31]).join(''));
}

/** Uppercases and strips separators; reads O as 0 and I/L as 1. Null if not a code. */
export function normalizeSyncCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return raw.length === LENGTH && [...raw].every((c) => ALPHABET.includes(c)) ? raw : null;
}

export const formatSyncCode = (code: string) => code.match(/.{1,4}/g)!.join('-');

export interface SyncKeys {
  id: string;
  key: CryptoKey;
}

const derived = new Map<string, Promise<SyncKeys>>();

/** About half a second on a phone, so results are kept for the session. */
export function deriveSyncKeys(code: string): Promise<SyncKeys> {
  let hit = derived.get(code);
  if (!hit) {
    hit = (async () => {
      const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveBits']);
      const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: SALT, iterations: ITERATIONS }, material, 512));
      const key = await crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']);
      const id = Array.from(bits.slice(32), (b) => b.toString(16).padStart(2, '0')).join('');
      return { id, key };
    })();
    hit.catch(() => derived.delete(code));
    derived.set(code, hit);
  }
  return hit;
}

function toBase64Url(bytes: Uint8Array): string {
  // Chunked so large blobs don't overflow the argument limit of fromCharCode
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const fromBase64Url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/** JSON in, base64url(iv || ciphertext) out. The id is bound in as associated data. */
export async function encryptSync(keys: SyncKeys, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(keys.id) }, keys.key, plain));
  const out = new Uint8Array(iv.length + sealed.length);
  out.set(iv);
  out.set(sealed, iv.length);
  return toBase64Url(out);
}

export async function decryptSync<T>(keys: SyncKeys, blob: string): Promise<T> {
  const bytes = fromBase64Url(blob);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: new TextEncoder().encode(keys.id) },
    keys.key,
    bytes.slice(12)
  );
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}
