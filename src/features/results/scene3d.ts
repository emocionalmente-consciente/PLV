// Geometry for the 3D bar chart, with no React, so it can be tested directly. It's an orthographic
// projection onto a flat SVG: drawing the bars farthest first is enough to hide what's behind them,
// because they're boxes on a regular grid.
import type { ChartData } from './report';

export type BarSeries = 'score' | 'minimum' | 'maximum';
export type Shade = 'top' | 'front' | 'side';

export interface View {
  yaw: number;
  pitch: number;
}

export interface Size {
  width: number;
  height: number;
}

interface XY {
  x: number;
  y: number;
}

export interface SceneBar {
  key: string;
  traitIndex: number;
  series: BarSeries;
  faces: { shade: Shade; points: string }[];
}

export interface SceneGridLine {
  value: number;
  points: string;
  label: XY;
}

export interface Scene {
  floor: string;
  backWall: string;
  sideWall: string;
  grid: SceneGridLine[];
  /** Tick labels sit on the near edge of whichever side wall is farther away. */
  tickAnchor: 'start' | 'end';
  bars: SceneBar[];
  scoreLabels: (XY & { key: string; text: string })[];
  names: (XY & { key: string; text: string })[];
}

type Point3 = readonly [number, number, number];

export const DEFAULT_VIEW: View = { yaw: -15, pitch: 20 };

const LIMITS = { yaw: 70, minPitch: 5, maxPitch: 70 };
/** Front to back, as requested: the examinee nearest, then the minimum, then the maximum. */
const ROWS: readonly BarSeries[] = ['score', 'minimum', 'maximum'];
const BAR_SIZE = 0.62;
const HEIGHT_UNITS = 6;
const MARGIN = { top: 26, side: 44, bottom: 180 };

export function clampView(view: View): View {
  return {
    yaw: Math.min(LIMITS.yaw, Math.max(-LIMITS.yaw, view.yaw)),
    pitch: Math.min(LIMITS.maxPitch, Math.max(LIMITS.minPitch, view.pitch)),
  };
}

/** Each bar is drawn at its own value. Nothing is added up across series. */
export function barHeight(value: number, axisMax: number): number {
  return (Math.min(axisMax, Math.max(0, value)) / axisMax) * HEIGHT_UNITS;
}

function ticksFor(axisMax: number): number[] {
  const step = axisMax > 100 ? 25 : 10;
  return Array.from({ length: Math.floor(axisMax / step) + 1 }, (_, i) => i * step);
}

function camera(view: View, centerX: number, centerZ: number) {
  const yaw = (view.yaw * Math.PI) / 180;
  const pitch = (view.pitch * Math.PI) / 180;
  const [sinY, cosY, sinP, cosP] = [Math.sin(yaw), Math.cos(yaw), Math.sin(pitch), Math.cos(pitch)];
  const rotated = ([x, , z]: Point3): { across: number; away: number } => ({
    across: (x - centerX) * cosY - (z - centerZ) * sinY,
    away: (x - centerX) * sinY + (z - centerZ) * cosY,
  });
  return {
    sinY,
    screen: (point: Point3): XY => {
      const { across, away } = rotated(point);
      return { x: across, y: point[1] * cosP + away * sinP };
    },
    /** Larger is farther from the viewer. */
    depth: (point: Point3): number => rotated(point).away * cosP - point[1] * sinP,
    /** A face is visible when its outward normal points toward the viewer. */
    faces: (normal: Point3): boolean => normal[0] * sinY * cosP - normal[1] * sinP + normal[2] * cosY * cosP < 0,
  };
}

const NUMBER = (value: number): string => value.toFixed(1);

export function buildScene(data: ChartData, showRanges: boolean, view: View, size: Size): Scene {
  const series = showRanges ? ROWS : (['score'] as const);
  const columns = data.rows.length;
  const depth = series.length;
  const cam = camera(view, columns / 2, depth / 2);

  // Fits the whole scene at this angle, so no rotation can push part of it out of frame.
  const extremes = [0, columns].flatMap((x) => [0, HEIGHT_UNITS].flatMap((y) => [0, depth].map((z) => cam.screen([x, y, z]))));
  const xs = extremes.map((p) => p.x);
  const ys = extremes.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const plotWidth = size.width - 2 * MARGIN.side;
  const plotHeight = size.height - MARGIN.top - MARGIN.bottom;
  const scale = Math.min(plotWidth / (maxX - minX), plotHeight / (maxY - minY));
  const plotCenterX = MARGIN.side + plotWidth / 2;
  const plotCenterY = MARGIN.top + plotHeight / 2;

  const toPixels = (point: Point3): XY => {
    const { x, y } = cam.screen(point);
    return { x: plotCenterX + (x - (minX + maxX) / 2) * scale, y: plotCenterY - (y - (minY + maxY) / 2) * scale };
  };
  const polygon = (points: readonly Point3[]): string =>
    points
      .map(toPixels)
      .map(({ x, y }) => `${NUMBER(x)},${NUMBER(y)}`)
      .join(' ');

  const bars: (SceneBar & { depth: number })[] = [];
  const scoreLabels: Scene['scoreLabels'] = [];
  const inset = (1 - BAR_SIZE) / 2;
  data.rows.forEach((row, traitIndex) => {
    series.forEach((name, rowIndex) => {
      const value = row[name];
      if (value === null) return;
      const [x0, x1, z0, z1] = [traitIndex + inset, traitIndex + 1 - inset, rowIndex + inset, rowIndex + 1 - inset];
      const top = barHeight(value, data.axisMax);
      const sides: { normal: Point3; shade: Shade; corners: Point3[] }[] = [
        { normal: [0, 1, 0], shade: 'top', corners: [[x0, top, z0], [x1, top, z0], [x1, top, z1], [x0, top, z1]] },
        { normal: [0, 0, -1], shade: 'front', corners: [[x0, 0, z0], [x1, 0, z0], [x1, top, z0], [x0, top, z0]] },
        { normal: [0, 0, 1], shade: 'front', corners: [[x0, 0, z1], [x1, 0, z1], [x1, top, z1], [x0, top, z1]] },
        { normal: [-1, 0, 0], shade: 'side', corners: [[x0, 0, z0], [x0, 0, z1], [x0, top, z1], [x0, top, z0]] },
        { normal: [1, 0, 0], shade: 'side', corners: [[x1, 0, z0], [x1, 0, z1], [x1, top, z1], [x1, top, z0]] },
      ];
      bars.push({
        key: `${row.traitId}:${name}`,
        traitIndex,
        series: name,
        faces: sides.filter((side) => cam.faces(side.normal)).map((side) => ({ shade: side.shade, points: polygon(side.corners) })),
        depth: cam.depth([(x0 + x1) / 2, 0, (z0 + z1) / 2]),
      });
      if (name === 'score') {
        const label = toPixels([(x0 + x1) / 2, top, (z0 + z1) / 2]);
        scoreLabels.push({ key: row.traitId, x: label.x, y: label.y - 8, text: String(value) });
      }
    });
  });

  const sideX = cam.sinY <= 0 ? 0 : columns;
  const tickX = sideX === 0 ? -6 : 6;
  return {
    floor: polygon([[0, 0, 0], [columns, 0, 0], [columns, 0, depth], [0, 0, depth]]),
    backWall: polygon([[0, 0, depth], [columns, 0, depth], [columns, HEIGHT_UNITS, depth], [0, HEIGHT_UNITS, depth]]),
    sideWall: polygon([[sideX, 0, 0], [sideX, 0, depth], [sideX, HEIGHT_UNITS, depth], [sideX, HEIGHT_UNITS, 0]]),
    grid: ticksFor(data.axisMax).map((value) => {
      const y = barHeight(value, data.axisMax);
      const otherX = sideX === 0 ? columns : 0;
      const start = toPixels([sideX, y, 0]);
      return { value, points: polygon([[sideX, y, 0], [sideX, y, depth], [otherX, y, depth]]), label: { x: start.x + tickX, y: start.y + 4 } };
    }),
    tickAnchor: sideX === 0 ? 'end' : 'start',
    bars: bars.sort((a, b) => b.depth - a.depth),
    scoreLabels,
    names: data.rows.map((row, i) => ({ key: row.traitId, text: row.name, ...toPixels([i + 0.5, 0, -0.2]) })),
  };
}
