import { type ChartPoint, defineChart } from '@tanstack/charts';
import { pie, polar, radialArc, radialText } from '@tanstack/charts/polar';
import { Chart } from '@tanstack/charts/react';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { useCallback, useMemo } from 'react';
import { cn } from '../lib/cn';
import {
  CHART_PLOT,
  CHART_THEME,
  type ChartCommonProps,
  ChartFigure,
  PAINT,
  Readout,
  SVG_ANIMATION,
  seriesColor,
  useReadout,
} from './ChartFrame';
import { defaultFormat } from './scale';

/* DonutChart — parts of a whole, drawn with @tanstack/charts' polar marks in
   the look of its shadcn "Pie Chart - Donut" catalog case
   (163-shadcn-pie-donut). Slices run clockwise from 12 o'clock in data
   order. Each slice of 4% or more is numbered just outside the ring, and the
   legend repeats the number with the label, value and share, so a slice is
   matched to its label without relying on colour. Gaps between slices keep
   neighbours apart. Keep it to five or so parts: the palette has five
   colours. */
export interface DonutChartProps extends ChartCommonProps {
  data: readonly { label: string; value: number }[];
  /** Text in the hole, e.g. the total. */
  centerLabel?: string;
  valueFormat?: (n: number) => string;
}

const pct = (n: number) => `${(n * 100).toLocaleString('en-GB', { maximumFractionDigits: 1 })}%`;
const TURN = Math.PI * 2;

export function DonutChart(props: DonutChartProps) {
  if (props.data.length === 0) {
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
  return <DonutChartPlot {...props} />;
}

function DonutChartPlot({
  title,
  description,
  height = 220,
  className,
  data,
  centerLabel,
  valueFormat = defaultFormat,
}: DonutChartProps) {
  const size = height;
  const total = data.reduce((s, d) => s + Math.max(0, d.value), 0);
  const slices = useMemo(
    () =>
      data.map((d, i) => ({
        label: d.label,
        raw: d.value,
        i,
        share: total > 0 ? Math.max(0, d.value) / total : 0,
      })),
    [data, total],
  );

  const definition = useMemo(() => {
    const arcs =
      total > 0
        ? pie(
            slices.map((s) => ({ ...s, amount: Math.max(0, s.raw) })),
            { value: 'amount' },
          )
        : [];
    const numbered = arcs.filter((a) => a.share >= 0.04);
    const center = centerLabel ? [{ id: 'center', text: centerLabel }] : [];
    return defineChart({
      marks: [
        polar({
          radiusRatio: 0.84,
          scales: {
            angle: { scale: scaleLinear().domain([0, TURN]) },
            radius: { scale: scaleLinear().domain([0, 1]) },
          },
          marks: [
            radialArc(arcs, {
              id: 'slices',
              key: 'label',
              innerRadius: ({ radius }) => radius * 0.62,
              cornerRadius: 3,
              fill: (a) => seriesColor(a.i),
              stroke: PAINT.gap,
              strokeWidth: 2,
              states: [{ when: { focus: 'unmatched' }, style: { fillOpacity: 0.45 } }],
            }),
            radialText(numbered, {
              id: 'numbers',
              key: 'label',
              angle: 'angle',
              radius: 1,
              radiusOffset: 11,
              text: (a) => String(a.i + 1),
              baseline: 'middle',
              fill: PAINT.label,
              fontSize: 11,
              fontWeight: 500,
            }),
            radialText(center, {
              id: 'center',
              key: 'id',
              angle: 0,
              radius: 0,
              text: 'text',
              baseline: 'middle',
              fill: PAINT.strong,
              fontSize: 14,
              fontWeight: 600,
            }),
          ],
        }),
      ],
      scales: { x: null, y: null },
      margin: 0,
      theme: CHART_THEME,
      focusRing: false,
      svgAnimation: SVG_ANIMATION,
    });
  }, [slices, total, centerLabel]);

  const describe = useCallback(
    (points: readonly ChartPoint[]) => {
      const p = points.find((q) => q.markId === 'slices') ?? points[0];
      const datum = p?.datum;
      const i =
        datum && typeof datum === 'object' && 'i' in datum && typeof datum.i === 'number'
          ? datum.i
          : -1;
      const s = slices[i];
      if (!p || !s) return null;
      return {
        x: p.x,
        y: p.y - 24,
        title: `${s.i + 1}. ${s.label}`,
        rows: [
          {
            key: 'v',
            label: valueFormat(s.raw),
            value: pct(s.share),
            color: seriesColor(s.i),
          },
        ],
      };
    },
    [slices, valueFormat],
  );
  const { plot, readout, show } = useReadout(describe);

  const summary = `${title}. Donut chart of ${data.length} parts${
    centerLabel ? `, ${centerLabel}` : ''
  }: ${slices.map((s) => `${s.label} ${pct(s.share)}`).join(', ')}.`;

  return (
    <ChartFigure
      title={title}
      description={description}
      className={className}
      data={{
        headers: ['Part', 'Value', 'Share'],
        rows: slices.map((s) => [s.label, valueFormat(s.raw), pct(s.share)]),
      }}
    >
      <div className="ui-donut flex flex-wrap items-center gap-x-6 gap-y-4">
        <div
          ref={plot}
          className={cn(CHART_PLOT, 'ui-donut-plot flex-none')}
          style={{ width: size }}
        >
          <Chart
            definition={definition}
            width={size}
            height={size}
            ariaLabel={summary}
            onFocusGroupChange={show}
          />
          <Readout state={readout} />
        </div>
        <ol className="ui-chart-legend ui-donut-legend m-0 flex min-w-45 flex-1 list-none flex-col gap-1.5 p-0 text-[13px] leading-normal text-fg-muted">
          {slices.map((s) => (
            <li key={s.label} className="grid grid-cols-[12px_1.4em_1fr_auto] items-center gap-2">
              <span
                className="ui-donut-swatch size-3 rounded-[3px] forced-colors:[forced-color-adjust:none]"
                style={{ background: seriesColor(s.i) }}
                aria-hidden="true"
              />
              <span className="ui-donut-num tabular-nums text-fg-subtle" aria-hidden="true">
                {s.i + 1}
              </span>
              <span className="ui-donut-label text-fg">{s.label}</span>
              <span className="ui-donut-value tabular-nums text-fg-muted">
                {valueFormat(s.raw)} · {pct(s.share)}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </ChartFigure>
  );
}
