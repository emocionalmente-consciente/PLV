// The examinee's answers, encrypted to the operator's public key: a fresh ECDH P-256 key, HKDF-SHA256
// and AES-256-GCM. The result is short plain text, so it can go in a file or be pasted in a message.
// Only the operator can open it, and nothing is scored until they do.
import { z } from 'zod';
import { compress, decompress } from '../content/crypto';
import { parseIsoDate } from '../domain/age';
import { isCompleteSerie } from '../domain/color/serie';
import { InvitationError, fromBase64Url, toBase64Url } from './token';

const PREFIX = 'PSIVR1.';
const INFO = new TextEncoder().encode('psiv-response-1');
const PUBLIC_LENGTH = 65;
const IV_LENGTH = 12;
/** Far above a real response, and small enough that a crafted one can't do harm. */
const MAX_CODE_LENGTH = 20_000;
const ECDH = { name: 'ECDH', namedCurve: 'P-256' };

const serie = z.string().refine(isCompleteSerie);

export const responseSchema = z.strictObject({
  kind: z.literal('psiv-response'),
  schemaVersion: z.literal(1),
  invitationId: z.uuid(),
  contentVersion: z.string().min(1),
  consentAt: z.iso.datetime(),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime(),
  /** The date on the examinee's device, which sets the age. The operator can correct it. */
  testDate: z.string().refine((value) => parseIsoDate(value) !== null),
  color: z.strictObject({ serie1: serie, serie2: serie }).optional(),
  ci: z.record(z.string().regex(/^ci:\d+$/), z.string().min(1).max(8)).optional(),
  ce: z.record(z.string().regex(/^ce:\d+$/), z.enum(['A', 'B', 'C'])).optional(),
});

export type ExamineeResponse = z.infer<typeof responseSchema>;

async function aesKey(shared: ArrayBuffer, salt: Uint8Array<ArrayBuffer>, usage: KeyUsage): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: INFO }, base, { name: 'AES-GCM', length: 256 }, false, [usage]);
}

export async function sealResponse(response: ExamineeResponse, encryptionKey: string): Promise<string> {
  const recipient = await crypto.subtle.importKey('raw', fromBase64Url(encryptionKey), ECDH, false, []);
  const ephemeral = await crypto.subtle.generateKey(ECDH, true, ['deriveBits']);
  const publicBytes = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey));
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: recipient }, ephemeral.privateKey, 256);
  const key = await aesKey(shared, publicBytes, 'encrypt');
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const plain = await compress(new TextEncoder().encode(JSON.stringify(responseSchema.parse(response))));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: publicBytes }, key, plain));
  const out = new Uint8Array(PUBLIC_LENGTH + IV_LENGTH + cipher.length);
  out.set(publicBytes, 0);
  out.set(iv, PUBLIC_LENGTH);
  out.set(cipher, PUBLIC_LENGTH + IV_LENGTH);
  return PREFIX + toBase64Url(out);
}

const invalid = (): InvitationError => new InvitationError('invalid-response', 'El código o archivo no es una respuesta válida, está incompleto, o corresponde a otras claves.');

/** Spaces and line breaks are removed, because mail programs add them to long text. */
export async function openSealedResponse(code: string, encryptionPrivateJwk: JsonWebKey): Promise<ExamineeResponse> {
  const compact = code.replace(/\s+/g, '');
  if (!compact.startsWith(PREFIX) || compact.length > MAX_CODE_LENGTH) throw invalid();
  try {
    const bytes = fromBase64Url(compact.slice(PREFIX.length));
    const publicBytes = bytes.slice(0, PUBLIC_LENGTH);
    const iv = bytes.slice(PUBLIC_LENGTH, PUBLIC_LENGTH + IV_LENGTH);
    const sender = await crypto.subtle.importKey('raw', publicBytes, ECDH, false, []);
    const own = await crypto.subtle.importKey('jwk', encryptionPrivateJwk, ECDH, false, ['deriveBits']);
    const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: sender }, own, 256);
    const key = await aesKey(shared, publicBytes, 'decrypt');
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: publicBytes }, key, bytes.slice(PUBLIC_LENGTH + IV_LENGTH)));
    return responseSchema.parse(JSON.parse(new TextDecoder().decode(await decompress(plain))));
  } catch {
    throw invalid();
  }
}
