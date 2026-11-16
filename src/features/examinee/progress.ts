// The examinee's place in the tests, as plain data with no React or database, so the rules can be
// tested directly and a reload can resume from the saved copy.
import type { ExamineeResponse } from '../../invitations/response';
import { DEFAULT_COLOR_PAUSE_SECONDS, type InvitationClaims, type InvitedTest } from '../../invitations/token';
import { PAUSE_QUESTIONS } from './pause-questions';

export const COLOR_PAUSE_SECONDS = DEFAULT_COLOR_PAUSE_SECONDS;
const PAUSE_QUESTION_COUNT = 3;

const DIGITS = '01234567';

const PAUSE_DONE = 'pause-done';

export type CeChoice = 'A' | 'B' | 'C';
export type InstructionPage = 'general' | InvitedTest;

export interface Progress {
  id: string;
  startedAt: string;
  consentAt: string | null;
  seen: (InstructionPage | typeof PAUSE_DONE)[];
  layout1: string;
  layout2: string;
  serie1: string;
  serie2: string;
  serie1At: string | null;
  ci: Record<string, string>;
  ciIndex: number;
  ciFinished: boolean;
  ce: Record<string, CeChoice>;
  ceIndex: number;
  ceFinished: boolean;
  sealed: string | null;
  /** When the next CI or CE question may be shown. Saved, so a reload can't skip the wait. */
  waitUntil: string | null;
  /** Positions in the question bank, chosen once so a reload shows the same three. */
  pauseQuestions: number[];
  /** Kept only during the pause, so a reload doesn't lose them. Never sent or scored. */
  pauseAnswers: string[];
}

type RandomBelow = (limit: number) => number;

const cryptoBelow: RandomBelow = (limit) => (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) % limit;

export function shuffledDigits(below: RandomBelow = cryptoBelow): string {
  const digits = [...DIGITS];
  for (let i = digits.length - 1; i > 0; i--) {
    const j = below(i + 1);
    [digits[i], digits[j]] = [digits[j] ?? '', digits[i] ?? ''];
  }
  return digits.join('');
}

function pickPauseQuestions(below: RandomBelow): number[] {
  const indexes = PAUSE_QUESTIONS.map((_, i) => i);
  for (let i = 0; i < PAUSE_QUESTION_COUNT; i++) {
    const j = i + below(indexes.length - i);
    [indexes[i], indexes[j]] = [indexes[j] ?? 0, indexes[i] ?? 0];
  }
  return indexes.slice(0, PAUSE_QUESTION_COUNT);
}

/** The cards are laid out at random, and differently for each series. */
export function newProgress(id: string, now: Date, below: RandomBelow = cryptoBelow): Progress {
  const layout1 = shuffledDigits(below);
  let layout2 = shuffledDigits(below);
  for (let tries = 0; layout2 === layout1 && tries < 20; tries++) layout2 = shuffledDigits(below);
  return {
    id,
    startedAt: now.toISOString(),
    consentAt: null,
    seen: [],
    layout1,
    layout2,
    serie1: '',
    serie2: '',
    serie1At: null,
    ci: {},
    ciIndex: 0,
    ciFinished: false,
    ce: {},
    ceIndex: 0,
    ceFinished: false,
    sealed: null,
    waitUntil: null,
    pauseQuestions: pickPauseQuestions(below),
    pauseAnswers: Array.from({ length: PAUSE_QUESTION_COUNT }, () => ''),
  };
}

/** CE also takes both Color series, and Color always comes first. */
export function testOrder(tests: readonly InvitedTest[]): InvitedTest[] {
  return tests.includes('ce') ? ['color', 'ce'] : [...tests];
}

export type Stage =
  | { kind: 'consent' }
  | { kind: 'instructions'; page: InstructionPage }
  | { kind: 'color'; serie: 1 | 2 }
  | { kind: 'pause' }
  | { kind: 'ci' }
  | { kind: 'ce' }
  | { kind: 'finish' }
  | { kind: 'done' };

export function pauseRemaining(progress: Progress, nowMs: number, seconds: number = COLOR_PAUSE_SECONDS): number {
  if (progress.serie1At === null) return seconds;
  return Math.max(0, seconds - Math.floor((nowMs - new Date(progress.serie1At).getTime()) / 1000));
}

export function currentStage(progress: Progress, tests: readonly InvitedTest[], pauseSeconds: number = COLOR_PAUSE_SECONDS): Stage {
  if (progress.sealed !== null) return { kind: 'done' };
  if (progress.consentAt === null) return { kind: 'consent' };
  if (!progress.seen.includes('general')) return { kind: 'instructions', page: 'general' };
  for (const test of testOrder(tests)) {
    if (test === 'color' && progress.serie2.length === 8) continue;
    if (test === 'ci' && progress.ciFinished) continue;
    if (test === 'ce' && progress.ceFinished) continue;
    if (!progress.seen.includes(test)) return { kind: 'instructions', page: test };
    if (test !== 'color') return { kind: test };
    if (progress.serie1.length < 8) return { kind: 'color', serie: 1 };
    // The pause ends when the examinee chooses to continue, not when the clock runs out.
    return pauseSeconds === 0 || secondSerieStarted(progress) ? { kind: 'color', serie: 2 } : { kind: 'pause' };
  }
  return { kind: 'finish' };
}

function secondSerieStarted(progress: Progress): boolean {
  return progress.seen.includes(PAUSE_DONE);
}

export function endPause(progress: Progress): Progress {
  return { ...progress, seen: [...progress.seen, PAUSE_DONE], pauseAnswers: [] };
}

export function answerPause(progress: Progress, position: number, value: string): Progress {
  return { ...progress, pauseAnswers: progress.pauseAnswers.map((answer, i) => (i === position ? value : answer)) };
}

export function pauseQuestionsAnswered(progress: Progress): boolean {
  return progress.pauseAnswers.length === PAUSE_QUESTION_COUNT && progress.pauseAnswers.every((answer) => answer.trim() !== '');
}

/** Adds one color. As with the cards, the last one left is placed without being chosen. */
export function pickColor(progress: Progress, serie: 1 | 2, digit: string, now: Date): Progress {
  const current = serie === 1 ? progress.serie1 : progress.serie2;
  if (!DIGITS.includes(digit) || digit.length !== 1 || current.includes(digit) || current.length >= 8) return progress;
  let next = current + digit;
  if (next.length === 7) next += [...DIGITS].find((d) => !next.includes(d)) ?? '';
  if (serie === 2) return { ...progress, serie2: next };
  return { ...progress, serie1: next, serie1At: next.length === 8 ? now.toISOString() : progress.serie1At };
}

export function withQuestionWait(progress: Progress, seconds: number, now: Date): Progress {
  return seconds > 0 ? { ...progress, waitUntil: new Date(now.getTime() + seconds * 1000).toISOString() } : progress;
}

export function waitRemaining(waitUntil: string, nowMs: number): number {
  return Math.max(0, Math.ceil((new Date(waitUntil).getTime() - nowMs) / 1000));
}

/** Sets or clears a CI answer. Only digits are kept for a number question. */
export function answerCi(progress: Progress, itemId: string, value: string): Progress {
  if (value !== '') return { ...progress, ci: { ...progress.ci, [itemId]: value } };
  return { ...progress, ci: Object.fromEntries(Object.entries(progress.ci).filter(([id]) => id !== itemId)) };
}

/** What gets encrypted. It has no name or other personal data, only the invitation's ID. */
export function buildResponse(progress: Progress, claims: InvitationClaims, contentVersion: string, now: Date, testDate: string): ExamineeResponse {
  if (progress.consentAt === null) throw new RangeError('No consent');
  const tests = testOrder(claims.tests);
  return {
    kind: 'psiv-response',
    schemaVersion: 1,
    invitationId: claims.id,
    contentVersion,
    consentAt: progress.consentAt,
    startedAt: progress.startedAt,
    completedAt: now.toISOString(),
    testDate,
    ...(tests.includes('color') ? { color: { serie1: progress.serie1, serie2: progress.serie2 } } : {}),
    ...(tests.includes('ci') ? { ci: progress.ci } : {}),
    ...(tests.includes('ce') ? { ce: progress.ce } : {}),
  };
}

/** Once sealed, the readable answers are erased from this browser and only the encrypted code stays. */
export function sealedProgress(progress: Progress, code: string): Progress {
  return { ...progress, layout1: '', layout2: '', serie1: '', serie2: '', ci: {}, ce: {}, pauseAnswers: [], sealed: code };
}
