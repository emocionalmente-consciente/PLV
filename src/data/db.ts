// The local database. It holds only what users create: content lives in read-only packs.
import Dexie, { type Table } from 'dexie';
import type { AppMeta, ColorResult, CustomProfile, Examinee, Invitation, ItemAnswer, Score, Session } from './schemas';

export const STORES = {
  examinees: 'id, [paternalSurname+maternalSurname+givenName], updatedAt',
  sessions: 'id, examineeId, testDate',
  colorResults: 'sessionId',
  itemAnswers: '[sessionId+itemId], sessionId',
  scores: '[sessionId+traitId], sessionId',
  customProfiles: 'id',
  appMeta: 'key',
  invitations: 'id',
} as const;

export const DATABASE_VERSION = 1;

export type PsivDb = Dexie & {
  examinees: Table<Examinee, string>;
  sessions: Table<Session, string>;
  colorResults: Table<ColorResult, string>;
  itemAnswers: Table<ItemAnswer, [string, string]>;
  scores: Table<Score, [string, string]>;
  customProfiles: Table<CustomProfile, string>;
  appMeta: Table<AppMeta, string>;
  invitations: Table<Invitation, string>;
};

export function createDb(name = 'psiv'): PsivDb {
  const db = new Dexie(name) as PsivDb;
  db.version(DATABASE_VERSION).stores(STORES);
  return db;
}

/** Asks the browser not to evict the data under storage pressure. It may say no. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist()) ?? false;
  } catch {
    return false;
  }
}
