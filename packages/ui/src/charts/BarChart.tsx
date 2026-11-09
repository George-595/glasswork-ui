import {
  barX,
  barY,
  type ChartPoint,
  defineChart,
  group,
  ruleX,
  ruleY,
  text,
} from '@tanstack/charts';
import { decorative } from '@tanstack/charts/mark/decorative';
import { Chart } from '@tanstack/charts/react';
import { scaleBand } from '@tanstack/charts/scales/band';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { useCallback, useMemo } from 'react';
import { labelRoom, thinLabels } from './axis';
import {
  CHART_PLOT,
  CHART_THEME,
  type ChartCommonProps,
  ChartFigure,
  GRID,
  Legend,
  PAINT,
  PatternDefs,
  patternFill,
  Readout,
  SSR_WIDTH,
  SVG_ANIMATION,
  seriesColor,
  TICK_LABELS,
  useReadout,
  useSafeId,
  useSeriesToggle,
} from './ChartFrame';
import { defaultFormat, niceTicks } from './scale';

/* BarChart — values per category as bars from a zero baseline (negative values
   hang below it, or left of it). Drawn with @tanstack/charts in the look of
   its shadcn "Bar Chart" catalog case (144-shadcn-bar-default): rounded bars,
   a grid on the value axis, no axis lines. Each bar is labelled on the axis,
   and with its value when the bars are wide enough, so nothing rests on
   colour. The focused bar stays solid while the others dim.

   - `orientation="horizontal"` is for category lists: labels on the left, the
     value at the end of each bar, one row per category.
   - `series` (instead of `data`) draws several series, `layout` 'grouped'
     (side by side) or 'stacked'. Series differ by fill pattern as well as
     colour, in the bars, the legend and the readout swatches.
   - The legend is a row of toggles; a hidden series leaves the drawing and the
     readout (the table keeps every series), and one always stays visible.
   - A crowded category axis shows every n-th label rather than overlapping
     them; the table and the readout name every category. */
export interface BarDatum {
  label: string;
  value: number;
}
export interface BarSeries {
  name: string;
  data: readonly BarDatum[];
}

export interface BarChartProps extends ChartCommonProps {
  /** One series of bars. Use `series` for several. */
  data?: readonly BarDatum[];
  series?: readonly BarSeries[];
  /** 'vertical' (default) columns, or 'horizontal' rows for category lists. */
  orientation?: 'vertical' | 'horizontal';
  /** How several series share a category. Default 'grouped'. */
  layout?: 'grouped' | 'stacked';
  /** Formats values on the axis, in labels, the readout and the table. */
  valueFormat?: (n: number) => string;
  /** Same as `valueFormat` (the original name). */
  yFormat?: (n: number) => string;
  /** Write each bar's value on it (when it fits); a stack gets its total. Default true. */
  valueLabels?: boolean;
}

const CHAR = 6.6; // px per character of 11px text, for layout estimates
const SINGLE = 'Value';

interface Row {
  key: string;
  label: string;
  series: string;
  i: number;
  value: number;
}
interface LabelRow {
  key: string;
  label: string;
  value: number;
  text: string;
  /** Pixel offset along the category axis, to sit on a grouped bar. */
  off: number;
}

export function BarChart(props: BarChartProps) {
  const list: readonly BarSeries[] =
    props.series ?? (props.data ? [{ name: SINGLE, data: props.data }] : []);
  if (!list.some((s) => s.data.length > 0)) {
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
  return <BarChartPlot {...props} list={list} />;
}

function BarChartPlot({
  title,
  description,
  height = 240,
  className,
  list,
  orientation = 'vertical',
  layout = 'grouped',
  valueFormat,
  yFormat,
  valueLabels = true,
}: BarChartProps & { list: readonly BarSeries[] }) {
  const fmt = valueFormat ?? yFormat ?? defaultFormat;
  const prefix = useSafeId('ui-bar');
  const { isShown, toggle, shownCount } = useSeriesToggle(list.length);
  const multi = list.length > 1;
  const stacked = multi && layout === 'stacked';
  const horizontal = orientation === 'horizontal';

  const labels = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const s of list)
      for (const d of s.data)
        if (!seen.has(d.label)) {
          seen.add(d.label);
          out.push(d.label);
        }
    return out;
  }, [list]);
  const lookup = useMemo(
    () => list.map((s) => new Map(s.data.map((d) => [d.label, d.value]))),
    [list],
  );

  const definition = useMemo(() => {
    const shown = list.map((s, i) => ({ s, i })).filter(({ i }) => isShown(i));
    const rows: Row[] = shown.flatMap(({ s, i }) =>
      s.data.map((d) => ({
        key: `${d.label}|${s.name}`,
        label: d.label,
        series: s.name,
        i,
        value: d.value,
      })),
    );
    // the value-axis range: stacks add up per category, other bars stand alone
    let min = 0;
    let max = 0;
    if (stacked) {
      for (const l of labels) {
        let pos = 0;
        let neg = 0;
        for (const r of rows) {
          if (r.label !== l) continue;
          if (r.value >= 0) pos += r.value;
          else neg += r.value;
        }
        max = Math.max(max, pos);
        min = Math.min(min, neg);
      }
    } else {
      for (const r of rows) {
        max = Math.max(max, r.value);
        min = Math.min(min, r.value);
      }
    }
    const ticks = niceTicks(
      min,
      max,
      5,
      rows.every((r) => Number.isInteger(r.value)),
    );
    const lo = ticks[0] ?? 0;
    const hi = ticks[ticks.length - 1] ?? 1;
    const tickWidth = Math.max(...ticks.map((t) => fmt(t).length)) * CHAR;
    const sharing = multi && !stacked ? shown.length : 1; // bars side by side in one band

    // what to write at the end of the bars: each value, or a stack's total
    const labelRows = (offFor: (si: number) => number): LabelRow[] => {
      if (stacked) {
        return labels.flatMap((l) => {
          const mine = rows.filter((r) => r.label === l);
          if (!mine.length) return [];
          const total = mine.reduce((a, r) => a + r.value, 0);
          return [{ key: l, label: l, value: total, text: fmt(total), off: 0 }];
        });
      }
      return rows.map((r) => ({
        key: r.key,
        label: r.label,
        value: r.value,
        text: fmt(r.value),
        off: offFor(shown.findIndex((q) => q.i === r.i)),
      }));
    };
    const widest =
      Math.max(
        1,
        ...rows.map((r) => fmt(r.value).length),
        ...(stacked
          ? labels.map(
              (l) => fmt(rows.filter((r) => r.label === l).reduce((a, r) => a + r.value, 0)).length,
            )
          : []),
      ) * CHAR;

    const fill = (r: Row) => (multi ? patternFill(prefix, r.i) : seriesColor(0));
    const shared = {
      id: 'bars',
      key: 'key' as const,
      ...(multi ? { z: 'series' as const } : {}),
      fill,
      radius: stacked ? { end: 5 } : multi ? 4 : 6,
      ...(multi && !stacked ? { layout: group({ padding: 0.08 }) } : {}),
      states: [{ when: { focus: 'unmatched' as const }, style: { fillOpacity: 0.45 } }],
    };
    const text11 = {
      key: 'key',
      text: 'text',
      fill: PAINT.label,
      fontSize: 11,
      fontWeight: 500,
    } as const;
    const zeroLine = { stroke: PAINT.axisLine, strokeOpacity: 1 } as const;

    // what the category axis has room for, and which value labels fit (responsive)
    const layoutFor = (width: number) => {
      const along = horizontal ? height - 36 : width - tickWidth - 20; // px along the category axis
      const bw = (0.8 * along) / Math.max(1, labels.length); // a band's painted size
      const sub = bw / sharing;
      const offFor = (si: number) => (sharing > 1 ? (si + 0.5 - sharing / 2) * sub : 0);
      const fits = horizontal ? sub >= 13 : widest <= sub * 0.8 - 4;
      return {
        lr: valueLabels && fits ? labelRows(offFor) : [],
        catTicks: thinLabels(labels, along, horizontal ? 22 : labelRoom(labels)),
      };
    };
    const category = (catTicks: string[]) => ({
      scale: scaleBand<string>().domain(labels).paddingInner(0.2).paddingOuter(0.1),
      axis: {
        line: false,
        ticks: { values: catTicks, size: 0, padding: horizontal ? 8 : 10 },
        tickLabels: { ...TICK_LABELS, thin: true },
      },
    });
    const valueAxis = {
      scale: scaleLinear().domain([lo, hi]),
      grid: GRID,
      axis: {
        line: false,
        ticks: {
          values: ticks,
          size: 0,
          padding: 8,
          format: (v: string | number) => fmt(Number(v)),
        },
        tickLabels: TICK_LABELS,
      },
    };
    const common = {
      theme: CHART_THEME,
      focusRing: false as const,
      maxFocusDistance: Number.POSITIVE_INFINITY,
      svgAnimation: SVG_ANIMATION,
    };

    if (horizontal) {
      return defineChart(({ width }) => {
        const { lr, catTicks } = layoutFor(width);
        return {
          marks: [
            barX(rows, { ...shared, x: 'value', y: 'label' }),
            ...(lo < 0 ? [ruleX([0], zeroLine)] : []),
            ...(lr.length
              ? [
                  decorative(
                    text(lr, {
                      ...text11,
                      id: 'values',
                      x: 'value',
                      y: 'label',
                      dx: (d) => (d.value >= 0 ? 8 : -8),
                      dy: (d) => d.off,
                      anchor: (d) => (d.value >= 0 ? 'start' : 'end'),
                    }),
                  ),
                ]
              : []),
          ],
          scales: { x: valueAxis, y: category(catTicks) },
          margin: { top: 8, right: lr.length ? Math.ceil(widest) + 14 : 12 },
          focus: 'group-y' as const,
          ...common,
        };
      });
    }
    return defineChart(({ width }) => {
      const { lr, catTicks } = layoutFor(width);
      return {
        marks: [
          barY(rows, { ...shared, x: 'label', y: 'value' }),
          ...(lo < 0 ? [ruleY([0], zeroLine)] : []),
          ...(lr.length
            ? [
                decorative(
                  text(lr, {
                    ...text11,
                    id: 'values',
                    x: 'label',
                    y: 'value',
                    dx: (d) => d.off,
                    dy: (d) => (d.value >= 0 ? -8 : 14),
                  }),
                ),
              ]
            : []),
        ],
        scales: { x: category(catTicks), y: valueAxis },
        margin: { top: 18 },
        focus: 'group-x' as const,
        ...common,
      };
    });
  }, [list, isShown, labels, fmt, multi, stacked, horizontal, valueLabels, prefix, height]);

  const describe = useCallback(
    (points: readonly ChartPoint[]) => {
      const p = points.find((q) => q.markId === 'bars') ?? points[0];
      if (!p) return null;
      const label = String(horizontal ? p.yValue : p.xValue);
      if (!labels.includes(label)) return null;
      return {
        x: p.x,
        y: horizontal ? p.y : 0,
        title: label,
        rows: list.flatMap((s, i) => {
          const v = lookup[i]?.get(label);
          if (!isShown(i) || v === undefined) return [];
          return [
            {
              key: s.name,
              label: s.name,
              value: fmt(v),
              color: seriesColor(multi ? i : 0),
            },
          ];
        }),
      };
    },
    [list, lookup, labels, fmt, horizontal, multi, isShown],
  );
  const { plot, readout, show } = useReadout(describe);

  const flat = list.flatMap((s) => s.data.map((d) => ({ ...d, series: s.name })));
  const max = flat.reduce((m, d) => (d.value > (m?.value ?? -Infinity) ? d : m), flat[0]);
  const kind = `${horizontal ? 'Horizontal bar' : 'Bar'} chart`;
  const summary = multi
    ? `${title}. ${stacked ? 'Stacked' : 'Grouped'} ${kind.toLowerCase()} of ${labels.length} categories and ${list.length} series (${list.map((s) => s.name).join(', ')})${
        max ? `; highest ${max.series} in ${max.label} at ${fmt(max.value)}` : ''
      }. The data table follows.`
    : `${title}. ${kind} of ${labels.length} categories${
        max ? `; highest ${max.label} at ${fmt(max.value)}` : ''
      }. The data table follows.`;

  return (
    <ChartFigure
      title={title}
      description={description}
      className={className}
      legend={
        multi ? (
          <Legend
            items={list.map((s, i) => ({
              label: s.name,
              index: i,
              kind: 'bar' as const,
              fill: patternFill(prefix, i),
            }))}
            isShown={isShown}
            onToggle={toggle}
            shownCount={shownCount}
          />
        ) : null
      }
      data={
        multi
          ? {
              headers: ['Category', ...list.map((s) => s.name)],
              rows: labels.map((l) => [
                l,
                ...lookup.map((m) => {
                  const v = m.get(l);
                  return v === undefined ? '—' : fmt(v);
                }),
              ]),
            }
          : {
              headers: ['Category', 'Value'],
              rows: labels.map((l) => {
                const v = lookup[0]?.get(l);
                return [l, v === undefined ? '—' : fmt(v)];
              }),
            }
      }
    >
      <div ref={plot} className={CHART_PLOT}>
        {multi && <PatternDefs prefix={prefix} />}
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
