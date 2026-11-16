import { Area, Bar, BarChart, CartesianGrid, ComposedChart, LabelList, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Chart3D from './Chart3D';
import type { ChartData } from './report';

const HEIGHT = 520;
const PRINT_WIDTH = 900;
const PRINT_HEIGHT = 440;
const LABEL_HEIGHT = 190;
const SERIES_ORDER = ['Mínimo', 'Máximo', 'Examen'];

export type ChartKind = 'bars' | 'surface' | 'bars3d';

interface ChartProps {
  data: ChartData;
  showRanges: boolean;
  kind: ChartKind;
  width?: number;
  height?: number;
  interactive: boolean;
}

function Chart({ data, showRanges, kind, width, height, interactive }: ChartProps) {
  const step = data.axisMax > 100 ? 25 : 10;
  const ticks = Array.from({ length: Math.floor(data.axisMax / step) + 1 }, (_, i) => i * step);
  const inkStyle = { fill: 'var(--chart-ink)', fontSize: 11 };
  const size = {
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
  };
  const margin = { top: 22, right: 8, bottom: 0, left: 0 };
  const shared = (
    <>
      <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
      <XAxis dataKey="name" interval={0} angle={-90} textAnchor="end" height={LABEL_HEIGHT} tick={{ ...inkStyle, dy: -3 }} tickLine={false} axisLine={{ stroke: 'var(--chart-axis)' }} />
      <YAxis domain={[0, data.axisMax]} ticks={ticks} interval={0} width={34} tick={inkStyle} tickLine={false} axisLine={false} />
      {interactive && (
        <Tooltip
          cursor={kind === 'surface' ? { stroke: 'var(--chart-axis)' } : { fill: 'var(--chart-grid)', opacity: 0.4 }}
          contentStyle={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
          }}
          labelStyle={{ color: 'var(--text)', fontWeight: 600 }}
          itemStyle={{ color: 'var(--text)' }}
          isAnimationActive={false}
          itemSorter={(item) => SERIES_ORDER.indexOf(String(item.name))}
        />
      )}
      {showRanges && (
        <Legend
          itemSorter={(item) => SERIES_ORDER.indexOf(String(item.value))}
          verticalAlign="top"
          align="right"
          height={26}
          wrapperStyle={{ fontSize: 12 }}
          formatter={(value: string) => <span style={{ color: 'var(--chart-ink)' }}>{value}</span>}
        />
      )}
    </>
  );
  const scoreLabels = <LabelList dataKey="score" position="top" style={{ ...inkStyle, fontWeight: 600 }} />;

  if (kind === 'surface') {
    // Painted back to front so the bands stack by eye: red up to the minimum, then green up to the
    // maximum. Each series keeps its real value, because summing them would put a meaningless
    // total on the axis. Blue fills behind the bands, so it can't tint them and the legend stays
    // true, and the examinee's line goes on top.
    return (
      <ComposedChart {...size} data={data.rows} margin={margin}>
        {shared}
        <Area type="linear" dataKey="score" legendType="none" tooltipType="none" stroke="none" fill="var(--series-score)" fillOpacity={1} isAnimationActive={false} />
        {showRanges && <Area type="linear" dataKey="maximum" name="Máximo" legendType="square" stroke="var(--series-maximum)" fill="var(--series-maximum)" fillOpacity={1} isAnimationActive={false} />}
        {showRanges && <Area type="linear" dataKey="minimum" name="Mínimo" legendType="square" stroke="var(--series-minimum)" fill="var(--series-minimum)" fillOpacity={1} isAnimationActive={false} />}
        <Line
          type="linear"
          dataKey="score"
          name="Examen"
          legendType="square"
          stroke="var(--series-score)"
          strokeWidth={2}
          dot={{
            r: 4,
            fill: 'var(--series-score)',
            stroke: 'var(--surface)',
            strokeWidth: 2,
          }}
          isAnimationActive={false}
        >
          {scoreLabels}
        </Line>
      </ComposedChart>
    );
  }

  return (
    <BarChart {...size} data={data.rows} margin={margin} barGap={2} barCategoryGap="18%">
      {shared}
      {showRanges && <Bar dataKey="minimum" name="Mínimo" fill="var(--series-minimum)" radius={[4, 4, 0, 0]} isAnimationActive={false} />}
      {showRanges && <Bar dataKey="maximum" name="Máximo" fill="var(--series-maximum)" radius={[4, 4, 0, 0]} isAnimationActive={false} />}
      <Bar dataKey="score" name="Examen" fill="var(--series-score)" radius={[4, 4, 0, 0]} isAnimationActive={false}>
        {scoreLabels}
      </Bar>
    </BarChart>
  );
}

/**
 * A chart that follows its container, and a fixed one for paper. A browser doesn't re-measure a chart
 * when it lays out the page for printing, so the printed one has a size that fits Letter and A4.
 */
export default function ScoreChart({ data, showRanges, kind, printOnly = false }: { data: ChartData; showRanges: boolean; kind: ChartKind; printOnly?: boolean }) {
  if (kind === 'bars3d') return <Chart3D data={data} showRanges={showRanges} />;
  return (
    <>
      {!printOnly && (
        <div className="chart-screen">
          <ResponsiveContainer width="100%" height={HEIGHT}>
            <Chart data={data} showRanges={showRanges} kind={kind} interactive />
          </ResponsiveContainer>
        </div>
      )}
      <div className="chart-print">
        <Chart data={data} showRanges={showRanges} kind={kind} width={PRINT_WIDTH} height={PRINT_HEIGHT} interactive={false} />
      </div>
    </>
  );
}
