import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW, barHeight, buildScene, clampView } from './scene3d';
import type { ChartData } from './report';

const SIZE = { width: 1000, height: 520 };
const data: ChartData = {
  axisMax: 150,
  rows: [
    { traitId: 'a', name: 'Uno', minimum: 30, maximum: 70, score: 90 },
    { traitId: 'b', name: 'Dos', minimum: 20, maximum: 60, score: 10 },
  ],
};

const coordinates = (points: string): number[][] => points.split(' ').map((pair) => pair.split(',').map(Number));

describe('barHeight', () => {
  it('follows the value alone, in proportion', () => {
    expect(barHeight(75, 150) / barHeight(150, 150)).toBeCloseTo(0.5);
    expect(barHeight(0, 150)).toBe(0);
  });

  it('stays inside the axis', () => {
    expect(barHeight(999, 150)).toBe(barHeight(150, 150));
    expect(barHeight(-5, 150)).toBe(0);
  });
});

describe('clampView', () => {
  it('keeps the chart from turning edge-on or upside down', () => {
    expect(clampView({ yaw: 200, pitch: 200 })).toEqual({ yaw: 70, pitch: 70 });
    expect(clampView({ yaw: -200, pitch: -200 })).toEqual({ yaw: -70, pitch: 5 });
    expect(clampView(DEFAULT_VIEW)).toEqual(DEFAULT_VIEW);
  });
});

describe('buildScene', () => {
  const scene = buildScene(data, true, DEFAULT_VIEW, SIZE);

  it('draws one bar per series and trait', () => {
    expect(scene.bars).toHaveLength(6);
  });

  it('draws the examinee last in each column, so it is in front', () => {
    const order = scene.bars.filter((bar) => bar.traitIndex === 0).map((bar) => bar.series);
    expect(order).toEqual(['maximum', 'minimum', 'score']);
  });

  it.each([
    [-28, 'side'],
    [28, 'side'],
  ])('shows the top, the front and one side at yaw %i', (yaw, side) => {
    const { bars } = buildScene(data, true, { yaw, pitch: 22 }, SIZE);
    expect(bars[0]?.faces.map((face) => face.shade).sort()).toEqual(['front', side, 'top'].sort());
  });

  it('shows only the examinee without ranges', () => {
    const alone = buildScene(data, false, DEFAULT_VIEW, SIZE);
    expect(alone.bars.map((bar) => bar.series)).toEqual(['score', 'score']);
  });

  it('skips a trait with no score, but keeps its ranges', () => {
    const missing = buildScene({ ...data, rows: [{ traitId: 'a', name: 'Uno', minimum: 30, maximum: 70, score: null }] }, true, DEFAULT_VIEW, SIZE);
    expect(missing.bars.map((bar) => bar.series).sort()).toEqual(['maximum', 'minimum']);
    expect(missing.scoreLabels).toEqual([]);
  });

  it('labels only the examinee, with the real value', () => {
    expect(scene.scoreLabels.map((label) => label.text)).toEqual(['90', '10']);
  });

  it.each([
    { yaw: -70, pitch: 5 },
    { yaw: 70, pitch: 70 },
    { yaw: 0, pitch: 40 },
  ])('keeps everything in frame at %j', (view) => {
    const { bars } = buildScene(data, true, view, SIZE);
    for (const [x, y] of bars.flatMap((bar) => bar.faces.flatMap((face) => coordinates(face.points)))) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(SIZE.width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(SIZE.height);
    }
  });

  it('moves the tick labels to the far side when turned the other way', () => {
    expect(buildScene(data, true, { yaw: -30, pitch: 20 }, SIZE).tickAnchor).toBe('end');
    expect(buildScene(data, true, { yaw: 30, pitch: 20 }, SIZE).tickAnchor).toBe('start');
  });
});
