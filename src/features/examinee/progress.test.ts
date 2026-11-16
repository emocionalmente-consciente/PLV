import { describe, expect, it } from 'vitest';
import type { InvitationClaims } from '../../invitations/token';
import { PAUSE_QUESTIONS } from './pause-questions';
import { COLOR_PAUSE_SECONDS, type Progress, answerCi, answerPause, buildResponse, currentStage, endPause, newProgress, pauseQuestionsAnswered, pauseRemaining, pickColor, sealedProgress, shuffledDigits, testOrder, waitRemaining, withQuestionWait } from './progress';

const NOW = new Date('2026-03-01T12:00:00.000Z');
const fresh = (): Progress => newProgress('id-1', NOW);
const consented = (): Progress => ({ ...fresh(), consentAt: NOW.toISOString(), seen: ['general'] });
const pickAll = (progress: Progress, serie: 1 | 2, order: string): Progress => [...order].reduce((p, digit) => pickColor(p, serie, digit, NOW), progress);

describe('card layouts', () => {
  it('uses each card once', () => {
    expect([...shuffledDigits()].sort().join('')).toBe('01234567');
  });

  it('differs between the two series', () => {
    let calls = 0;
    const progress = newProgress('x', NOW, (limit) => (calls++ < 7 ? 0 : limit - 1));
    expect(progress.layout1).not.toBe(progress.layout2);
  });
});

describe('testOrder', () => {
  it.each([
    [['color', 'ci'], ['color', 'ci']],
    [['ci'], ['ci']],
    [['ce'], ['color', 'ce']],
  ] as const)('%j runs as %j', (tests, expected) => {
    expect(testOrder(tests)).toEqual(expected);
  });
});

describe('pickColor', () => {
  it('places the last card without asking', () => {
    const picked = pickAll(consented(), 1, '0123456');
    expect(picked.serie1).toBe('01234567');
  });

  it('ignores a repeated or impossible card', () => {
    const one = pickColor(consented(), 1, '3', NOW);
    expect(pickColor(one, 1, '3', NOW)).toBe(one);
    expect(pickColor(one, 1, '9', NOW)).toBe(one);
  });

  it('times the pause from the end of the first series', () => {
    expect(pickColor(consented(), 1, '3', NOW).serie1At).toBeNull();
    expect(pickAll(consented(), 1, '0123456').serie1At).toBe(NOW.toISOString());
  });
});

describe('pauseRemaining', () => {
  const done = pickAll(consented(), 1, '0123456');

  it('counts down, and stops at zero', () => {
    expect(pauseRemaining(done, NOW.getTime())).toBe(COLOR_PAUSE_SECONDS);
    expect(pauseRemaining(done, NOW.getTime() + 60_000)).toBe(COLOR_PAUSE_SECONDS - 60);
    expect(pauseRemaining(done, NOW.getTime() + 600_000)).toBe(0);
  });
});

describe('the Color pause', () => {
  const done = pickAll(consented(), 1, '0123456');

  it('uses the seconds the sender chose', () => {
    expect(pauseRemaining(done, NOW.getTime(), 45)).toBe(45);
    expect(pauseRemaining(done, NOW.getTime() + 50_000, 45)).toBe(0);
  });

  it('is left out when the sender sets 0', () => {
    expect(currentStage({ ...done, seen: ['general', 'color'] }, ['color'], 0)).toEqual({ kind: 'color', serie: 2 });
  });

  it('shows three different questions from the bank', () => {
    for (let i = 0; i < 50; i++) {
      const { pauseQuestions } = fresh();
      expect(new Set(pauseQuestions).size).toBe(3);
      expect(pauseQuestions.every((q) => PAUSE_QUESTIONS[q] !== undefined)).toBe(true);
    }
  });

  it('has a bank that never mentions a color', () => {
    expect(PAUSE_QUESTIONS.filter((q) => /color|rojo|azul|verde|amarillo|negro|gris|violeta|café oscuro|marrón/i.test(q))).toEqual([]);
  });

  it('needs all three answers, and spaces do not count', () => {
    let p = fresh();
    expect(pauseQuestionsAnswered(p)).toBe(false);
    p = answerPause(answerPause(p, 0, 'jazz'), 1, 'tacos');
    expect(pauseQuestionsAnswered(answerPause(p, 2, '   '))).toBe(false);
    expect(pauseQuestionsAnswered(answerPause(p, 2, 'Perú'))).toBe(true);
  });

  it('erases the answers when the pause ends, and never sends them', () => {
    const answered = answerPause(fresh(), 0, 'jazz');
    expect(endPause(answered).pauseAnswers).toEqual([]);
    expect(sealedProgress(answered, 'x').pauseAnswers).toEqual([]);
    expect(JSON.stringify(buildResponse({ ...answered, consentAt: NOW.toISOString() }, CLAIMS, 'v1', NOW, '2026-03-01'))).not.toContain('jazz');
  });
});

describe('the wait between questions', () => {
  it('is set only when there is a delay', () => {
    expect(withQuestionWait(fresh(), 0, NOW).waitUntil).toBeNull();
    expect(withQuestionWait(fresh(), 5, NOW).waitUntil).toBe('2026-03-01T12:00:05.000Z');
  });

  it('counts down whole seconds, and stops at zero', () => {
    const until = '2026-03-01T12:00:05.000Z';
    expect(waitRemaining(until, NOW.getTime())).toBe(5);
    expect(waitRemaining(until, NOW.getTime() + 4100)).toBe(1);
    expect(waitRemaining(until, NOW.getTime() + 9000)).toBe(0);
  });
});

describe('answerCi', () => {
  it('sets, replaces and clears', () => {
    const one = answerCi(fresh(), 'ci:1', 'a');
    expect(one.ci).toEqual({ 'ci:1': 'a' });
    expect(answerCi(one, 'ci:1', 'b').ci).toEqual({ 'ci:1': 'b' });
    expect(answerCi(one, 'ci:1', '').ci).toEqual({});
  });
});

describe('currentStage', () => {
  const tests = ['color', 'ci'] as const;

  it('walks the whole flow in order', () => {
    let p = fresh();
    expect(currentStage(p, tests)).toEqual({ kind: 'consent' });
    p = { ...p, consentAt: NOW.toISOString() };
    expect(currentStage(p, tests)).toEqual({ kind: 'instructions', page: 'general' });
    p = { ...p, seen: ['general'] };
    expect(currentStage(p, tests)).toEqual({ kind: 'instructions', page: 'color' });
    p = { ...p, seen: ['general', 'color'] };
    expect(currentStage(p, tests)).toEqual({ kind: 'color', serie: 1 });
    p = pickAll(p, 1, '0123456');
    expect(currentStage(p, tests)).toEqual({ kind: 'pause' });
    p = endPause(p);
    expect(currentStage(p, tests)).toEqual({ kind: 'color', serie: 2 });
    p = pickColor(p, 2, '3', NOW);
    expect(currentStage(p, tests)).toEqual({ kind: 'color', serie: 2 });
    p = pickAll(p, 2, '216547');
    expect(currentStage(p, tests)).toEqual({ kind: 'instructions', page: 'ci' });
    p = { ...p, seen: [...p.seen, 'ci'] };
    expect(currentStage(p, tests)).toEqual({ kind: 'ci' });
    p = { ...p, ciFinished: true };
    expect(currentStage(p, tests)).toEqual({ kind: 'finish' });
    expect(currentStage(sealedProgress(p, 'code'), tests)).toEqual({ kind: 'done' });
  });

  it('runs Color before CE', () => {
    expect(currentStage(consented(), ['ce'])).toEqual({ kind: 'instructions', page: 'color' });
  });

  it('skips Color when only CI is assigned', () => {
    expect(currentStage(consented(), ['ci'])).toEqual({ kind: 'instructions', page: 'ci' });
  });
});

const CLAIMS: InvitationClaims = { id: '6f1c1b1e-1111-4111-8111-111111111111', tests: ['ci'], expiresAt: NOW.toISOString(), signingKey: 's', encryptionKey: 'e', packKey: 'k' };

describe('buildResponse', () => {
  it('holds only the assigned tests', () => {
    const response = buildResponse({ ...consented(), ci: { 'ci:1': 'a' } }, CLAIMS, 'v1', NOW, '2026-03-01');
    expect(response.ci).toEqual({ 'ci:1': 'a' });
    expect(response).not.toHaveProperty('color');
    expect(response).not.toHaveProperty('ce');
  });

  it('refuses without consent', () => {
    expect(() => buildResponse(fresh(), CLAIMS, 'v1', NOW, '2026-03-01')).toThrow(RangeError);
  });
});

describe('sealedProgress', () => {
  it('erases the readable answers', () => {
    const sealed = sealedProgress({ ...pickAll(consented(), 1, '0123456'), ci: { 'ci:1': 'a' }, ce: { 'ce:1': 'A' } }, 'PSIVR1.x');
    expect(sealed).toMatchObject({ serie1: '', serie2: '', ci: {}, ce: {}, sealed: 'PSIVR1.x' });
  });
});
