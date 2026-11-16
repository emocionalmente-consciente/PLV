// The operator's key pairs: one signs links, the other receives encrypted answers. They live in
// `appMeta`, so backups carry them. Losing them loses every result still pending.
import { z } from 'zod';
import { toBase64Url } from './token';

const jwkSchema = z.looseObject({ kty: z.literal('EC'), crv: z.literal('P-256'), x: z.string().min(1), y: z.string().min(1) });
const pairSchema = z.strictObject({ publicJwk: jwkSchema, privateJwk: jwkSchema });

export const operatorKeysSchema = z.strictObject({ createdAt: z.string(), signing: pairSchema, encryption: pairSchema });

export type OperatorKeys = z.infer<typeof operatorKeysSchema>;

const SIGNING = { name: 'ECDSA', namedCurve: 'P-256' };
const ENCRYPTION = { name: 'ECDH', namedCurve: 'P-256' };

async function exportPair(pair: CryptoKeyPair): Promise<z.infer<typeof pairSchema>> {
  return pairSchema.parse({
    publicJwk: await crypto.subtle.exportKey('jwk', pair.publicKey),
    privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey),
  });
}

export async function generateOperatorKeys(now = new Date()): Promise<OperatorKeys> {
  const signing = await crypto.subtle.generateKey(SIGNING, true, ['sign', 'verify']);
  const encryption = await crypto.subtle.generateKey(ENCRYPTION, true, ['deriveBits']);
  return { createdAt: now.toISOString(), signing: await exportPair(signing), encryption: await exportPair(encryption) };
}

async function rawPublic(jwk: JsonWebKey, algorithm: EcKeyImportParams, usages: KeyUsage[]): Promise<string> {
  const key = await crypto.subtle.importKey('jwk', jwk, algorithm, true, usages);
  return toBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
}

/** The compact public keys that go in a link. */
export async function publicKeysForToken(keys: OperatorKeys): Promise<{ signingKey: string; encryptionKey: string }> {
  return {
    signingKey: await rawPublic(keys.signing.publicJwk, SIGNING, ['verify']),
    encryptionKey: await rawPublic(keys.encryption.publicJwk, ENCRYPTION, []),
  };
}
