// Builds the infographic report from a saved session: summary figures, scored bars with a tone for
// each trait, and a follow-up plan whose cards are chosen by rules over the scores and the color
// result codes. There is no React here, so the rules can be tested directly. The labels are short
// summaries written for this view, never the pack's report texts.
import type { OperatorPack } from '../../content/schemas';
import type { SessionRecord } from '../../data/repositories';
import type { CiLevel } from '../../domain/ci/score';
import { P4_TRAITS } from '../../domain/traits';
import { type CiFactorLine, ciBlock, moduleOf } from './report';

export type Tone = 'strong' | 'avg' | 'watch' | 'alert';
export type Trend = 'up' | 'flat' | 'down';

export interface Status {
  code: string;
  label: string;
  tone: Tone;
}

export interface Evolution {
  code: string;
  label: string;
  trend: Trend;
}

/** Score bands for the trait bars, from 0 to 100. */
export const BANDS = { priority: 35, low: 45, high: 60, riskHigh: 80, inverseWatch: 60, inverseAlert: 75 } as const;

const TONE_LABEL: Record<Tone, string> = { strong: 'Fortaleza', avg: 'Promedio', watch: 'Vigilar', alert: 'Prioridad' };

/** Traits where a very high score carries a risk as well as a strength. */
const RISK_WHEN_HIGH: ReadonlySet<string> = new Set([P4_TRAITS.liderazgo, P4_TRAITS.responsabilidad]);
/** Traits where a higher score means more concern. */
const INVERSE: ReadonlySet<string> = new Set([P4_TRAITS.percepcionSalud]);

export interface TraitBar {
  traitId: string;
  name: string;
  value: number;
  tone: Tone;
  label: string;
}

export function classifyTrait(traitId: string, value: number): { tone: Tone; label: string } {
  if (INVERSE.has(traitId)) {
    if (value >= BANDS.inverseAlert) return { tone: 'alert', label: TONE_LABEL.alert };
    if (value >= BANDS.inverseWatch) return { tone: 'watch', label: TONE_LABEL.watch };
    return { tone: 'avg', label: TONE_LABEL.avg };
  }
  if (value < BANDS.priority) return { tone: 'alert', label: TONE_LABEL.alert };
  if (value < BANDS.low) return { tone: 'watch', label: TONE_LABEL.watch };
  if (value <= BANDS.high) return { tone: 'avg', label: TONE_LABEL.avg };
  if (RISK_WHEN_HIGH.has(traitId) && value >= BANDS.riskHigh) return { tone: 'watch', label: 'Alto · riesgo' };
  return { tone: 'strong', label: TONE_LABEL.strong };
}

// Result codes from the color engine (domain/color/qualitative.ts), by slot.
const SLOT = { stability: 2, stabilityEvolution: 35, forecast: 37, forecastEvolution: 40, conclusion: 42 } as const;

const VERDICTS: Record<string, Omit<Status, 'code'>> = {
  CM01: { label: 'Recomendable', tone: 'strong' },
  CM02: { label: 'Contratable', tone: 'strong' },
  CM03: { label: 'Aceptable con reservas', tone: 'watch' },
  CM04: { label: 'Rechazable', tone: 'alert' },
};

const STABILITY: Record<string, Omit<Status, 'code'>> = {
  CB01: { label: 'Estabilidad buena', tone: 'strong' },
  CB02: { label: 'Conflictos menores', tone: 'avg' },
  CB03: { label: 'Estabilidad aceptable', tone: 'avg' },
  CB04: { label: 'Conflictos de gravedad media', tone: 'watch' },
  CB05: { label: 'Un conflicto serio', tone: 'alert' },
  CB06: { label: 'Varios conflictos medios', tone: 'alert' },
  CB07: { label: 'Un conflicto grave y otros', tone: 'alert' },
  CB08: { label: 'Estabilidad deteriorada', tone: 'alert' },
  CB09: { label: 'Varios conflictos, riesgo alto', tone: 'alert' },
};

const STABILITY_EVOLUTION: Record<string, Omit<Evolution, 'code'>> = {
  CE01: { label: 'Tiende a mejorar', trend: 'up' },
  CE02: { label: 'Sin cambio previsible', trend: 'flat' },
  CE03: { label: 'Tendencia adversa', trend: 'down' },
};

const FORECAST: Record<string, Omit<Status, 'code'>> = {
  CG01: { label: 'Muy favorable', tone: 'strong' },
  CG02: { label: 'Favorable', tone: 'strong' },
  CG03: { label: 'Favorable', tone: 'strong' },
  CG04: { label: 'Favorable con observaciones', tone: 'avg' },
  CG05: { label: 'Favorable con observaciones', tone: 'avg' },
  CG06: { label: 'Ambivalente', tone: 'watch' },
  CG07: { label: 'Valores debilitados', tone: 'watch' },
  CG08: { label: 'Estancado', tone: 'alert' },
  CG09: { label: 'Desfavorable', tone: 'alert' },
  CG10: { label: 'Inadecuado', tone: 'alert' },
};

const FORECAST_EVOLUTION: Record<string, Omit<Evolution, 'code'>> = {
  CK01: { label: 'Claramente favorable', trend: 'up' },
  CK02: { label: 'Favorable', trend: 'up' },
  CK03: { label: 'Estable', trend: 'flat' },
  CK04: { label: 'Desfavorable', trend: 'down' },
  CK05: { label: 'Muy desfavorable', trend: 'down' },
};

function lookup<T>(table: Record<string, T>, code: string | undefined): (T & { code: string }) | null {
  if (code === undefined) return null;
  const entry = table[code];
  return entry ? { ...entry, code } : null;
}

export type Priority = 'alta' | 'media' | 'baja' | 'aprovechar';

export const PRIORITY_LABEL: Record<Priority, string> = { alta: 'Prioridad alta', media: 'Prioridad media', baja: 'Prioridad baja', aprovechar: 'Aprovechar' };
const PRIORITY_TONE: Record<Priority, Tone> = { alta: 'alert', media: 'watch', baja: 'watch', aprovechar: 'strong' };
const PRIORITY_ORDER: Priority[] = ['alta', 'media', 'baja', 'aprovechar'];

export interface FollowUp {
  id: string;
  priority: Priority;
  tone: Tone;
  title: string;
  /** What fired the card, such as "Autodominio · 25". */
  triggers: { label: string; value: string }[];
  why: string;
  /** Example text for the empty action field. */
  actionHint: string;
  /** Example text for the wide field, or null for a card without one. */
  wideField: { label: string; hint: string } | null;
  dateLabel: string;
}

export interface Infographic {
  verdict: Status | null;
  ci: { rawTotal: number; global: CiFactorLine; factors: CiFactorLine[] } | null;
  ceGlobal: TraitBar | null;
  stability: Status | null;
  stabilityEvolution: Evolution | null;
  forecast: Status | null;
  forecastEvolution: Evolution | null;
  workTraits: TraitBar[];
  emotionalTraits: TraitBar[];
  followUps: FollowUp[];
}

const WORK_TRAITS = [
  P4_TRAITS.actividad,
  P4_TRAITS.creatividad,
  P4_TRAITS.independencia,
  P4_TRAITS.liderazgo,
  P4_TRAITS.logro,
  P4_TRAITS.percepcionSalud,
  P4_TRAITS.perseverancia,
  P4_TRAITS.responsabilidad,
  P4_TRAITS.sociabilidad,
];
const EMOTIONAL_TRAITS = [P4_TRAITS.ceGlobal, P4_TRAITS.autodominio, P4_TRAITS.positividad, P4_TRAITS.autoestima, P4_TRAITS.respuestaEstres];

/** Low scores on these get a generic development card when no specific rule covers them. */
const GENERIC_LOW = [P4_TRAITS.actividad, P4_TRAITS.independencia, P4_TRAITS.sociabilidad, P4_TRAITS.perseverancia, P4_TRAITS.logro, P4_TRAITS.liderazgo, P4_TRAITS.responsabilidad, P4_TRAITS.autoestima];

const byValueDesc = (a: TraitBar, b: TraitBar): number => b.value - a.value || a.name.localeCompare(b.name);

const levelOf = (line: CiFactorLine): CiLevel | null => line.level;

function followUpsOf(info: Omit<Infographic, 'followUps'>): FollowUp[] {
  const bars = new Map([...info.workTraits, ...info.emotionalTraits].map((bar) => [bar.traitId, bar]));
  const get = (traitId: string): TraitBar | undefined => bars.get(traitId);
  const trigger = (bar: TraitBar): { label: string; value: string } => ({ label: bar.name, value: String(bar.value) });
  const cards: FollowUp[] = [];
  const add = (card: Omit<FollowUp, 'tone' | 'dateLabel'> & { dateLabel?: string }): void => {
    cards.push({ dateLabel: 'Fecha de revisión', ...card, tone: PRIORITY_TONE[card.priority] });
  };

  // 1. The conclusion or the stability asks for evidence beyond the tests.
  const verdictNeedsCheck = info.verdict !== null && (info.verdict.code === 'CM03' || info.verdict.code === 'CM04');
  const stabilityNeedsCheck = info.stability !== null && info.stability.tone === 'alert';
  if (verdictNeedsCheck || stabilityNeedsCheck) {
    const triggers = [];
    if (info.stability && stabilityNeedsCheck) triggers.push({ label: 'Estabilidad', value: info.stability.label.toLowerCase() });
    if (info.verdict && verdictNeedsCheck) triggers.push({ label: 'Dictamen', value: info.verdict.label });
    add({
      id: 'verification',
      priority: 'alta',
      title: 'Verificación con otros predictores',
      triggers,
      why: 'Contrastar el resultado con fuentes distintas de las pruebas antes de decidir.',
      actionHint: 'Entrevista, referencias laborales, estudio socioeconómico…',
      wideField: { label: 'Hallazgos y decisión', hint: 'Resultado de la verificación y decisión de continuar o no…' },
      dateLabel: 'Fecha límite',
    });
  }

  // 2. Emotional self-control.
  const autodominio = get(P4_TRAITS.autodominio);
  if (autodominio && autodominio.value < BANDS.low) {
    add({
      id: 'self-control',
      priority: autodominio.value < BANDS.priority ? 'alta' : 'media',
      title: 'Autorregulación emocional',
      triggers: [trigger(autodominio)],
      why: 'Le cuesta controlar sus reacciones emotivas. Observar su conducta bajo presión y definir apoyos.',
      actionHint: 'Ej.: acompañamiento, taller de manejo emocional…',
      wideField: { label: 'Indicador de seguimiento', hint: 'Conducta observable a revisar y cómo se medirá…' },
    });
  }

  // 3. Very high leadership or responsibility.
  const leadershipRisk = [get(P4_TRAITS.liderazgo), get(P4_TRAITS.responsabilidad)].filter((bar): bar is TraitBar => bar !== undefined && bar.value >= BANDS.riskHigh);
  if (leadershipRisk.length > 0) {
    add({
      id: 'role-limits',
      priority: 'media',
      title: 'Estilo de mando y límites de rol',
      triggers: leadershipRisk.map(trigger),
      why: 'Riesgo de estilo autoritario o de intervenir en áreas ajenas, con roces y tensión acumulada.',
      actionHint: 'Ej.: acordar alcance del puesto y canales de coordinación…',
      wideField: { label: 'Indicador de seguimiento', hint: 'Ej.: retroalimentación de pares y de otras áreas…' },
    });
  }

  // 4. Wellbeing: health worries or a low stress response.
  const health = get(P4_TRAITS.percepcionSalud);
  const stress = get(P4_TRAITS.respuestaEstres);
  const wellbeing = [health && health.tone !== 'avg' ? health : undefined, stress && stress.value < BANDS.low ? stress : undefined].filter((bar): bar is TraitBar => bar !== undefined);
  if (wellbeing.length > 0) {
    add({
      id: 'wellbeing',
      priority: wellbeing.some((bar) => bar.tone === 'alert') ? 'alta' : 'media',
      title: 'Bienestar, estrés y salud percibida',
      triggers: wellbeing.map(trigger),
      why: 'Posible acumulación de tensión: fatiga, mal humor o molestias psicosomáticas.',
      actionHint: 'Ej.: revisión de carga de trabajo, recursos de bienestar…',
      wideField: { label: 'Indicador de seguimiento', hint: 'Ej.: ausentismo, señales de fatiga, autoevaluación periódica…' },
    });
  }

  // 5. Work forecast.
  const forecastLow = info.forecast !== null && info.forecast.tone === 'alert';
  const forecastFalling = info.forecastEvolution !== null && info.forecastEvolution.trend === 'down';
  if (forecastLow || forecastFalling) {
    const triggers = [];
    if (info.forecast && forecastLow) triggers.push({ label: 'Pronóstico', value: info.forecast.label.toLowerCase() });
    if (info.forecastEvolution && forecastFalling) triggers.push({ label: 'Evolución', value: info.forecastEvolution.label.toLowerCase() });
    add({
      id: 'performance',
      priority: 'media',
      title: 'Desempeño y motivación',
      triggers,
      why: 'El pronóstico laboral es reservado. Fijar metas cercanas y revisar el desempeño con frecuencia.',
      actionHint: 'Ej.: objetivos a 30 días, reuniones de seguimiento…',
      wideField: { label: 'Indicador de seguimiento', hint: 'Ej.: cumplimiento de objetivos, evaluación del jefe directo…' },
    });
  }

  // 6. Positivity and emotional intelligence.
  const outlook = [get(P4_TRAITS.positividad), get(P4_TRAITS.ceGlobal)].filter((bar): bar is TraitBar => bar !== undefined && bar.value < BANDS.low);
  if (outlook.length > 0) {
    add({
      id: 'outlook',
      priority: outlook.some((bar) => bar.value < BANDS.priority) ? 'alta' : 'media',
      title: 'Positividad e inteligencia emocional',
      triggers: outlook.map(trigger),
      why: 'Visión más crítica que optimista. Puede aprovecharse en tareas de detección de riesgos.',
      actionHint: 'Ej.: tareas de revisión y control de calidad…',
      wideField: null,
    });
  }

  // 7. Creativity.
  const creativity = get(P4_TRAITS.creatividad);
  if (creativity && creativity.value < BANDS.low) {
    add({
      id: 'creativity',
      priority: 'baja',
      title: 'Creatividad y tipo de tareas',
      triggers: [trigger(creativity)],
      why: 'Rinde mejor en tareas estructuradas que en las que exigen soluciones originales.',
      actionHint: 'Ej.: ajustar el perfil de tareas del puesto…',
      wideField: null,
    });
  }

  // 8. Any other low trait.
  for (const traitId of GENERIC_LOW) {
    const bar = get(traitId);
    if (!bar || bar.value >= BANDS.low) continue;
    add({
      id: `low-${traitId}`,
      priority: bar.value < BANDS.priority ? 'media' : 'baja',
      title: `Desarrollo: ${bar.name}`,
      triggers: [trigger(bar)],
      why: 'Puntuación por debajo del promedio. Definir si el puesto lo requiere y cómo apoyarlo.',
      actionHint: 'Ej.: capacitación, mentoría, ajuste de responsabilidades…',
      wideField: null,
    });
  }

  // 9. Strengths to build on.
  const strengths = [get(P4_TRAITS.logro), get(P4_TRAITS.perseverancia), get(P4_TRAITS.autoestima)].filter((bar): bar is TraitBar => bar !== undefined && bar.tone === 'strong');
  const ciLevelValue = info.ci ? levelOf(info.ci.global) : null;
  if (strengths.length > 0 || (ciLevelValue !== null && ciLevelValue >= 7)) {
    const triggers = strengths.map(trigger);
    if (info.ci && ciLevelValue !== null && ciLevelValue >= 7) triggers.push({ label: 'C.I.', value: String(info.ci.global.value) });
    add({
      id: 'strengths',
      priority: 'aprovechar',
      title: 'Metas y reconocimiento',
      triggers,
      why: 'Fortalezas para apoyar el desarrollo: responde bien a retos claros y retroalimentación frecuente.',
      actionHint: 'Ej.: objetivos medibles, retroalimentación periódica, retos técnicos…',
      wideField: null,
    });
  }

  return cards.sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority));
}

/** Null for a session the infographic doesn't cover: the C.E. module. */
export function buildInfographic(pack: OperatorPack, record: SessionRecord): Infographic | null {
  if (moduleOf(record.session) !== 'p4') return null;
  const scores = record.scores ?? [];
  const bar = (traitId: string): TraitBar | null => {
    const score = scores.find((s) => s.traitId === traitId);
    if (!score) return null;
    const name = pack.traits.find((t) => t.id === traitId)?.name ?? traitId;
    return { traitId, name, value: score.value, ...classifyTrait(traitId, score.value) };
  };
  const bars = (ids: readonly string[]): TraitBar[] => ids.map(bar).filter((b): b is TraitBar => b !== null).sort(byValueDesc);
  const codeAt = (slot: number): string | undefined => record.colorResult?.qualitative.find((q) => q.slot === slot)?.baseCode;
  const ci = ciBlock(record);

  const base: Omit<Infographic, 'followUps'> = {
    verdict: lookup(VERDICTS, codeAt(SLOT.conclusion)),
    ci: ci && { rawTotal: ci.rawTotal, global: ci.global, factors: ci.factors },
    ceGlobal: bar(P4_TRAITS.ceGlobal),
    stability: lookup(STABILITY, codeAt(SLOT.stability)),
    stabilityEvolution: lookup(STABILITY_EVOLUTION, codeAt(SLOT.stabilityEvolution)),
    forecast: lookup(FORECAST, codeAt(SLOT.forecast)),
    forecastEvolution: lookup(FORECAST_EVOLUTION, codeAt(SLOT.forecastEvolution)),
    workTraits: bars(WORK_TRAITS),
    emotionalTraits: bars(EMOTIONAL_TRAITS),
  };
  return { ...base, followUps: followUpsOf(base) };
}
