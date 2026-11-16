// Reads and writes for examinees and sessions. Anything that touches several tables runs in one
// transaction, so a failure can't leave part of a record behind.
import { isValidBirthDate, todayIso } from '../domain/age';
import type { PsivDb } from './db';
import type { ColorResult, CustomProfile, Examinee, ItemAnswer, Score, Session } from './schemas';

export interface ExamineeInput {
  givenName: string;
  paternalSurname: string;
  maternalSurname: string;
  sex: 'M' | 'F';
  birthDate: string;
}

export type ExamineeProblem = 'given-name-required' | 'paternal-surname-required' | 'birth-date-invalid';

/** Field problems for a form to show. An empty list means the input is valid. */
export function examineeProblems(input: ExamineeInput, today: string = todayIso()): ExamineeProblem[] {
  const problems: ExamineeProblem[] = [];
  if (input.givenName.trim() === '') problems.push('given-name-required');
  if (input.paternalSurname.trim() === '') problems.push('paternal-surname-required');
  if (!isValidBirthDate(input.birthDate, today)) problems.push('birth-date-invalid');
  return problems;
}

function assertValid(input: ExamineeInput): void {
  const problems = examineeProblems(input);
  if (problems.length > 0) throw new RangeError(`Invalid examinee: ${problems.join(', ')}`);
}

const cleaned = (input: ExamineeInput): ExamineeInput => ({
  givenName: input.givenName.trim(),
  paternalSurname: input.paternalSurname.trim(),
  maternalSurname: input.maternalSurname.trim(),
  sex: input.sex,
  birthDate: input.birthDate,
});

export async function createExaminee(db: PsivDb, input: ExamineeInput, now = new Date()): Promise<Examinee> {
  assertValid(input);
  const stamp = now.toISOString();
  const examinee: Examinee = { id: crypto.randomUUID(), ...cleaned(input), createdAt: stamp, updatedAt: stamp };
  await db.examinees.add(examinee);
  return examinee;
}

export async function updateExaminee(db: PsivDb, id: string, input: ExamineeInput, now = new Date()): Promise<Examinee> {
  assertValid(input);
  return db.transaction('rw', db.examinees, async () => {
    const existing = await db.examinees.get(id);
    if (!existing) throw new RangeError('Examinee not found');
    const updated: Examinee = { ...existing, ...cleaned(input), updatedAt: now.toISOString() };
    await db.examinees.put(updated);
    return updated;
  });
}

/** Lower case with no accents, so that `nunez` finds `Núñez`. */
export function normalizeName(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Every word of the query must appear somewhere in the name, in any order. Sorted by surname. */
export async function searchExaminees(db: PsivDb, query: string): Promise<Examinee[]> {
  const words = normalizeName(query).split(' ').filter(Boolean);
  const all = await db.examinees.orderBy('[paternalSurname+maternalSurname+givenName]').toArray();
  return all.filter((e) => {
    const name = normalizeName(`${e.givenName} ${e.paternalSurname} ${e.maternalSurname}`);
    return words.every((word) => name.includes(word));
  });
}

export interface DeleteImpact {
  sessions: number;
  colorResults: number;
  itemAnswers: number;
  scores: number;
}

/** What deleting an examinee would remove, so a confirmation can say so before anything changes. */
export async function examineeDeleteImpact(db: PsivDb, examineeId: string): Promise<DeleteImpact> {
  const sessionIds = await db.sessions.where('examineeId').equals(examineeId).primaryKeys();
  return {
    sessions: sessionIds.length,
    colorResults: await db.colorResults.where('sessionId').anyOf(sessionIds).count(),
    itemAnswers: await db.itemAnswers.where('sessionId').anyOf(sessionIds).count(),
    scores: await db.scores.where('sessionId').anyOf(sessionIds).count(),
  };
}

const RESULT_TABLES = (db: PsivDb) => [db.sessions, db.colorResults, db.itemAnswers, db.scores];

async function deleteSessionRows(db: PsivDb, sessionIds: string[]): Promise<void> {
  await db.colorResults.where('sessionId').anyOf(sessionIds).delete();
  await db.itemAnswers.where('sessionId').anyOf(sessionIds).delete();
  await db.scores.where('sessionId').anyOf(sessionIds).delete();
  await db.sessions.bulkDelete(sessionIds);
}

/** Removes an examinee and everything under them. The caller must confirm with the user first. */
export async function deleteExamineeCascade(db: PsivDb, examineeId: string): Promise<void> {
  await db.transaction('rw', [db.examinees, db.invitations, ...RESULT_TABLES(db)], async () => {
    const sessionIds = await db.sessions.where('examineeId').equals(examineeId).primaryKeys();
    await deleteSessionRows(db, sessionIds);
    await db.invitations.filter((invitation) => invitation.examineeId === examineeId).delete();
    await db.examinees.delete(examineeId);
  });
}

/** Removes one session and its results. The caller must confirm with the user first. */
export async function deleteSessionCascade(db: PsivDb, sessionId: string): Promise<void> {
  await db.transaction('rw', RESULT_TABLES(db), async () => {
    await deleteSessionRows(db, [sessionId]);
  });
}

export interface SessionRecord {
  session: Session;
  colorResult?: ColorResult;
  itemAnswers?: ItemAnswer[];
  scores?: Score[];
}

/** Saves a session with its results, all or nothing. Rewriting a session replaces its old rows. */
export async function saveSessionRecord(db: PsivDb, record: SessionRecord): Promise<void> {
  const { session, colorResult, itemAnswers = [], scores = [] } = record;
  const foreign = [colorResult, ...itemAnswers, ...scores].some((row) => row && row.sessionId !== session.id);
  if (foreign) throw new RangeError('A result belongs to a different session');

  await db.transaction('rw', [db.examinees, ...RESULT_TABLES(db)], async () => {
    if (!(await db.examinees.get(session.examineeId))) throw new RangeError('Examinee not found');
    await deleteSessionRows(db, [session.id]);
    await db.sessions.add(session);
    if (colorResult) await db.colorResults.add(colorResult);
    await db.itemAnswers.bulkAdd(itemAnswers);
    await db.scores.bulkAdd(scores);
  });
}

/** A session with all its results, or undefined when it doesn't exist. */
export async function getSessionRecord(db: PsivDb, sessionId: string): Promise<SessionRecord | undefined> {
  return db.transaction('r', RESULT_TABLES(db), async () => {
    const session = await db.sessions.get(sessionId);
    if (!session) return undefined;
    const colorResult = await db.colorResults.get(sessionId);
    return {
      session,
      ...(colorResult ? { colorResult } : {}),
      itemAnswers: await db.itemAnswers.where('sessionId').equals(sessionId).toArray(),
      scores: await db.scores.where('sessionId').equals(sessionId).toArray(),
    };
  });
}

export async function listCustomProfiles(db: PsivDb): Promise<CustomProfile[]> {
  const profiles = await db.customProfiles.toArray();
  return profiles.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createCustomProfile(db: PsivDb, profile: CustomProfile): Promise<void> {
  await db.customProfiles.add(profile);
}

export async function updateCustomProfile(db: PsivDb, profile: CustomProfile): Promise<void> {
  await db.customProfiles.put(profile);
}

/** Sessions keep their own copy of a profile, so deleting one changes no saved report. */
export async function deleteCustomProfile(db: PsivDb, id: string): Promise<void> {
  await db.customProfiles.delete(id);
}

export interface HistoryRow {
  session: Session;
  examinee: Examinee;
}

/** Every session with its examinee, newest first. */
export async function listHistory(db: PsivDb): Promise<HistoryRow[]> {
  const [sessions, examinees] = await Promise.all([db.sessions.orderBy('testDate').reverse().toArray(), db.examinees.toArray()]);
  const byId = new Map(examinees.map((e) => [e.id, e]));
  return sessions.flatMap((session) => {
    const examinee = byId.get(session.examineeId);
    return examinee ? [{ session, examinee }] : [];
  });
}

export async function listSessions(db: PsivDb, examineeId: string): Promise<Session[]> {
  const sessions = await db.sessions.where('examineeId').equals(examineeId).toArray();
  return sessions.sort((a, b) => b.testDate.localeCompare(a.testDate));
}
