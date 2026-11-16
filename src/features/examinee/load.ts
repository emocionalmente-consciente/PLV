// Opens an invitation in the examinee's browser. This database is separate from the operator's, so
// an examinee link never touches examinee records, even in the operator's own browser.
import Dexie, { type EntityTable } from 'dexie';
import { PackError } from '../../content/crypto';
import { openExamineePack } from '../../content/loader';
import type { ExamineePack } from '../../content/schemas';
import { type InvitationClaims, isAllowedPackUrl, verifyToken } from '../../invitations/token';
import { type Progress, newProgress } from './progress';

interface StoredPack {
  id: string;
  file: Uint8Array<ArrayBuffer>;
}

export type ExamineeDb = Dexie & {
  progress: EntityTable<Progress, 'id'>;
  packs: EntityTable<StoredPack, 'id'>;
};

export function createExamineeDb(name = 'psiv-examinee'): ExamineeDb {
  const db = new Dexie(name) as ExamineeDb;
  db.version(1).stores({ progress: 'id', packs: 'id' });
  return db;
}

export type View =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'expired' }
  | { kind: 'failed' }
  | { kind: 'need-file'; claims: InvitationClaims; error: string | null }
  | { kind: 'ready'; claims: InvitationClaims; pack: ExamineePack; progress: Progress }
  | { kind: 'sealed'; progress: Progress };

async function ready(db: ExamineeDb, claims: InvitationClaims, file: Uint8Array<ArrayBuffer>, now: Date): Promise<View> {
  const pack = await openExamineePack(file, claims.packKey);
  await db.packs.put({ id: claims.id, file });
  // New fields get their defaults, so an examinee already under way can carry on after an update.
  const progress: Progress = { ...newProgress(claims.id, now), ...(await db.progress.get(claims.id)) };
  await db.progress.put(progress);
  return { kind: 'ready', claims, pack, progress };
}

const NO_DOWNLOAD = 'No se pudo descargar la prueba. Seleccione el archivo que le enviaron, o inténtelo más tarde.';

/** Called when the examinee picks the file sent with the link. */
export async function openPackFile(db: ExamineeDb, claims: InvitationClaims, file: Uint8Array<ArrayBuffer>, now = new Date()): Promise<View> {
  try {
    return await ready(db, claims, file, now);
  } catch (error) {
    if (error instanceof PackError) return { kind: 'need-file', claims, error: 'Este archivo no corresponde a este enlace.' };
    throw error;
  }
}

export async function loadInvitation(db: ExamineeDb, token: string, baseUrl: string, now = new Date()): Promise<View> {
  let claims: InvitationClaims;
  try {
    claims = await verifyToken(token);
  } catch {
    return { kind: 'invalid' };
  }
  const saved = await db.progress.get(claims.id);
  if (saved?.sealed) return { kind: 'sealed', progress: saved };
  // An examinee already under way can finish. A deadline is only a courtesy without a server.
  if (!saved && now.toISOString() > claims.expiresAt) return { kind: 'expired' };

  const stored = await db.packs.get(claims.id);
  if (stored) {
    const view = await openPackFile(db, claims, stored.file, now);
    if (view.kind === 'ready') return view;
  }
  if (!claims.packUrl || !isAllowedPackUrl(claims.packUrl)) return { kind: 'need-file', claims, error: null };
  try {
    const response = await fetch(new URL(claims.packUrl, baseUrl));
    if (!response.ok) return { kind: 'need-file', claims, error: NO_DOWNLOAD };
    return await openPackFile(db, claims, new Uint8Array(await response.arrayBuffer()), now);
  } catch {
    return { kind: 'need-file', claims, error: NO_DOWNLOAD };
  }
}
