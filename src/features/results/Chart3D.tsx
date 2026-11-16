import { type KeyboardEvent, type PointerEvent, useMemo, useRef, useState } from 'react';
import { DEFAULT_VIEW, type Scene, type Size, type View, buildScene, clampView } from './scene3d';
import type { ChartData } from './report';

const SCREEN: Size = { width: 1000, height: 520 };
const PRINT: Size = { width: 900, height: 440 };
const KEY_STEP = 5;
const DRAG_DEGREES_PER_PIXEL = 0.4;

const KEY_MOVES: Record<string, Partial<View>> = {
  ArrowLeft: { yaw: KEY_STEP },
  ArrowRight: { yaw: -KEY_STEP },
  ArrowUp: { pitch: KEY_STEP },
  ArrowDown: { pitch: -KEY_STEP },
};

function Legend3D() {
  return (
    <ul className="chart3d-legend">
      <li data-series="score">Examen (al frente)</li>
      <li data-series="minimum">Mínimo (atrás)</li>
      <li data-series="maximum">Máximo (al fondo)</li>
    </ul>
  );
}

interface BarEvents {
  onEnter: (traitIndex: number, event: PointerEvent) => void;
  onLeave: () => void;
}

function SceneContent({ scene, activeTrait, events }: { scene: Scene; activeTrait?: number | null; events?: BarEvents }) {
  return (
    <>
      <polygon className="chart3d-wall" points={scene.backWall} />
      <polygon className="chart3d-wall" points={scene.sideWall} />
      <polygon className="chart3d-floor" points={scene.floor} />
      {scene.grid.map((line) => (
        <g key={line.value}>
          <polyline className="chart3d-grid" points={line.points} />
          <text className="chart3d-text" x={line.label.x} y={line.label.y} textAnchor={scene.tickAnchor}>
            {String(line.value)}
          </text>
        </g>
      ))}
      {scene.bars.map((bar) => (
        <g
          key={bar.key}
          className="bar3d"
          data-series={bar.series}
          data-active={activeTrait === bar.traitIndex || undefined}
          {...(events
            ? {
                onPointerMove: (event: PointerEvent) => {
                  events.onEnter(bar.traitIndex, event);
                },
                onPointerLeave: events.onLeave,
              }
            : {})}
        >
          {bar.faces.map((face) => (
            <polygon key={`${face.shade}:${face.points}`} data-shade={face.shade} points={face.points} />
          ))}
        </g>
      ))}
      {scene.scoreLabels.map((label) => (
        <text key={label.key} className="chart3d-text chart3d-score" x={label.x} y={label.y} textAnchor="middle">
          {label.text}
        </text>
      ))}
      {scene.names.map((name) => (
        <text key={name.key} className="chart3d-text" textAnchor="end" transform={`translate(${name.x.toFixed(1)} ${name.y.toFixed(1)}) rotate(-65)`}>
          {name.text}
        </text>
      ))}
    </>
  );
}

interface Tip {
  traitIndex: number;
  x: number;
  y: number;
}

/** Drag or use the arrow keys to turn it. The printed chart keeps the angle on screen. */
export default function Chart3D({ data, showRanges }: { data: ChartData; showRanges: boolean }) {
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [tip, setTip] = useState<Tip | null>(null);
  const drag = useRef<{ x: number; y: number; view: View } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const screen = useMemo(() => buildScene(data, showRanges, view, SCREEN), [data, showRanges, view]);
  const printed = useMemo(() => buildScene(data, showRanges, view, PRINT), [data, showRanges, view]);

  const startDrag = (event: PointerEvent<SVGSVGElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, view };
    setTip(null);
  };

  const moveDrag = (event: PointerEvent<SVGSVGElement>): void => {
    const start = drag.current;
    if (!start) return;
    setView(
      clampView({
        yaw: start.view.yaw + (start.x - event.clientX) * DRAG_DEGREES_PER_PIXEL,
        pitch: start.view.pitch + (event.clientY - start.y) * DRAG_DEGREES_PER_PIXEL,
      }),
    );
  };

  const endDrag = (): void => {
    drag.current = null;
  };

  const turnWithKeys = (event: KeyboardEvent): void => {
    const move = KEY_MOVES[event.key];
    if (!move) return;
    event.preventDefault();
    setView((current) => clampView({ yaw: current.yaw + (move.yaw ?? 0), pitch: current.pitch + (move.pitch ?? 0) }));
  };

  const events: BarEvents = {
    onEnter: (traitIndex, event) => {
      const box = frame.current?.getBoundingClientRect();
      if (!box || drag.current) return;
      setTip({ traitIndex, x: event.clientX - box.left, y: event.clientY - box.top });
    },
    onLeave: () => {
      setTip(null);
    },
  };

  const row = tip ? data.rows[tip.traitIndex] : undefined;

  return (
    <>
      <div className="chart-screen">
        <div className="chart3d-bar">
          <p className="muted">Arrastra para girar, o usa las flechas del teclado.</p>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setView(DEFAULT_VIEW);
            }}
          >
            Restablecer vista
          </button>
          {showRanges && <Legend3D />}
        </div>
        <div className="chart3d" ref={frame}>
          <svg
            className="chart3d-svg"
            viewBox={`0 0 ${String(SCREEN.width)} ${String(SCREEN.height)}`}
            role="img"
            aria-label="Gráfica de barras en 3D. Los valores están en la tabla de datos."
            tabIndex={0}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={turnWithKeys}
          >
            <SceneContent scene={screen} activeTrait={tip?.traitIndex ?? null} events={events} />
          </svg>
          {tip && row && (
            <div className="chart3d-tip" role="status" style={{ left: tip.x, top: tip.y }}>
              <strong>{row.name}</strong>
              {showRanges && <span>Mínimo: {row.minimum ?? '—'}</span>}
              {showRanges && <span>Máximo: {row.maximum ?? '—'}</span>}
              <span>Examen: {row.score ?? '—'}</span>
            </div>
          )}
        </div>
      </div>
      <div className="chart-print">
        {showRanges && <Legend3D />}
        <svg viewBox={`0 0 ${String(PRINT.width)} ${String(PRINT.height)}`} width={PRINT.width} height={PRINT.height}>
          <SceneContent scene={printed} />
        </svg>
      </div>
    </>
  );
}
