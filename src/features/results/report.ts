// Builds what the result screens show from a saved session. There is no React here, so the order of a
// report can be tested directly. The order follows VerInformeG32.pas and VerInformeCeG32.pas.
import type { OperatorPack } from '../../content/schemas';
import type { SessionRecord } from '../../data/repositories';
import type { ColorResult, Examinee, Score, Session } from '../../data/schemas';
import { parseIsoDate } from '../../domain/age';
import { type CiLevel, ciLevel } from '../../domain/ci/score';
import { P4_TRAITS } from '../../domain/traits';

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function formatLongDate(iso: string): string {
  const date = parseIsoDate(iso);
  if (!date) return iso;
  const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  return `${DAYS[weekday] ?? ''}, ${String(date.day)} de ${MONTHS[date.month - 1] ?? ''} de ${String(date.year)}`;
}

export type ReportModule = 'p4' | 'ce';
export const moduleOf = (session: Session): ReportModule => (session.instruments.ce ? 'ce' : 'p4');

export interface CiFactorLine {
  label: string;
  value: number;
  level: CiLevel | null;
  /** Legacy prints a minus after any score under 80. */
  belowAverage: boolean;
}

export type ReportBlock =
  | { type: 'section'; key: string; text: string }
  | { type: 'html'; key: string; html: string }
  | { type: 'ci'; key: string; rawTotal: number; global: CiFactorLine; factors: CiFactorLine[] }
  | { type: 'trait'; key: string; code: string; name: string; value: number; html: string | null; missingText: boolean };

export interface Report {
  title: string;
  blocks: ReportBlock[];
}

const BELOW_AVERAGE = 80;
const line = (label: string, value: number): CiFactorLine => ({ label, value, level: ciLevel(value), belowAverage: value < BELOW_AVERAGE });

export const compareCodes = (a: string, b: string): number => a.localeCompare(b, undefined, { numeric: true });

function textOf(pack: OperatorPack, textId: string | null): string | undefined {
  return textId === null ? undefined : pack.texts.find((t) => t.id === textId)?.html;
}

function traitBlock(pack: OperatorPack, score: Score): ReportBlock {
  const trait = pack.traits.find((t) => t.id === score.traitId);
  const html = textOf(pack, score.textId);
  const hasTable = pack.traitTextTables.some((t) => t.traitId === score.traitId);
  return {
    type: 'trait',
    key: `trait-${score.traitId}`,
    code: trait?.reportCode ?? '',
    name: trait?.name ?? score.traitId,
    value: score.value,
    html: html ?? null,
    // The trait normally has text, but none applies: no band for this score, or a later pack removed it.
    missingText: html === undefined && hasTable,
  };
}

function traitsWithCode(pack: OperatorPack, scores: readonly Score[], matches: (code: string) => boolean): ReportBlock[] {
  const code = (score: Score): string => pack.traits.find((t) => t.id === score.traitId)?.reportCode ?? '';
  return scores
    .filter((score) => matches(code(score)))
    .sort((a, b) => compareCodes(code(a), code(b)))
    .map((score) => traitBlock(pack, score));
}

function ciBlock(record: SessionRecord): ReportBlock | null {
  if (!record.session.instruments.ci) return null;
  const valueOf = (traitId: string): number => record.scores?.find((s) => s.traitId === traitId)?.value ?? 0;
  const rawTotal = (record.itemAnswers ?? []).filter((a) => a.itemId.startsWith('ci:')).reduce((sum, a) => sum + a.points, 0);
  return {
    type: 'ci',
    key: 'ci',
    rawTotal,
    global: line('C.I. (Factor G)', valueOf(P4_TRAITS.ciGlobal)),
    // Legacy prints these in this order, which isn't the order of the trait codes.
    factors: [
      line('Factor Verbal', valueOf(P4_TRAITS.factorVerbal)),
      line('Factor Espacial', valueOf(P4_TRAITS.factorEspacial)),
      line('Factor Numérico', valueOf(P4_TRAITS.factorNumerico)),
    ],
  };
}

function qualitative(pack: OperatorPack, result: ColorResult | undefined, first: number, last: number): ReportBlock[] {
  return (result?.qualitative ?? []).flatMap((slot) => {
    if (slot.slot < first || slot.slot > last) return [];
    const html = textOf(pack, slot.textId);
    return html === undefined ? [] : [{ type: 'html' as const, key: `slot-${String(slot.slot)}`, html }];
  });
}

function buildP4Report(pack: OperatorPack, record: SessionRecord): Report {
  const { colorResult, scores = [], session } = record;
  const ci = ciBlock(record);
  const blocks: ReportBlock[] = [{ type: 'section', key: 'ci-title', text: ci ? 'I. PERFIL INTELECTUAL:' : 'I. Perfil Intelectual No Aplicado' }];
  if (ci) blocks.push(ci);
  if (session.instruments.color) {
    // Legacy prints slot 39, a heading, before the III traits, and its text, slot 40, after them.
    blocks.push(...qualitative(pack, colorResult, 1, 39));
    blocks.push(...traitsWithCode(pack, scores, (code) => code.startsWith('III')));
    blocks.push(...qualitative(pack, colorResult, 40, 40));
    blocks.push({ type: 'section', key: 'iv-title', text: 'IV. INTELIGENCIA EMOCIONAL:' });
    blocks.push(...traitsWithCode(pack, scores, (code) => code.startsWith('IV')));
    blocks.push(...qualitative(pack, colorResult, 41, 42));
  }
  return { title: 'INFORME PSICOLABORAL', blocks };
}

function buildCeReport(pack: OperatorPack, record: SessionRecord): Report {
  return { title: 'INFORME', blocks: traitsWithCode(pack, record.scores ?? [], () => true) };
}

export function buildReport(pack: OperatorPack, record: SessionRecord): Report {
  return moduleOf(record.session) === 'ce' ? buildCeReport(pack, record) : buildP4Report(pack, record);
}

export interface ProtocolSide {
  digits: string[];
  signs: string[];
  /** Number of `!` marks for each of the eight positions, from 0 to 3. */
  marks: number[];
  letters: string[];
}

function protocolSide(serie: string, side: ColorResult['protocol']['serie1']): ProtocolSide {
  const marks = side.marks === '.' ? '' : side.marks.padEnd(24, ' ');
  const letters = side.letters === '.' ? '' : side.letters.padEnd(8, ' ');
  return {
    digits: [...serie],
    signs: [...side.signs].map((sign) => (sign === '_' ? '−' : sign)),
    marks: Array.from({ length: 8 }, (_, i) => [...marks.slice(i * 3, i * 3 + 3)].filter((c) => c === '!').length),
    letters: Array.from({ length: 8 }, (_, i) => (letters.charAt(i) === ' ' ? '' : letters.charAt(i))),
  };
}

export function protocolOf(result: ColorResult): { serie1: ProtocolSide; serie2: ProtocolSide } {
  return { serie1: protocolSide(result.serie1, result.protocol.serie1), serie2: protocolSide(result.serie2, result.protocol.serie2) };
}

export interface ChartRow {
  traitId: string;
  name: string;
  minimum: number | null;
  maximum: number | null;
  score: number | null;
}

export interface ChartData {
  rows: ChartRow[];
  axisMax: number;
}

const AXIS_MAX: Record<ReportModule, number> = { p4: 150, ce: 100 };

/** One row per trait of the module, in report order, as in the legacy chart. A trait not yet captured has no score. */
export function buildChart(pack: OperatorPack, session: Session, scores: readonly Score[], ranges: Readonly<Record<string, { min: number; max: number }>>): ChartData {
  const module = moduleOf(session);
  const rows = pack.traits
    .filter((t) => t.module === module)
    .sort((a, b) => compareCodes(a.reportCode, b.reportCode))
    .map((t) => ({
      traitId: t.id,
      name: t.name,
      minimum: ranges[t.id]?.min ?? null,
      maximum: ranges[t.id]?.max ?? null,
      score: scores.find((s) => s.traitId === t.id)?.value ?? null,
    }));
  const highest = Math.max(AXIS_MAX[module], ...rows.flatMap((r) => [r.minimum ?? 0, r.maximum ?? 0, r.score ?? 0]));
  return { rows, axisMax: Math.ceil(highest / 10) * 10 };
}

export function capturedSummary(session: Session): string {
  const { color, ci, ce } = session.instruments;
  return [color && 'Colores', ci && 'C.I.', ce && 'C.E.'].filter(Boolean).join(' y ') || 'Sin capturar';
}

export const sexLabel = (examinee: Examinee): string => (examinee.sex === 'F' ? 'Femenino' : 'Masculino');
