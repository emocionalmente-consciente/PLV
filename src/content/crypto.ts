// Pack encryption with WebCrypto, which browsers and Node share. AES-256-GCM with a key derived by
// PBKDF2-SHA256. The file layout is the magic bytes, a 4-byte header length, the JSON header, and
// the ciphertext of the gzipped JSON. The header is authenticated as additional data.

const MAGIC = new TextEncoder().encode('PSIVPACK');
const FORMAT_VERSION = 1;
export const DEFAULT_ITERATIONS = 600_000;
/** Refuses a weakened file. Tests pass a lower limit. */
const MIN_ITERATIONS = 100_000;
/** Limits how long a crafted file can keep the browser busy. */
const MAX_ITERATIONS = 10_000_000;

export type PackErrorCode = 'invalid-file' | 'wrong-passphrase' | 'invalid-content';

export class PackError extends Error {
  constructor(readonly code: PackErrorCode, message: string) {
    super(message);
    this.name = 'PackError';
  }
}

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

const fromBase64 = (text: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

export const compress = (bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> => transform(bytes, new CompressionStream('gzip'));
export const decompress = (bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> => transform(bytes, new DecompressionStream('gzip'));

async function transform(bytes: Uint8Array<ArrayBuffer>, stream: GenericTransformStream): Promise<Uint8Array<ArrayBuffer>> {
  const piped = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(piped).arrayBuffer());
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypts any JSON value into pack file bytes. */
export async function encryptPack(content: unknown, passphrase: string, iterations = DEFAULT_ITERATIONS): Promise<Uint8Array<ArrayBuffer>> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const header = new TextEncoder().encode(
    JSON.stringify({ v: FORMAT_VERSION, kdf: 'PBKDF2-SHA256', cipher: 'AES-256-GCM', iterations, salt: toBase64(salt), iv: toBase64(iv) }),
  );
  const plain = await transform(new TextEncoder().encode(JSON.stringify(content)), new CompressionStream('gzip'));
  const key = await deriveKey(passphrase, salt, iterations);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: header }, key, plain));

  const out = new Uint8Array(MAGIC.length + 4 + header.length + cipher.length);
  out.set(MAGIC, 0);
  new DataView(out.buffer).setUint32(MAGIC.length, header.length);
  out.set(header, MAGIC.length + 4);
  out.set(cipher, MAGIC.length + 4 + header.length);
  return out;
}

interface Header {
  iterations: number;
  salt: Uint8Array<ArrayBuffer>;
  iv: Uint8Array<ArrayBuffer>;
  raw: Uint8Array<ArrayBuffer>;
  bodyStart: number;
}

function readHeader(file: Uint8Array<ArrayBuffer>, minIterations: number): Header {
  const invalid = (): PackError => new PackError('invalid-file', 'El archivo no es un paquete de contenido válido.');
  if (file.length < MAGIC.length + 4 || !MAGIC.every((byte, i) => file[i] === byte)) throw invalid();
  const length = new DataView(file.buffer, file.byteOffset, file.byteLength).getUint32(MAGIC.length);
  const start = MAGIC.length + 4;
  if (length === 0 || length > 4096 || start + length >= file.length) throw invalid();
  const raw = file.slice(start, start + length);
  try {
    const parsed = JSON.parse(new TextDecoder().decode(raw)) as { v: unknown; iterations: unknown; salt: string; iv: string };
    const { iterations } = parsed;
    if (parsed.v !== FORMAT_VERSION || typeof iterations !== 'number' || !Number.isInteger(iterations)) throw invalid();
    if (iterations < minIterations || iterations > MAX_ITERATIONS) throw invalid();
    return { iterations, salt: fromBase64(parsed.salt), iv: fromBase64(parsed.iv), raw, bodyStart: start + length };
  } catch {
    throw invalid();
  }
}

/**
 * Decrypts pack file bytes into a JSON value. AES-GCM can't tell a wrong passphrase from a damaged
 * file, so both report `wrong-passphrase`, and the message says so.
 */
export async function decryptPack(file: Uint8Array<ArrayBuffer>, passphrase: string, minIterations = MIN_ITERATIONS): Promise<unknown> {
  const header = readHeader(file, minIterations);
  let plain: Uint8Array<ArrayBuffer>;
  try {
    const key = await deriveKey(passphrase, header.salt, header.iterations);
    const body = file.slice(header.bodyStart);
    plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: header.iv, additionalData: header.raw }, key, body));
  } catch {
    throw new PackError('wrong-passphrase', 'La frase de acceso es incorrecta, o el archivo está dañado.');
  }
  try {
    return JSON.parse(new TextDecoder().decode(await transform(plain, new DecompressionStream('gzip'))));
  } catch {
    throw new PackError('invalid-content', 'El contenido del paquete no es válido.');
  }
}
