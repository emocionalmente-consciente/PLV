import { describe, expect, it } from 'vitest';
import { demoOperatorPack } from '../../content/demo-content';
import type { Examinee } from '../../data/schemas';
import { CE_TRAITS, P4_TRAITS } from '../../domain/traits';
import { type CeOption, applyCe, applyCi, applyColor, newSession } from '../capture/build';
import { type ReportBlock, buildChart, buildReport, capturedSummary, formatLongDate, protocolOf, sexLabel } from './report';
import { parseReportHtml } from './reportHtml';

const pack = demoOperatorPack();
const FIRST = '01234567';
const SECOND = '32165470';
const session = () => newSession(pack, { id: 's1', examineeId: 'e1', birthDate: '1990-06-15', testDate: '2020-06-15', maritalStatus: null, profileId: 'factory:2' });
const color = () => applyColor(pack, { session: session() }, FIRST, SECOND);
const firstOf = (factor: string, count: number): string[] => pack.ci.key.filter((k) => k.factor === factor).slice(0, count).map((k) => k.itemId);
const ticks = new Set([...firstOf('verbal', 10), ...firstOf('numeric', 8), ...firstOf('spatial', 6)]);
const allA = (): Record<string, CeOption> => Object.fromEntries(pack.ce.items.map((i) => [i.id, 'A' as const]));
const keys = (blocks: ReportBlock[]): string[] => blocks.map((b) => b.key);

describe('formatLongDate', () => {
  it.each([
    ['2006-11-27', 'Lunes, 27 de noviembre de 2006'],
    ['2020-02-29', 'Sábado, 29 de febrero de 2020'],
    ['2026-01-04', 'Domingo, 4 de enero de 2026'],
  ])('%s', (iso, expected) => {
    expect(formatLongDate(iso)).toBe(expected);
  });

  it('returns an invalid date unchanged', () => {
    expect(formatLongDate('nada')).toBe('nada');
  });
});

describe('P4 report', () => {
  it('has the legacy title', () => {
    expect(buildReport(pack, color()).title).toBe('INFORME PSICOLABORAL');
  });

  it('follows the legacy order', () => {
    const blocks = keys(buildReport(pack, applyCi(pack, color(), ticks)).blocks);
    const at = (key: string): number => blocks.indexOf(key);
    expect(blocks[0]).toBe('ci-title');
    expect(blocks[1]).toBe('ci');
    expect(at('ci')).toBeLessThan(at('slot-1'));
    expect(at('slot-39')).toBeLessThan(at(`trait-${P4_TRAITS.actividad}`));
    expect(at(`trait-${P4_TRAITS.actividad}`)).toBeLessThan(at(`trait-${P4_TRAITS.creatividad}`));
    expect(at(`trait-${P4_TRAITS.sociabilidad}`)).toBeLessThan(at('slot-40'));
    expect(at('slot-40')).toBeLessThan(at('iv-title'));
    expect(at('iv-title')).toBeLessThan(at('slot-41'));
    expect(at('slot-41')).toBeLessThan(at('slot-42'));
  });

  it('says when the CI was not applied', () => {
    const { blocks } = buildReport(pack, color());
    expect(blocks[0]).toMatchObject({ type: 'section', text: 'I. Perfil Intelectual No Aplicado' });
    expect(keys(blocks)).not.toContain('ci');
  });

  it('shows only the CI when Color was not applied', () => {
    expect(keys(buildReport(pack, applyCi(pack, { session: session() }, ticks)).blocks)).toEqual(['ci-title', 'ci']);
  });

  it('gives the CI block its raw total, flagged scores and legacy factor order', () => {
    const ci = buildReport(pack, applyCi(pack, { session: session() }, ticks)).blocks.find((b) => b.type === 'ci');
    expect(ci).toMatchObject({ rawTotal: 24, global: { value: 98, level: 6, belowAverage: false } });
    if (ci?.type !== 'ci') throw new Error('no CI block');
    expect(ci.factors.map((f) => f.label)).toEqual(['Factor Verbal', 'Factor Espacial', 'Factor Numérico']);
  });

  it('flags a score under 80, as legacy prints a minus', () => {
    const ci = buildReport(pack, applyCi(pack, { session: session() }, new Set())).blocks.find((b) => b.type === 'ci');
    expect(ci).toMatchObject({ global: { value: 50, belowAverage: true } });
  });

  it('leaves out CI traits from the III and IV sections', () => {
    const blocks = keys(buildReport(pack, applyCi(pack, color(), ticks)).blocks);
    expect(blocks).not.toContain(`trait-${P4_TRAITS.ciGlobal}`);
  });
});

describe('CE report', () => {
  const record = () => applyCe(pack, { session: session() }, FIRST, SECOND, allA());

  it('has the legacy title, and only traits', () => {
    const report = buildReport(pack, record());
    expect(report.title).toBe('INFORME');
    expect(report.blocks).toHaveLength(15);
    expect(report.blocks.every((b) => b.type === 'trait')).toBe(true);
  });
});

describe('text that is missing', () => {
  it('flags a score with no text where the trait normally has one', () => {
    const r = color();
    const scores = r.scores?.map((s) => (s.traitId === P4_TRAITS.actividad ? { ...s, textId: null } : s)) ?? [];
    const block = buildReport(pack, { ...r, scores }).blocks.find((b) => b.key === `trait-${P4_TRAITS.actividad}`);
    expect(block).toMatchObject({ html: null, missingText: true, value: 45 });
  });

  it('flags a text that a later pack no longer has, without failing', () => {
    const r = color();
    const scores = r.scores?.map((s) => (s.traitId === P4_TRAITS.actividad ? { ...s, textId: 'p4:999999' } : s)) ?? [];
    expect(buildReport(pack, { ...r, scores }).blocks.find((b) => b.key === `trait-${P4_TRAITS.actividad}`)).toMatchObject({ missingText: true });
  });

  it('leaves out a qualitative slot whose text is gone', () => {
    const r = color();
    const result = r.colorResult;
    if (!result) throw new Error('no color');
    const qualitative = result.qualitative.map((q) => (q.slot === 2 ? { ...q, textId: 'p4:999999' } : q));
    expect(keys(buildReport(pack, { ...r, colorResult: { ...result, qualitative } }).blocks)).not.toContain('slot-2');
  });

  it('does not flag an empty text, which is empty on purpose', () => {
    const empty = demoOperatorPack();
    const r = applyColor(empty, { session: session() }, FIRST, SECOND);
    const score = r.scores?.find((s) => s.traitId === P4_TRAITS.actividad);
    const text = empty.texts.find((t) => t.id === score?.textId);
    if (text) text.html = '';
    expect(buildReport(empty, r).blocks.find((b) => b.key === `trait-${P4_TRAITS.actividad}`)).toMatchObject({ html: '', missingText: false });
  });
});

describe('protocolOf', () => {
  it('matches the legacy Protocolo screenshot', () => {
    const protocol = protocolOf(color().colorResult ?? (() => { throw new Error('no color'); })());
    expect(protocol.serie1.digits.join('')).toBe(FIRST);
    expect(protocol.serie1.signs.join('')).toBe('+XX====−');
    expect(protocol.serie1.marks).toEqual([3, 0, 0, 0, 0, 0, 0, 0]);
    expect(protocol.serie1.letters).toEqual(['C', '', '', '', '', '', '', 'A']);
    expect(protocol.serie2.signs.join('')).toBe('++X==−−−');
    expect(protocol.serie2.marks).toEqual([0, 0, 0, 0, 0, 1, 0, 0]);
    expect(protocol.serie2.letters).toEqual(['C', '', '', '', '', 'A', 'A', 'A']);
  });

  it('handles none, stored as a dot, and stored rows without trailing spaces', () => {
    const r = color().colorResult;
    if (!r) throw new Error('no color');
    const side = { signs: '++XX==__', marks: '.', letters: '.' };
    const none = protocolOf({ ...r, protocol: { serie1: side, serie2: { ...side, marks: '!!!', letters: 'C' } } });
    expect(none.serie1.marks).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(none.serie1.letters.join('')).toBe('');
    expect(none.serie2.marks[0]).toBe(3);
    expect(none.serie2.letters[0]).toBe('C');
  });

  it('counts two marks in the second place', () => {
    const r = color().colorResult;
    if (!r) throw new Error('no color');
    const side = { signs: '++XX==__', marks: '   ! !', letters: '.' };
    expect(protocolOf({ ...r, protocol: { serie1: side, serie2: side } }).serie1.marks[1]).toBe(2);
  });
});

describe('buildChart', () => {
  it('lists P4 traits in report order, with CI first', () => {
    const r = applyCi(pack, color(), ticks);
    const { rows, axisMax } = buildChart(pack, r.session, r.scores ?? [], r.session.profile.ranges);
    expect(rows).toHaveLength(18);
    expect(axisMax).toBe(150);
    expect(rows.find((row) => row.traitId === P4_TRAITS.actividad)).toMatchObject({ minimum: 30, maximum: 70, score: 45 });
  });

  it('shows a trait not captured with no score, as legacy does', () => {
    const r = color();
    expect(buildChart(pack, r.session, r.scores ?? [], r.session.profile.ranges).rows.find((row) => row.traitId === P4_TRAITS.ciGlobal)?.score).toBeNull();
  });

  it('uses the CE traits and a 100 axis for CE', () => {
    const r = applyCe(pack, { session: session() }, FIRST, SECOND, allA());
    const { rows, axisMax } = buildChart(pack, r.session, r.scores ?? [], r.session.profile.ranges);
    expect(rows).toHaveLength(15);
    expect(axisMax).toBe(100);
    expect(rows.some((row) => row.traitId === CE_TRAITS.factorGEmocional)).toBe(true);
  });

  it('extends the axis for a score above it', () => {
    const r = color();
    expect(buildChart(pack, r.session, [{ sessionId: 's1', traitId: P4_TRAITS.ciGlobal, value: 163, textId: null }], {}).axisMax).toBe(170);
    expect(r).toBeDefined();
  });

  it('compares with other ranges without changing the session', () => {
    const r = color();
    const ranges = { [P4_TRAITS.actividad]: { min: 1, max: 2 } };
    expect(buildChart(pack, r.session, r.scores ?? [], ranges).rows.find((row) => row.traitId === P4_TRAITS.actividad)).toMatchObject({ minimum: 1, maximum: 2 });
    expect(r.session.profile.ranges[P4_TRAITS.actividad]).toEqual({ min: 30, max: 70 });
  });
});

describe('labels', () => {
  it('summarizes what was captured', () => {
    expect(capturedSummary(applyCi(pack, color(), ticks).session)).toBe('Colores y C.I.');
    expect(capturedSummary(session())).toBe('Sin capturar');
  });

  it('labels sex', () => {
    expect(sexLabel({ sex: 'F' } as Examinee)).toBe('Femenino');
    expect(sexLabel({ sex: 'M' } as Examinee)).toBe('Masculino');
  });
});

describe('parseReportHtml', () => {
  it('keeps the allowed tags and alignment', () => {
    expect(parseReportHtml('<p style="text-align:center">Hola <strong>mundo</strong></p>')).toEqual([
      { tag: 'p', align: 'center', children: ['Hola ', { tag: 'strong', align: null, children: ['mundo'] }] },
    ]);
  });

  it('decodes entities', () => {
    expect(parseReportHtml('A &amp; B &lt;c&gt;')).toEqual(['A & B <c>']);
  });

  it('keeps images', () => {
    expect(parseReportHtml('<p><img src="images/a.png" alt=""></p>')).toEqual([{ tag: 'p', align: null, children: [{ tag: 'img', src: 'images/a.png' }] }]);
  });

  it('drops tags that are not allowed, so a tampered pack cannot add markup', () => {
    expect(parseReportHtml('<script>x</script><a href="javascript:y">z</a>')).toEqual(['x', 'z']);
  });

  it('ignores handlers and other styles', () => {
    expect(parseReportHtml('<p onclick="x()" style="color:red">a</p>')).toEqual([{ tag: 'p', align: null, children: ['a'] }]);
  });

  it('survives tags left open or closed twice', () => {
    expect(parseReportHtml('<p><strong>a</p>b</strong>')).toEqual([{ tag: 'p', align: null, children: [{ tag: 'strong', align: null, children: ['a'] }] }, 'b']);
  });

  it('returns nothing for empty text', () => {
    expect(parseReportHtml('')).toEqual([]);
  });
});
