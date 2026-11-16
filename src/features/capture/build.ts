// Turns what the operator captured into the rows to save. There is no React or database here, so
// these rules can be tested directly. Each `apply` returns the whole record, because saving replaces
// the session's rows in one transaction.
import type { OperatorPack } from '../../content/schemas';
import { variantsByBaseCode } from '../../content/loader';
import type { SessionRecord } from '../../data/repositories';
import type { CustomProfile, ItemAnswer, Score, Session } from '../../data/schemas';
import { calculateAge, parseIsoDate } from '../../domain/age';
import { type CeAnswer, type CeRawFactors, scoreCe, sumCeFactors } from '../../domain/ce/score';
import { scoreCi } from '../../domain/ci/score';
import { scoreP4 } from '../../domain/color/p4';
import { computeProtocol } from '../../domain/color/protocol';
import { computeQualitative } from '../../domain/color/qualitative';
import { pickText, selectQualitativeTexts, textIdsForScore } from '../../domain/text/select';
import type { TraitScore } from '../../domain/traits';
import { DEFAULT_NORM_PROFILE, ENGINE_VERSION } from '../../domain/version';

export type Instrument = 'color' | 'ci' | 'ce';
export type CeOption = 'A' | 'B' | 'C';

/** Legacy's options, which follow the examinee's sex. */
export function maritalOptions(sex: 'M' | 'F'): string[] {
  return sex === 'F' ? ['SOLTERA', 'CASADA', 'DIVORCIADA', 'VIUDA', 'SEPARADA'] : ['SOLTERO', 'CASADO', 'DIVORCIADO', 'VIUDO', 'SEPARADO'];
}

export type TestDateProblem = 'invalid' | 'before-birth' | 'in-the-future';

export function testDateProblem(testDate: string, birthDate: string, today: string): TestDateProblem | null {
  if (!parseIsoDate(testDate)) return 'invalid';
  if (testDate < birthDate) return 'before-birth';
  if (testDate > today) return 'in-the-future';
  return null;
}

/** Whether the CI norms cover this age. Legacy gave an undefined result outside them. */
export function ciAgeAllowed(pack: OperatorPack, age: number): boolean {
  return pack.ci.norms.bands.some((band) => age >= band.minAge && age <= band.maxAge);
}

export interface NewSessionInput {
  id: string;
  examineeId: string;
  birthDate: string;
  testDate: string;
  maritalStatus: string | null;
  profileId: string;
  normProfileId?: string;
  administration?: 'paper' | 'screen';
}

/** The session stores its own copy of the profile, so later edits can't change an old report. */
export function newSession(pack: OperatorPack, input: NewSessionInput, customProfiles: readonly CustomProfile[] = []): Session {
  const custom = customProfiles.find((p) => p.id === input.profileId);
  const profile = custom ?? pack.profiles.find((p) => p.id === input.profileId);
  if (!profile) throw new RangeError('Profile not found');
  return {
    id: input.id,
    examineeId: input.examineeId,
    testDate: input.testDate,
    ageAtTest: calculateAge(input.birthDate, input.testDate),
    maritalStatus: input.maritalStatus,
    instruments: { color: false, ci: false, ce: false },
    profile: {
      id: profile.id,
      // Reports show only the position, without the company, as legacy does.
      name: custom ? custom.position : profile.name,
      hasRanges: profile.hasRanges,
      ranges: structuredClone(profile.ranges),
      ...(custom ? { textProfileId: custom.textProfileId } : {}),
    },
    contentVersion: pack.contentVersion,
    engineVersion: ENGINE_VERSION,
    normProfileId: input.normProfileId ?? DEFAULT_NORM_PROFILE,
    administration: input.administration ?? 'paper',
    textSeed: input.id,
  };
}

/** What can still be captured. P4 (Color and CI) and CE are separate modules, as in legacy. */
export function pendingInstruments(session: Session): Instrument[] {
  const { color, ci, ce } = session.instruments;
  if (ce) return [];
  if (color || ci) return [...(color ? [] : (['color'] as const)), ...(ci ? [] : (['ci'] as const))];
  return ['color', 'ci', 'ce'];
}

function toScores(pack: OperatorPack, session: Session, scores: readonly TraitScore[]): Score[] {
  return scores.map(({ traitId, value }) => {
    const tables = pack.traitTextTables.filter((t) => t.traitId === traitId);
    const textProfile = session.profile.textProfileId ?? session.profile.id;
    const table = tables.find((t) => t.profileIds?.includes(textProfile)) ?? tables.find((t) => t.profileIds === null) ?? tables[0];
    const options = table ? textIdsForScore(table.bands, value) : [];
    return { sessionId: session.id, traitId, value, textId: pickText(options, session.textSeed, traitId) };
  });
}

/** Replaces the given traits, and keeps scores from the other instrument. */
function mergeScores(existing: readonly Score[] | undefined, added: readonly Score[]): Score[] {
  const replaced = new Set(added.map((s) => s.traitId));
  return [...(existing ?? []).filter((s) => !replaced.has(s.traitId)), ...added];
}

function mergeAnswers(existing: readonly ItemAnswer[] | undefined, added: readonly ItemAnswer[]): ItemAnswer[] {
  const replaced = new Set(added.map((a) => a.itemId));
  return [...(existing ?? []).filter((a) => !replaced.has(a.itemId)), ...added];
}

/** Color, for Psicolaboral 4: the protocol, 14 traits and the qualitative texts. */
export function applyColor(pack: OperatorPack, record: SessionRecord, serie1: string, serie2: string): SessionRecord {
  const { session } = record;
  const qualitative = selectQualitativeTexts(computeQualitative(serie1, serie2, pack.conclusions), variantsByBaseCode(pack), session.textSeed);
  return {
    ...record,
    session: { ...session, instruments: { ...session.instruments, color: true } },
    colorResult: { sessionId: session.id, serie1, serie2, protocol: computeProtocol(serie1, serie2), qualitative },
    scores: mergeScores(record.scores, toScores(pack, session, scoreP4(serie1, serie2))),
  };
}

export interface CiTotals {
  verbal: number;
  numeric: number;
  spatial: number;
}

export function ciTotals(pack: OperatorPack, checked: ReadonlySet<string>): CiTotals {
  const totals: CiTotals = { verbal: 0, numeric: 0, spatial: 0 };
  for (const { itemId, factor } of pack.ci.key) if (checked.has(itemId)) totals[factor]++;
  return totals;
}

/**
 * CI from the tick grid. As in legacy, a tick means right and no tick means wrong, so `given` stays
 * null because the operator doesn't enter the actual answer.
 */
export function applyCi(pack: OperatorPack, record: SessionRecord, checked: ReadonlySet<string>): SessionRecord {
  const { session } = record;
  const result = scoreCi(ciTotals(pack, checked), session.ageAtTest, pack.ci.norms);
  const answers: ItemAnswer[] = pack.ci.items.map((item) => {
    const correct = checked.has(item.id);
    return { sessionId: session.id, itemId: item.id, given: null, correct, points: correct ? 1 : 0 };
  });
  return {
    ...record,
    session: { ...session, instruments: { ...session.instruments, ci: true } },
    itemAnswers: mergeAnswers(record.itemAnswers, answers),
    scores: mergeScores(record.scores, toScores(pack, session, result.scores)),
  };
}

/** Ignores case, spaces and leading zeros, so `07` counts as `7`. */
export function normalizeCiAnswer(answer: string): string {
  return answer.trim().toLowerCase().replace(/^0+(?=\d)/, '');
}

/** CI taken on screen. The answers are compared with the key here, on the operator's side only. */
export function applyCiAnswers(pack: OperatorPack, record: SessionRecord, given: Readonly<Record<string, string>>): SessionRecord {
  const checked = new Set(
    pack.ci.key
      .filter(({ itemId, answer }) => {
        const entered = given[itemId];
        return entered !== undefined && normalizeCiAnswer(entered) === normalizeCiAnswer(answer);
      })
      .map((k) => k.itemId),
  );
  const applied = applyCi(pack, record, checked);
  return { ...applied, itemAnswers: (applied.itemAnswers ?? []).map((row) => (row.itemId in given ? { ...row, given: given[row.itemId] ?? null } : row)) };
}

/** CE: both series and all the answers. Points are frozen when captured, and it has no qualitative texts. */
export function applyCe(pack: OperatorPack, record: SessionRecord, serie1: string, serie2: string, options: Readonly<Record<string, CeOption>>): SessionRecord {
  const { session } = record;
  const chosen: CeAnswer[] = pack.ce.items.map((item) => {
    const option = options[item.id];
    if (!option) throw new RangeError(`No answer for ${item.id}`);
    return { itemId: item.id, option };
  });
  const raw: CeRawFactors = sumCeFactors(chosen, pack.ce.scoring);
  const answers: ItemAnswer[] = chosen.map(({ itemId, option }) => {
    const row = pack.ce.scoring.find((s) => s.itemId === itemId);
    return { sessionId: session.id, itemId, given: option, correct: null, points: row?.points[option] ?? 0 };
  });
  return {
    ...record,
    session: { ...session, instruments: { ...session.instruments, ce: true } },
    colorResult: { sessionId: session.id, serie1, serie2, protocol: computeProtocol(serie1, serie2), qualitative: [] },
    itemAnswers: answers,
    scores: toScores(pack, session, scoreCe(serie1, serie2, raw)),
  };
}
