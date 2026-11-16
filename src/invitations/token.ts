// The invitation link: `#/e/<payload>.<signature>`. The fragment is never sent to a server.
//
// The payload holds only what the examinee's browser needs, and the schema is strict, so a name or a
// birth date can't be added by accident. The signature is checked against the key in the token, so
// it catches a damaged or edited link. Replacing the key as well gives a link whose answers the
// operator can't read, so a forged link can't return results as if it were real.
import { z } from 'zod';

export type InvitedTest = 'color' | 'ci' | 'ce';

export type InvitationErrorCode = 'invalid-link' | 'invalid-response' | 'no-keys' | 'unknown-invitation' | 'already-imported';

export class InvitationError extends Error {
  constructor(readonly code: InvitationErrorCode, message: string) {
    super(message);
    this.name = 'InvitationError';
  }
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new RangeError('Not base64url');
  const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** P4 is Color and CI, and CE is its own module, as in legacy. CE also takes both Color series. */
const VALID_TESTS = new Set(['color', 'ci', 'color,ci', 'ce']);

export const testsSchema = z.array(z.enum(['color', 'ci', 'ce'])).refine((tests) => VALID_TESTS.has(tests.join(',')));

export const MAX_QUESTION_DELAY_SECONDS = 600;
/** The book asks for a gap of a few minutes between the two Color selections. */
export const DEFAULT_COLOR_PAUSE_SECONDS = 180;
export const MAX_COLOR_PAUSE_SECONDS = 1800;

const rawPublicKey = z.string().regex(/^[A-Za-z0-9_-]{87}$/);

const payloadSchema = z.strictObject({
  v: z.literal(1),
  i: z.uuid(),
  t: testsSchema,
  x: z.iso.datetime(),
  s: rawPublicKey,
  e: rawPublicKey,
  k: z.string().min(1).max(128),
  u: z.string().min(1).max(500).optional(),
  q: z.number().int().min(1).max(MAX_QUESTION_DELAY_SECONDS).optional(),
  p: z.number().int().min(0).max(MAX_COLOR_PAUSE_SECONDS).optional(),
});

export interface InvitationClaims {
  id: string;
  tests: InvitedTest[];
  expiresAt: string;
  signingKey: string;
  encryptionKey: string;
  packKey: string;
  packUrl?: string;
  /** The wait between CI and CE questions. Left out when there is none. */
  questionDelaySeconds?: number;
  /** The gap between the Color selections. Left out for the default, and 0 means no gap. */
  colorPauseSeconds?: number;
}

const ECDSA = { name: 'ECDSA', hash: 'SHA-256' };
const P256 = { name: 'ECDSA', namedCurve: 'P-256' };

export async function signToken(claims: InvitationClaims, signingPrivateJwk: JsonWebKey): Promise<string> {
  const payload: z.infer<typeof payloadSchema> = {
    v: 1,
    i: claims.id,
    t: claims.tests,
    x: claims.expiresAt,
    s: claims.signingKey,
    e: claims.encryptionKey,
    k: claims.packKey,
    ...(claims.packUrl ? { u: claims.packUrl } : {}),
    ...(claims.questionDelaySeconds ? { q: claims.questionDelaySeconds } : {}),
    ...(claims.colorPauseSeconds !== undefined ? { p: claims.colorPauseSeconds } : {}),
  };
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payloadSchema.parse(payload))));
  const key = await crypto.subtle.importKey('jwk', signingPrivateJwk, P256, false, ['sign']);
  const signature = await crypto.subtle.sign(ECDSA, key, new TextEncoder().encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

const invalidLink = (): InvitationError => new InvitationError('invalid-link', 'Este enlace no es válido o está incompleto.');

export async function verifyToken(token: string): Promise<InvitationClaims> {
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra !== undefined) throw invalidLink();
  let parsed: z.infer<typeof payloadSchema>;
  let valid: boolean;
  try {
    parsed = payloadSchema.parse(JSON.parse(new TextDecoder().decode(fromBase64Url(body))));
    const key = await crypto.subtle.importKey('raw', fromBase64Url(parsed.s), P256, false, ['verify']);
    valid = await crypto.subtle.verify(ECDSA, key, fromBase64Url(signature), new TextEncoder().encode(body));
  } catch {
    throw invalidLink();
  }
  if (!valid) throw invalidLink();
  return {
    id: parsed.i,
    tests: parsed.t,
    expiresAt: parsed.x,
    signingKey: parsed.s,
    encryptionKey: parsed.e,
    packKey: parsed.k,
    ...(parsed.u ? { packUrl: parsed.u } : {}),
    ...(parsed.q ? { questionDelaySeconds: parsed.q } : {}),
    ...(parsed.p !== undefined ? { colorPauseSeconds: parsed.p } : {}),
  };
}

/** The token in a location hash, or null when this isn't an examinee link. */
export function tokenFromHash(hash: string): string | null {
  return /^#\/e\/([^/?#]+)$/.exec(hash)?.[1] ?? null;
}

/** A pack may come from HTTPS, or from next to the app with a relative path. */
export function isAllowedPackUrl(url: string): boolean {
  if (/^https:\/\/[^\s]+$/i.test(url)) return true;
  return /^[\w-]+(\/[\w.-]+)*$/.test(url);
}
