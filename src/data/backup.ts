// Encrypted backup and restore, replacing legacy ZLB files. A backup holds examinee data, so it uses
// the same encryption as content packs, with a passphrase the user chooses for backups.
import { PackError, decryptPack, encryptPack } from '../content/crypto';
import type { PsivDb } from './db';
import { type Backup, type BackupTables, backupSchema } from './schemas';

export const MIN_BACKUP_PASSPHRASE = 12;
export const BACKUP_EXTENSION = 'psivbackup';

export type BackupCounts = Record<keyof BackupTables, number>;

const countsOf = (tables: BackupTables): BackupCounts => ({
  examinees: tables.examinees.length,
  sessions: tables.sessions.length,
  colorResults: tables.colorResults.length,
  itemAnswers: tables.itemAnswers.length,
  scores: tables.scores.length,
  customProfiles: tables.customProfiles.length,
  appMeta: tables.appMeta.length,
  invitations: tables.invitations.length,
});

export async function databaseCounts(db: PsivDb): Promise<BackupCounts> {
  return {
    examinees: await db.examinees.count(),
    sessions: await db.sessions.count(),
    colorResults: await db.colorResults.count(),
    itemAnswers: await db.itemAnswers.count(),
    scores: await db.scores.count(),
    customProfiles: await db.customProfiles.count(),
    appMeta: await db.appMeta.count(),
    invitations: await db.invitations.count(),
  };
}

const invalid = (): PackError => new PackError('invalid-content', 'El archivo no es un respaldo válido de PsIV.');

/** Results must point at rows that exist, or a restore would leave orphans. */
function linksAreValid(tables: BackupTables): boolean {
  const examinees = new Set(tables.examinees.map((e) => e.id));
  const sessions = new Set(tables.sessions.map((s) => s.id));
  return (
    tables.sessions.every((s) => examinees.has(s.examineeId)) &&
    tables.invitations.every((i) => examinees.has(i.examineeId)) &&
    [...tables.colorResults, ...tables.itemAnswers, ...tables.scores].every((row) => sessions.has(row.sessionId))
  );
}

function parseBackup(content: unknown): Backup {
  const parsed = backupSchema.safeParse(content);
  if (!parsed.success || !linksAreValid(parsed.data.tables)) throw invalid();
  return parsed.data;
}

/** Reads a snapshot of every table in one transaction, so the tables agree with each other. */
async function readTables(db: PsivDb): Promise<BackupTables> {
  return db.transaction('r', db.tables, async () => ({
    examinees: await db.examinees.toArray(),
    sessions: await db.sessions.toArray(),
    colorResults: await db.colorResults.toArray(),
    itemAnswers: await db.itemAnswers.toArray(),
    scores: await db.scores.toArray(),
    customProfiles: await db.customProfiles.toArray(),
    appMeta: await db.appMeta.toArray(),
    invitations: await db.invitations.toArray(),
  }));
}

/**
 * Creates the encrypted file, then opens it again to prove it can be restored, because a backup
 * nobody can read is only discovered when it's needed.
 */
export async function createBackup(db: PsivDb, passphrase: string, now = new Date(), iterations?: number): Promise<Uint8Array<ArrayBuffer>> {
  if (passphrase.length < MIN_BACKUP_PASSPHRASE) throw new RangeError('The passphrase is too short');
  const backup: Backup = { kind: 'backup', schemaVersion: 1, databaseVersion: 1, createdAt: now.toISOString(), tables: await readTables(db) };
  parseBackup(backup);
  const file = await encryptPack(backup, passphrase, iterations);
  await openBackup(file, passphrase, iterations);
  return file;
}

export interface OpenedBackup {
  backup: Backup;
  counts: BackupCounts;
}

/** Decrypts and validates a backup without changing anything, so the user can review it first. */
export async function openBackup(file: Uint8Array<ArrayBuffer>, passphrase: string, minIterations?: number): Promise<OpenedBackup> {
  const backup = parseBackup(await decryptPack(file, passphrase, minIterations));
  return { backup, counts: countsOf(backup.tables) };
}

/** Replaces all local data with the backup, all or nothing. */
export async function applyBackup(db: PsivDb, backup: Backup): Promise<void> {
  const { tables } = backup;
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
    await db.examinees.bulkAdd(tables.examinees);
    await db.sessions.bulkAdd(tables.sessions);
    await db.colorResults.bulkAdd(tables.colorResults);
    await db.itemAnswers.bulkAdd(tables.itemAnswers);
    await db.scores.bulkAdd(tables.scores);
    await db.customProfiles.bulkAdd(tables.customProfiles);
    await db.appMeta.bulkAdd(tables.appMeta);
    await db.invitations.bulkAdd(tables.invitations);
  });
}
