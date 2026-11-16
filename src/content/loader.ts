// Opens an encrypted pack and validates it. The result lives in memory only.
import { PackError, decryptPack } from './crypto';
import {
  type ExamineePack,
  type ManualsPack,
  type OperatorPack,
  examineePackSchema,
  manualsPackSchema,
  operatorPackSchema,
} from './schemas';

interface ParseResult<T> {
  success: boolean;
  data?: T;
}

function validated<T>(result: ParseResult<T>): T {
  if (!result.success || result.data === undefined) {
    throw new PackError('invalid-content', 'El contenido del paquete no es válido.');
  }
  return result.data;
}

export async function openOperatorPack(file: Uint8Array<ArrayBuffer>, passphrase: string, minIterations?: number): Promise<OperatorPack> {
  return validated(operatorPackSchema.safeParse(await decryptPack(file, passphrase, minIterations)));
}

export async function openManualsPack(file: Uint8Array<ArrayBuffer>, passphrase: string, minIterations?: number): Promise<ManualsPack> {
  return validated(manualsPackSchema.safeParse(await decryptPack(file, passphrase, minIterations)));
}

export async function openExamineePack(file: Uint8Array<ArrayBuffer>, passphrase: string, minIterations?: number): Promise<ExamineePack> {
  return validated(examineePackSchema.safeParse(await decryptPack(file, passphrase, minIterations)));
}

/** Text variants for the qualitative selector. Legacy `Locate` finds only the first row for a full code. */
export function variantsByBaseCode(pack: OperatorPack): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const seen = new Set<string>();
  for (const text of pack.texts) {
    if (text.variant === null || seen.has(text.code)) continue;
    seen.add(text.code);
    (out[text.baseCode] ??= []).push(text.id);
  }
  return out;
}
