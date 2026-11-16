import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PackError, encryptPack } from '../content/crypto';
import { applyBackup, createBackup, databaseCounts, openBackup } from './backup';
import { type PsivDb, STORES, createDb } from './db';
import {
  type ExamineeInput,
  createExaminee,
  deleteExamineeCascade,
  deleteSessionCascade,
  examineeDeleteImpact,
  examineeProblems,
  getSessionRecord,
  listHistory,
  listSessions,
  normalizeName,
  saveSessionRecord,
  searchExaminees,
  updateExaminee,
} from './repositories';
import type { ColorResult, Session } from './schemas';

const FAST = 1000;
const PASSPHRASE = 'una frase de prueba larga';
const OTHER = 'otra frase de prueba larga';
let db: PsivDb;
let counter = 0;

const person = (over: Partial<ExamineeInput> = {}): ExamineeInput => ({
  givenName: 'Ana',
  paternalSurname: 'Núñez',
  maternalSurname: 'García',
  sex: 'F',
  birthDate: '1990-06-15',
  ...over,
});

const sessionOf = (examineeId: string, id: string, testDate = '2026-01-10'): Session => ({
  id,
  examineeId,
  testDate,
  ageAtTest: 35,
  maritalStatus: null,
  instruments: { color: true, ci: false, ce: false },
  profile: { id: 'factory:1', name: 'Perfil', hasRanges: true, ranges: { 'p4:13': { min: 30, max: 70 } } },
  contentVersion: 'demo-1',
  engineVersion: '1',
  normProfileId: 'latam',
  administration: 'paper',
  textSeed: id,
});

const colorOf = (sessionId: string): ColorResult => {
  const side = { signs: '+XX====_', marks: '.', letters: '.' };
  return { sessionId, serie1: '01234567', serie2: '76543210', protocol: { serie1: side, serie2: side }, qualitative: [{ slot: 1, baseCode: 'CA00', textId: 'p4:1' }] };
};

async function fullRecord(examineeId: string, sessionId: string): Promise<void> {
  await saveSessionRecord(db, {
    session: sessionOf(examineeId, sessionId),
    colorResult: colorOf(sessionId),
    itemAnswers: [{ sessionId, itemId: 'ci:1', given: null, correct: true, points: 1 }],
    scores: [{ sessionId, traitId: 'p4:13', value: 50, textId: 'p4:2' }],
  });
}

beforeEach(async () => {
  db = createDb(`test-${String(++counter)}`);
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

describe('schema', () => {
  it('creates every store in the data model', () => {
    expect(db.tables.map((t) => t.name).sort()).toEqual(Object.keys(STORES).sort());
  });
});

describe('examinee validation', () => {
  const today = '2026-11-06';

  it('accepts valid input, with no maternal surname', () => {
    expect(examineeProblems(person({ maternalSurname: '' }), today)).toEqual([]);
  });

  it('requires the given name and paternal surname, ignoring spaces', () => {
    expect(examineeProblems(person({ givenName: '  ', paternalSurname: '' }), today)).toEqual(['given-name-required', 'paternal-surname-required']);
  });

  it.each(['0930-01-01', '2050-01-01', '1990-02-30', ''])('rejects the birth date "%s", as legacy did not', (birthDate) => {
    expect(examineeProblems(person({ birthDate }), today)).toEqual(['birth-date-invalid']);
  });

  it('refuses to save invalid input', async () => {
    await expect(createExaminee(db, person({ birthDate: '2050-01-01' }))).rejects.toThrow(RangeError);
    expect(await db.examinees.count()).toBe(0);
  });
});

describe('examinees', () => {
  it('trims names, and gives a new UUID that is never reused', async () => {
    const a = await createExaminee(db, person({ givenName: '  Ana ' }));
    const b = await createExaminee(db, person());
    expect(a.givenName).toBe('Ana');
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.id).not.toBe(b.id);
  });

  it('updates fields and the update time, and keeps the creation time', async () => {
    const created = await createExaminee(db, person(), new Date('2026-01-01T00:00:00Z'));
    const updated = await updateExaminee(db, created.id, person({ givenName: 'Ana María' }), new Date('2026-02-01T00:00:00Z'));
    expect(updated.givenName).toBe('Ana María');
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.updatedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('throws when updating someone who does not exist', async () => {
    await expect(updateExaminee(db, 'missing', person())).rejects.toThrow(RangeError);
  });
});

describe('search', () => {
  beforeEach(async () => {
    await createExaminee(db, person());
    await createExaminee(db, person({ givenName: 'Luis', paternalSurname: 'Pérez', maternalSurname: 'López', sex: 'M' }));
    await createExaminee(db, person({ givenName: 'Ángel', paternalSurname: 'Álvarez', maternalSurname: '', sex: 'M' }));
  });

  const names = async (query: string): Promise<string[]> => (await searchExaminees(db, query)).map((e) => e.givenName);

  it('returns everyone for an empty query, sorted by surname', async () => {
    expect((await searchExaminees(db, '  ')).map((e) => e.paternalSurname)).toEqual(['Núñez', 'Pérez', 'Álvarez']);
  });

  it.each([
    ['nunez', ['Ana']],
    ['NÚÑEZ', ['Ana']],
    ['lopez', ['Luis']],
    ['ez', ['Ana', 'Luis', 'Ángel']],
    ['angel', ['Ángel']],
  ])('ignores accents and case: "%s"', async (query, expected) => {
    expect(await names(query)).toEqual(expected);
  });

  it('matches every word, in any order', async () => {
    expect(await names('garcia ana')).toEqual(['Ana']);
    expect(await names('ana perez')).toEqual([]);
  });

  it('returns nothing without a match', async () => {
    expect(await names('zzz')).toEqual([]);
  });

  it('normalizes extra spaces', () => {
    expect(normalizeName('  Ána   María ')).toBe('ana maria');
  });
});

describe('sessions', () => {
  it('lists an examinee\'s sessions, newest first', async () => {
    const e = await createExaminee(db, person());
    await saveSessionRecord(db, { session: sessionOf(e.id, 's1', '2025-01-01') });
    await saveSessionRecord(db, { session: sessionOf(e.id, 's2', '2026-01-01') });
    expect((await listSessions(db, e.id)).map((s) => s.id)).toEqual(['s2', 's1']);
  });

  it('refuses a session for someone who does not exist', async () => {
    await expect(saveSessionRecord(db, { session: sessionOf('missing', 's1') })).rejects.toThrow(RangeError);
    expect(await db.sessions.count()).toBe(0);
  });

  it('refuses a result from another session', async () => {
    const e = await createExaminee(db, person());
    await expect(saveSessionRecord(db, { session: sessionOf(e.id, 's1'), colorResult: colorOf('s2') })).rejects.toThrow(RangeError);
    expect(await db.sessions.count()).toBe(0);
  });

  it('saves all or nothing', async () => {
    const e = await createExaminee(db, person());
    const answer = { sessionId: 's1', itemId: 'ci:1', given: null, correct: true, points: 1 };
    await expect(saveSessionRecord(db, { session: sessionOf(e.id, 's1'), colorResult: colorOf('s1'), itemAnswers: [answer, answer] })).rejects.toThrow();
    expect(await db.sessions.count()).toBe(0);
    expect(await db.colorResults.count()).toBe(0);
  });

  it('replaces old rows when a session is saved again', async () => {
    const e = await createExaminee(db, person());
    await fullRecord(e.id, 's1');
    await saveSessionRecord(db, { session: sessionOf(e.id, 's1') });
    expect(await db.scores.count()).toBe(0);
    expect(await db.itemAnswers.count()).toBe(0);
    expect(await db.colorResults.count()).toBe(0);
  });
});

describe('listHistory', () => {
  it('lists every session with its examinee, newest first', async () => {
    const a = await createExaminee(db, person());
    const b = await createExaminee(db, person({ givenName: 'Luis' }));
    await saveSessionRecord(db, { session: sessionOf(a.id, 's1', '2025-01-01') });
    await saveSessionRecord(db, { session: sessionOf(b.id, 's2', '2026-01-01') });
    const rows = await listHistory(db);
    expect(rows.map((r) => r.session.id)).toEqual(['s2', 's1']);
    expect(rows[0]?.examinee.givenName).toBe('Luis');
  });
});

describe('getSessionRecord', () => {
  it('returns a session with all its results', async () => {
    const e = await createExaminee(db, person());
    await fullRecord(e.id, 's1');
    const record = await getSessionRecord(db, 's1');
    expect(record?.session.id).toBe('s1');
    expect(record?.colorResult?.serie1).toBe('01234567');
    expect(record?.itemAnswers).toHaveLength(1);
    expect(record?.scores).toHaveLength(1);
  });

  it('leaves out a color result that does not exist', async () => {
    const e = await createExaminee(db, person());
    await saveSessionRecord(db, { session: sessionOf(e.id, 's1') });
    expect((await getSessionRecord(db, 's1'))?.colorResult).toBeUndefined();
  });

  it('returns undefined for an unknown session', async () => {
    expect(await getSessionRecord(db, 'nada')).toBeUndefined();
  });
});

describe('cascading delete', () => {
  it('reports what would be removed, without removing it', async () => {
    const e = await createExaminee(db, person());
    await fullRecord(e.id, 's1');
    await fullRecord(e.id, 's2');
    expect(await examineeDeleteImpact(db, e.id)).toEqual({ sessions: 2, colorResults: 2, itemAnswers: 2, scores: 2 });
    expect(await db.sessions.count()).toBe(2);
  });

  it('removes the examinee and all their rows, and leaves everyone else alone', async () => {
    const a = await createExaminee(db, person());
    const b = await createExaminee(db, person({ givenName: 'Luis' }));
    await fullRecord(a.id, 'a1');
    await fullRecord(b.id, 'b1');
    await deleteExamineeCascade(db, a.id);
    expect((await db.examinees.toArray()).map((e) => e.id)).toEqual([b.id]);
    expect(await databaseCounts(db)).toMatchObject({ sessions: 1, colorResults: 1, itemAnswers: 1, scores: 1 });
    expect((await db.scores.toArray())[0]?.sessionId).toBe('b1');
  });

  it('removes one session, and keeps the examinee and other sessions', async () => {
    const e = await createExaminee(db, person());
    await fullRecord(e.id, 's1');
    await fullRecord(e.id, 's2');
    await deleteSessionCascade(db, 's1');
    expect(await databaseCounts(db)).toMatchObject({ examinees: 1, sessions: 1, colorResults: 1, itemAnswers: 1, scores: 1 });
  });

  it('handles someone with no sessions', async () => {
    const e = await createExaminee(db, person());
    await deleteExamineeCascade(db, e.id);
    expect(await db.examinees.count()).toBe(0);
  });
});

describe('backup', () => {
  async function seed(): Promise<void> {
    const e = await createExaminee(db, person());
    await fullRecord(e.id, 's1');
    await db.customProfiles.add({ id: crypto.randomUUID(), name: 'Mi perfil', locked: false, hasRanges: true, modules: ['p4'], ranges: { 'p4:13': { min: 1, max: 2 } }, company: '', position: 'Mi perfil', textProfileId: 'factory:1' });
    await db.appMeta.add({ key: 'ajuste', value: { a: 1 } });
    await db.invitations.add({ id: 'inv-1', examineeId: e.id, tests: ['color'], profileId: 'factory:1', normProfileId: 'latam', maritalStatus: null, createdAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-02-01T00:00:00.000Z', token: 'a.b', importedAt: null, sessionId: null });
  }

  async function dump(target: PsivDb): Promise<Record<string, unknown[]>> {
    const out: Record<string, unknown[]> = {};
    for (const table of target.tables) out[table.name] = await table.toArray();
    return out;
  }

  const fresh = async (): Promise<PsivDb> => {
    const target = createDb(`restore-${String(++counter)}`);
    await target.open();
    return target;
  };

  it('restores identically into an empty database, in every table', async () => {
    await seed();
    const file = await createBackup(db, PASSPHRASE, new Date(), FAST);
    const target = await fresh();
    const { backup, counts } = await openBackup(file, PASSPHRASE, FAST);
    await applyBackup(target, backup);
    expect(await dump(target)).toEqual(await dump(db));
    expect(Object.values(counts).every((n) => n === 1)).toBe(true);
    await target.delete();
  });

  it('restores an empty database', async () => {
    const file = await createBackup(db, PASSPHRASE, new Date(), FAST);
    const { counts } = await openBackup(file, PASSPHRASE, FAST);
    expect(Object.values(counts).every((n) => n === 0)).toBe(true);
  });

  it('replaces what was there, leaving no old rows', async () => {
    await seed();
    const file = await createBackup(db, PASSPHRASE, new Date(), FAST);
    const target = await fresh();
    const old = await createExaminee(target, person({ givenName: 'Antiguo' }));
    await applyBackup(target, (await openBackup(file, PASSPHRASE, FAST)).backup);
    expect(await target.examinees.get(old.id)).toBeUndefined();
    await target.delete();
  });

  it('does not change anything when only opening a backup', async () => {
    await seed();
    const file = await createBackup(db, PASSPHRASE, new Date(), FAST);
    const target = await fresh();
    await openBackup(file, PASSPHRASE, FAST);
    expect(await target.examinees.count()).toBe(0);
    await target.delete();
  });

  it('holds names in encrypted form only', async () => {
    await seed();
    const file = await createBackup(db, PASSPHRASE, new Date(), FAST);
    expect(new TextDecoder('latin1').decode(file)).not.toContain('Ana');
  });

  it('refuses a short passphrase', async () => {
    await expect(createBackup(db, 'corta', new Date(), FAST)).rejects.toThrow(RangeError);
  });

  const codeOf = async (action: Promise<unknown>): Promise<string> => {
    try {
      await action;
      return 'no error';
    } catch (error) {
      return error instanceof PackError ? error.code : 'other error';
    }
  };

  it('fails cleanly with a wrong passphrase', async () => {
    const file = await createBackup(db, PASSPHRASE, new Date(), FAST);
    expect(await codeOf(openBackup(file, OTHER, FAST))).toBe('wrong-passphrase');
  });

  it('rejects a content pack or other JSON', async () => {
    const file = await encryptPack({ kind: 'operator-core' }, PASSPHRASE, FAST);
    expect(await codeOf(openBackup(file, PASSPHRASE, FAST))).toBe('invalid-content');
  });

  it('rejects a backup with a result pointing at nothing', async () => {
    await seed();
    const file = await createBackup(db, PASSPHRASE, new Date(), FAST);
    const { backup } = await openBackup(file, PASSPHRASE, FAST);
    backup.tables.sessions = [];
    const edited = await encryptPack(backup, PASSPHRASE, FAST);
    expect(await codeOf(openBackup(edited, PASSPHRASE, FAST))).toBe('invalid-content');
  });

  it('rejects a backup with an invalid row', async () => {
    await seed();
    const { backup } = await openBackup(await createBackup(db, PASSPHRASE, new Date(), FAST), PASSPHRASE, FAST);
    const edited = { ...backup, tables: { ...backup.tables, examinees: backup.tables.examinees.map((e) => ({ ...e, birthDate: '1990-02-30' })) } };
    expect(await codeOf(openBackup(await encryptPack(edited, PASSPHRASE, FAST), PASSPHRASE, FAST))).toBe('invalid-content');
  });

  it('keeps the old data if the restore fails partway', async () => {
    await seed();
    const { backup } = await openBackup(await createBackup(db, PASSPHRASE, new Date(), FAST), PASSPHRASE, FAST);
    const before = await dump(db);
    // A repeated primary key makes the insert fail after the clear, inside the transaction.
    const duplicate = backup.tables.scores[0];
    if (!duplicate) throw new Error('missing fixture');
    const broken = { ...backup, tables: { ...backup.tables, scores: [duplicate, duplicate] } };
    await expect(applyBackup(db, broken)).rejects.toThrow();
    expect(await dump(db)).toEqual(before);
  });
});
