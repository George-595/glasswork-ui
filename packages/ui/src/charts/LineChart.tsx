import {
  areaY,
  type ChartGradient,
  type ChartPoint,
  crosshair,
  defineChart,
  lineY,
} from '@tanstack/charts';
import { decorative } from '@tanstack/charts/mark/decorative';
import { Chart } from '@tanstack/charts/react';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { scalePoint } from '@tanstack/charts/scales/point';
import { useCallback, useMemo } from 'react';
import { useMergedRef } from '../components/useMergedRef';
import { defaultXFormat, labelRoom, thinLabels } from './axis';
import {
  CHART_PLOT,
  CHART_THEME,
  type ChartCommonProps,
  ChartFigure,
  COMPARISON_DASH,
  GRID,
  Legend,
  PAINT,
  Readout,
  SSR_WIDTH,
  SVG_ANIMATION,
  seriesColor,
  seriesDash,
  TICK_LABELS,
  useChartWidth,
  useReadout,
  useSafeId,
  useSeriesToggle,
} from './ChartFrame';
import { seriesMarkers } from './markers';
import { defaultFormat, monotoneX, niceTicks } from './scale';

/* LineChart — one or more series over shared x categories (dates, months).
   Drawn with @tanstack/charts in the look of its shadcn "Line Chart" catalog
   case (152-shadcn-line-default): a monotone line, horizontal grid only, no
   axis lines or tick marks. Each series also gets its own dash pattern and
   marker shape, so nothing rests on colour. A pointer (or the arrow keys,
   once the chart has focus) shows a crosshair and every series' value at
   that x.

   - `area` fills under each line with a token-coloured gradient; 'stacked'
     piles the series up (the line then sits at the running total, the data
     table and readout still carry each series' own value).
   - A series with `variant: 'comparison'` is the "previous period": a thinner
     dashed line with no markers or fill, never stacked.
   - The legend is a row of toggles; a hidden series leaves the drawing and the
     readout (the table keeps every series), and one always stays visible.
   - ISO-date x values are shown as "2 Sept" / "Sept 26" and the axis is thinned
     to the room there is (`xFormat` overrides), so labels never run together. */
export interface LineSeries {
  name: string;
  points: readonly { x: string; y: number }[];
  /** 'comparison' draws a dashed, muted "previous period" line. Default 'primary'. */
  variant?: 'primary' | 'comparison';
}

export interface LineChartProps extends ChartCommonProps {
  series: readonly LineSeries[];
  yFormat?: (n: number) => string;
  /** How an x value reads on the axis and the readout. Default: short en-GB dates for ISO dates. */
  xFormat?: (x: string) => string;
  /** Fill under the lines; 'stacked' piles the (primary) series up. */
  area?: boolean | 'stacked';
}

const lineId = (i: number) => `series-${i}`;
const CHAR = 6.6;

interface Row {
  x: string;
  y: number;
  lo: number;
}

export function LineChart(props: LineChartProps) {
  const filled = props.series.some((s) => s.points.length > 0);
  if (!filled) {
    return (
      <ChartFigure
        title={props.title}
        description={props.description}
        className={props.className}
        emptyMessage={props.emptyMessage}
        empty
        data={{ headers: [], rows: [] }}
      />
    );
  }
  return <LineChartPlot {...props} />;
}

function LineChartPlot({
  title,
  description,
  height = 240,
  className,
  series,
  yFormat = defaultFormat,
  xFormat,
  area = false,
}: LineChartProps) {
  const gid = useSafeId('ui-area');
  const { isShown, toggle, shownCount } = useSeriesToggle(series.length);
  const { width, measure } = useChartWidth();

  // the x categories, in first-seen order across all series (hidden ones too: the axis stays put)
  const xs = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const s of series)
      for (const p of s.points)
        if (!seen.has(p.x)) {
          seen.add(p.x);
          out.push(p.x);
        }
    return out;
  }, [series]);
  const fmtX = useMemo(() => xFormat ?? defaultXFormat(xs), [xFormat, xs]);
  const lookup = useMemo(
    () => series.map((s) => new Map(s.points.map((p) => [p.x, p.y]))),
    [series],
  );

  const stacked = area === 'stacked';

  const definition = useMemo(() => {
    const shown = series
      .map((s, i) => ({ s, i }))
      .filter(({ i }) => isShown(i))
      .map(({ s, i }) => ({ ...s, i, comparison: s.variant === 'comparison' }));
    // the rows each shown series draws; stacked ones are running totals, lo is the area's floor
    const running = new Map<string, number>();
    const rowsOf = new Map<number, Row[]>();
    for (const s of shown) {
      if (stacked && !s.comparison) {
        rowsOf.set(
          s.i,
          xs.map((x) => {
            const lo = running.get(x) ?? 0;
            const y = lo + (lookup[s.i]?.get(x) ?? 0);
            running.set(x, y);
            return { x, y, lo };
          }),
        );
      } else {
        rowsOf.set(
          s.i,
          s.points.map((p) => ({ x: p.x, y: p.y, lo: 0 })),
        );
      }
    }
    const all = [...rowsOf.values()].flat();
    const ys = all.map((r) => r.y);
    if (area) ys.push(0);
    const ticks = niceTicks(
      Math.min(...ys),
      Math.max(...ys),
      5,
      ys.every((y) => Number.isInteger(y)),
    );
    const lo = ticks[0] ?? 0;
    const hi = ticks[ticks.length - 1] ?? 1;
    const floor = Math.max(lo, Math.min(hi, 0));
    if (area && !stacked) for (const r of all) r.lo = floor;
    const markers = xs.length <= 31;
    const left = Math.max(...ticks.map((t) => yFormat(t).length)) * CHAR + 12;
    const labels = xs.map(fmtX);
    const room = labelRoom(labels);

    const gradients: ChartGradient[] = [];
    if (area)
      for (const s of shown)
        if (!s.comparison)
          gradients.push({
            id: `${gid}-${s.i}`,
            y1: 0,
            y2: 1,
            stops: [
              { offset: 0, color: seriesColor(s.i), opacity: stacked ? 0.55 : 0.34 },
              { offset: 1, color: seriesColor(s.i), opacity: stacked ? 0.18 : 0.02 },
            ],
          });

    // responsive: label as many x ticks as the width has room for
    return defineChart({
      marks: [
        ...(area
          ? shown
              .filter((s) => !s.comparison)
              .map((s) =>
                decorative(
                  areaY(rowsOf.get(s.i) ?? [], {
                    id: `area-${s.i}`,
                    x: 'x',
                    y1: 'lo',
                    y2: 'y',
                    fill: `url(#${gid}-${s.i})`,
                    fillOpacity: 1,
                    curve: monotoneX,
                  }),
                ),
              )
          : []),
        crosshair({ y: false, stroke: PAINT.axisLine, strokeOpacity: 1 }),
        ...shown.map((s) =>
          lineY(rowsOf.get(s.i) ?? [], {
            id: lineId(s.i),
            x: 'x',
            y: 'y',
            stroke: seriesColor(s.i),
            strokeWidth: s.comparison ? 1.5 : 2,
            strokeDasharray: s.comparison ? COMPARISON_DASH : seriesDash(s.i),
            curve: monotoneX,
          }),
        ),
        ...(markers
          ? shown
              .filter((s) => !s.comparison)
              .map((s) =>
                seriesMarkers(rowsOf.get(s.i) ?? [], {
                  id: `markers-${s.i}`,
                  shape: s.i,
                  color: seriesColor(s.i),
                }),
              )
          : []),
      ],
      scales: {
        x: {
          scale: scalePoint<string>().domain(xs).padding(0.25),
          axis: {
            line: false,
            ticks: {
              values: thinLabels(xs, width - left - 16, room),
              size: 0,
              padding: 10,
              format: (v: unknown) => fmtX(String(v)),
            },
            tickLabels: { ...TICK_LABELS, thin: true },
          },
        },
        y: {
          scale: scaleLinear().domain([lo, hi]),
          grid: GRID,
          axis: {
            line: false,
            ticks: { values: ticks, size: 0, padding: 8, format: yFormat },
            tickLabels: TICK_LABELS,
          },
        },
      },
      ...(gradients.length ? { gradients } : {}),
      theme: CHART_THEME,
      focus: 'group-x' as const,
      maxFocusDistance: Number.POSITIVE_INFINITY,
      svgAnimation: SVG_ANIMATION,
    });
  }, [series, isShown, xs, fmtX, lookup, yFormat, area, stacked, gid, width]);

  const describe = useCallback(
    (points: readonly ChartPoint[]) => {
      const first = points[0];
      if (!first) return null;
      const xv = String(first.xValue);
      return {
        x: first.x,
        y: 0,
        title: fmtX(xv),
        rows: series.flatMap((s, i) => {
          if (!isShown(i)) return [];
          const v = lookup[i]?.get(xv);
          return [
            {
              key: s.name,
              label: s.name,
              value: v === undefined ? '—' : yFormat(v),
              color: seriesColor(i),
            },
          ];
        }),
      };
    },
    [series, lookup, yFormat, fmtX, isShown],
  );
  const { plot, readout, show } = useReadout(describe);
  const plotRef = useMergedRef(plot, measure);

  const first = xs[0] ?? '';
  const last = xs[xs.length - 1] ?? '';
  const summary = `${title}. ${stacked ? 'Stacked area' : area ? 'Area' : 'Line'} chart of ${series.map((s) => s.name).join(', ')}, ${first} to ${last}. The data table follows.`;

  return (
    <ChartFigure
      title={title}
      description={description}
      className={className}
      legend={
        series.length > 1 ? (
          <Legend
            items={series.map((s, i) => ({
              label: s.name,
              index: i,
              kind: s.variant === 'comparison' ? ('comparison' as const) : ('line' as const),
            }))}
            isShown={isShown}
            onToggle={toggle}
            shownCount={shownCount}
          />
        ) : null
      }
      data={{
        headers: ['x', ...series.map((s) => s.name)],
        rows: xs.map((xv) => [
          xv,
          ...lookup.map((m) => {
            const v = m.get(xv);
            return v === undefined ? '—' : yFormat(v);
          }),
        ]),
      }}
    >
      <div ref={plotRef} className={CHART_PLOT}>
        <Chart
          definition={definition}
          height={height}
          initialWidth={SSR_WIDTH}
          ariaLabel={summary}
          onFocusGroupChange={show}
        />
        <Readout state={readout} />
      </div>
    </ChartFigure>
  );
}

/** AreaChart — a LineChart with the fill on. `stacked` piles the series up. */
export function AreaChart({
  stacked = false,
  ...props
}: Omit<LineChartProps, 'area'> & { stacked?: boolean }) {
  return <LineChart {...props} area={stacked ? 'stacked' : true} />;
}
