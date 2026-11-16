// Synthetic content for the demo pack, safe to commit: every text, key, norm and range here is made
// up. It has the same structure as a real pack, so the app and its tests can run without one. This
// module is used only by the build script and tests, so it never reaches the app bundle.
import { DEMO_QUESTION_PNG } from './demo-image';
import { EXAMINEE_CONSENT, EXAMINEE_INSTRUCTIONS } from './examinee-text';
import { CE_FACTOR_TRAITS } from '../domain/ce/score';
import { CE_TRAITS, P4_TRAITS } from '../domain/traits';
import { QUALITATIVE_BASE_CODES, TRAITS_WITHOUT_TEXT } from './checks';
import type { ExamineePack, ManualsPack, OperatorPack } from './schemas';

export const DEMO_PASSPHRASE = 'demo';
export const DEMO_VERSION = 'demo-1';

/** A 1×1 gray PNG. */

/** The real section numbers, which only say where a trait goes in a report. */
const REPORT_CODES: Record<string, string> = {
  [P4_TRAITS.ciGlobal]: '0.1',
  [P4_TRAITS.factorVerbal]: '0.2',
  [P4_TRAITS.factorNumerico]: '0.3',
  [P4_TRAITS.factorEspacial]: '0.4',
  [P4_TRAITS.actividad]: 'III.3.1',
  [P4_TRAITS.creatividad]: 'III.3.2',
  [P4_TRAITS.independencia]: 'III.3.3',
  [P4_TRAITS.liderazgo]: 'III.3.4',
  [P4_TRAITS.logro]: 'III.3.5',
  [P4_TRAITS.percepcionSalud]: 'III.3.6',
  [P4_TRAITS.perseverancia]: 'III.3.7',
  [P4_TRAITS.responsabilidad]: 'III.3.8',
  [P4_TRAITS.sociabilidad]: 'III.3.9',
  [P4_TRAITS.ceGlobal]: 'IV.1',
  [P4_TRAITS.autodominio]: 'IV.2',
  [P4_TRAITS.positividad]: 'IV.3',
  [P4_TRAITS.autoestima]: 'IV.4',
  [P4_TRAITS.respuestaEstres]: 'IV.5',
  [CE_TRAITS.ceIntrapersonal]: '1',
  [CE_TRAITS.toleranciaFrustracion]: '1.1',
  [CE_TRAITS.autoValoracion]: '1.2',
  [CE_TRAITS.laboriosidad]: '1.3',
  [CE_TRAITS.optimismo]: '1.4',
  [CE_TRAITS.respuestaSobreEsfuerzo]: '1.5',
  [CE_TRAITS.afanTriunfo]: '1.6',
  [CE_TRAITS.ceInterpersonal]: '2',
  [CE_TRAITS.catalizadorCambios]: '2.1',
  [CE_TRAITS.consideracionDemas]: '2.2',
  [CE_TRAITS.influencia]: '2.3',
  [CE_TRAITS.dominioEmpuje]: '2.4',
  [CE_TRAITS.lealtadGrupal]: '2.5',
  [CE_TRAITS.comunicacion]: '2.6',
  [CE_TRAITS.factorGEmocional]: '3',
};

export function demoOperatorPack(): OperatorPack {
  const texts: OperatorPack['texts'] = [];
  const addText = (module: 'p4' | 'ce', baseCode: string, variant: string | null): string => {
    const id = `${module}:${String(texts.length + 1)}`;
    const label = variant === null ? baseCode : `${baseCode}, variante ${variant}`;
    texts.push({ id, module, code: baseCode + (variant ?? ''), baseCode, variant, html: `<p>Texto de demostración ${label}.</p>`, note: null });
    return id;
  };

  for (const base of [...QUALITATIVE_BASE_CODES, 'CM01', 'CM02']) {
    addText('p4', base, 'A');
    addText('p4', base, 'B');
  }

  const traitIds = [...Object.values(P4_TRAITS), ...Object.values(CE_TRAITS)];
  const traits = traitIds.map((id, index) => ({
    id,
    module: id.startsWith('p4') ? ('p4' as const) : ('ce' as const),
    name: `Rasgo de demostración ${id}`,
    reportCode: REPORT_CODES[id] ?? `D.${String(index + 1)}`,
    order: index + 1,
  }));

  const traitTextTables = traits
    .filter((t) => !TRAITS_WITHOUT_TEXT.has(t.id))
    .map((t) => ({
      traitId: t.id,
      profileIds: null,
      bands: [
        { min: 0, max: 49, textIds: [addText(t.module, `D${t.id.replace(':', '')}L`, null)] },
        { min: 50, max: 100, textIds: [addText(t.module, `D${t.id.replace(':', '')}H`, null)] },
      ],
    }));

  const ciItems: OperatorPack['ci']['items'] = [];
  const ciKey: OperatorPack['ci']['key'] = [];
  const factors = ['verbal', 'numeric', 'spatial'] as const;
  const assets: Record<string, string> = {};
  for (let n = 1; n <= 36; n++) {
    const id = `ci:${String(n)}`;
    const imageAsset = `ci/demo-${String(n)}.png`;
    assets[imageAsset] = DEMO_QUESTION_PNG;
    const factor = factors[(n - 1) % 3] ?? 'verbal';
    ciItems.push({
      id,
      order: n,
      imageAsset,
      answer: factor === 'numeric' ? { kind: 'number' } : { kind: 'choice', options: ['a', 'b', 'c', 'd', 'e'] },
    });
    ciKey.push({ itemId: id, factor, answer: factor === 'numeric' ? String(n) : (['a', 'b', 'c', 'd', 'e'][n % 5] ?? 'a') });
  }

  const ceItems: OperatorPack['ce']['items'] = [];
  const ceScoring: OperatorPack['ce']['scoring'] = [];
  for (let n = 1; n <= 30; n++) {
    const id = `ce:${String(n)}`;
    ceItems.push({
      id,
      order: n,
      stem: `Pregunta de demostración ${String(n)}`,
      options: (['A', 'B', 'C'] as const).map((key) => ({ key, text: `Opción de demostración ${key}` })),
    });
    ceScoring.push({ itemId: id, traitId: CE_FACTOR_TRAITS[(n - 1) % 6] ?? CE_TRAITS.catalizadorCambios, points: { A: 2, B: 1, C: 0 } });
  }

  const norm = (start: number): number[] => Array.from({ length: 37 }, (_, raw) => start + raw * 2);
  const ranges = Object.fromEntries(traitIds.map((id) => [id, { min: 30, max: 70 }]));

  return {
    kind: 'operator-core',
    schemaVersion: 1,
    contentVersion: DEMO_VERSION,
    traits,
    reportSections: [{ id: 'p4:101', name: 'Sección de demostración', order: 1 }],
    texts,
    traitTextTables,
    conclusions: { defaultCode: 'CM01', exceptions: { '01234567': 'CM02' } },
    ci: {
      items: ciItems,
      key: ciKey,
      norms: {
        bands: [
          { id: '18-30', minAge: 18, maxAge: 30 },
          { id: '31-45', minAge: 31, maxAge: 45 },
          { id: '46-150', minAge: 46, maxAge: 150 },
        ],
        table: { '18-30': norm(50), '31-45': norm(55), '46-150': norm(60) },
      },
    },
    ce: { items: ceItems, scoring: ceScoring },
    profiles: [
      { id: 'factory:1', name: 'Sin perfil', locked: true, hasRanges: false, modules: ['p4', 'ce'], ranges },
      { id: 'factory:2', name: 'Puesto de demostración', locked: true, hasRanges: true, modules: ['p4', 'ce'], ranges },
    ],
    // Synthetic figures, unrelated to any study.
    normProfiles: [
      {
        id: 'latam',
        name: 'Latinoamérica',
        label: 'Referencia latinoamericana.',
        colorReference: { '0': 5, '1': 10, '2': 20, '3': 25, '4': 15, '5': 12, '6': 3, '7': 10 },
        colorOrder: '32451706',
        interpretiveNotes: [{ id: 'demo-azul', digit: '1', positions: [5, 6], text: 'Nota de demostración sobre el Azul.', source: 'Demostración' }],
        ciNorms: 'latam',
        ceNorms: 'latam',
        status: 'validated',
      },
      {
        id: 'europa-luscher',
        name: 'Europa (Lüscher)',
        label: 'Referencia europea para Colores; C.I. y C.E. con tablas LatAm.',
        colorReference: { '0': 6, '1': 20, '2': 15, '3': 22, '4': 11, '5': 14, '6': 8, '7': 4 },
        colorOrder: '31254607',
        interpretiveNotes: [],
        ciNorms: 'latam',
        ceNorms: 'latam',
        status: 'reference-only',
      },
    ],
    examineePackKey: DEMO_PASSPHRASE,
    assets,
  };
}

export function demoManualsPack(): ManualsPack {
  return {
    kind: 'operator-manuals',
    schemaVersion: 1,
    contentVersion: DEMO_VERSION,
    manuals: [{ id: 'manual:demo', module: 'p4', code: 'DEMO', title: 'Manual de demostración', html: '<p>Manual de demostración.</p>' }],
    assets: {},
  };
}

export function demoExamineePack(): ExamineePack {
  const operator = demoOperatorPack();
  return {
    kind: 'examinee',
    schemaVersion: 1,
    contentVersion: DEMO_VERSION,
    ci: { items: operator.ci.items },
    ce: { items: operator.ce.items },
    instructions: EXAMINEE_INSTRUCTIONS,
    consent: EXAMINEE_CONSENT,
    assets: operator.assets,
  };
}
