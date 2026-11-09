import { cssVar } from '@apps/colors';
import { Badge } from '../components/badge';
import { type ChartCommonProps, ChartFigure } from './ChartFrame';
import { defaultFormat } from './scale';

/* FunnelChart — how many make it through each step of a process (visited → signed up → paid),
   and where the most are lost. The idea is EasyUI's funnel chart (github.com/Surajmaurya1/easyui,
   MIT); nothing of its code is used: this is drawn on the kit's roles and frame.

   Each stage is a row: its name, its count and its share of the first stage, over a bar centred
   in the row whose width is that share. Between two rows a tapered band joins the bars and a line
   says what happened in words ("62% went on · 450 dropped"); the step that lost the most is marked
   "Biggest drop" in a badge, in words, so it never rests on colour.

   Access: the rows are a real ordered list (each one reads "Signed up: 1,240, 41% of Visited"),
   the bars and bands are aria-hidden drawing, and the frame adds the caption and the data table
   ChartCard can show. Nothing in it moves or takes focus: it is read, not explored. */
export interface FunnelChartProps extends Omit<ChartCommonProps, 'height'> {
  /** The stages, first to last. A later stage larger than an earlier one is drawn as it is. */
  data: readonly { label: string; value: number }[];
  valueFormat?: (n: number) => string;
  /** Mark the step that lost the most. Default true. */
  showBiggestDrop?: boolean;
}

const percent = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 1 });
const BAND = cssVar('chart-1');

/** The step (index of the stage after it) with the largest drop by share of the stage before,
    or -1 when nothing drops. */
export function biggestDrop(values: readonly number[]): number {
  let at = -1;
  let worst = 0;
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1] ?? 0;
    const lost = prev > 0 ? (prev - (values[i] ?? 0)) / prev : 0;
    if (lost > worst) {
      worst = lost;
      at = i;
    }
  }
  return at;
}

export function FunnelChart({
  data,
  title,
  description,
  className,
  emptyMessage,
  valueFormat = defaultFormat,
  showBiggestDrop = true,
}: FunnelChartProps) {
  const stages = data.map((d) => ({ label: d.label, value: Math.max(0, d.value) }));
  const first = stages[0]?.value ?? 0;
  const top = Math.max(0, ...stages.map((s) => s.value));
  const share = (v: number) => (first > 0 ? v / first : 0);
  const width = (v: number) => (top > 0 ? Math.max(v > 0 ? 2 : 0, (v / top) * 100) : 0);
  const drop = showBiggestDrop ? biggestDrop(stages.map((s) => s.value)) : -1;

  return (
    <ChartFigure
      title={title}
      description={description}
      className={className}
      empty={stages.length === 0 || top === 0}
      emptyMessage={emptyMessage}
      data={{
        headers: ['Stage', 'Count', 'Share of first', 'Went on from previous'],
        rows: stages.map((s, i) => {
          const prev = stages[i - 1]?.value;
          return [
            s.label,
            valueFormat(s.value),
            percent.format(share(s.value)),
            prev === undefined ? '—' : prev > 0 ? percent.format(s.value / prev) : '—',
          ];
        }),
      }}
    >
      <ol
        className="ui-funnel m-0 flex min-w-0 list-none flex-col p-0"
        aria-label={`${title}: stages`}
      >
        {stages.map((s, i) => {
          const prev = stages[i - 1];
          const lost = prev ? Math.max(0, prev.value - s.value) : 0;
          const wentOn = prev && prev.value > 0 ? s.value / prev.value : null;
          const isDrop = i === drop;
          return (
            <li key={s.label} className="ui-funnel-stage flex min-w-0 flex-col">
              {prev && (
                <div className="ui-funnel-step flex min-w-0 flex-col items-center">
                  <svg
                    viewBox="0 0 100 14"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                    focusable="false"
                    className="block h-3.5 w-full forced-colors:[forced-color-adjust:none]"
                  >
                    <polygon
                      points={band(width(prev.value), width(s.value))}
                      fill={BAND}
                      fillOpacity={0.22}
                    />
                  </svg>
                  <p className="m-0 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 py-1 text-center text-xs/[1.4] text-fg-muted tabular-nums">
                    <span>
                      {wentOn === null ? 'None to go on' : `${percent.format(wentOn)} went on`}
                      {lost > 0 && ` · ${valueFormat(lost)} dropped`}
                    </span>
                    {isDrop && (
                      <Badge variant="warning" className="ui-funnel-drop">
                        Biggest drop
                      </Badge>
                    )}
                  </p>
                </div>
              )}
              <div className="ui-funnel-row flex min-w-0 flex-col gap-1.5">
                <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 text-[13px]/[1.4]">
                  <span className="ui-funnel-label min-w-0 font-medium text-fg">{s.label}</span>
                  <span className="ui-funnel-value text-fg-muted tabular-nums">
                    <strong className="font-semibold text-fg">{valueFormat(s.value)}</strong>
                    {i > 0 && first > 0 && (
                      <>
                        {' · '}
                        {percent.format(share(s.value))}
                        <span className="ui-sr-only"> of {stages[0]?.label}</span>
                      </>
                    )}
                  </span>
                </div>
                <div
                  aria-hidden="true"
                  className="flex h-7 min-w-0 justify-center rounded-xs bg-sunken"
                >
                  <div
                    className="ui-funnel-bar h-full rounded-xs bg-chart-1 forced-colors:[forced-color-adjust:none] motion-safe:transition-[width] motion-safe:duration-(--dur-slow) motion-safe:ease-(--ease-out)"
                    style={{ width: `${width(s.value)}%` }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </ChartFigure>
  );
}

/** The band from a bar `a`% wide above to one `b`% wide below, both centred, in a 100×14 box. */
function band(a: number, b: number): string {
  const l1 = (100 - a) / 2;
  const l2 = (100 - b) / 2;
  return `${l1},0 ${l1 + a},0 ${l2 + b},14 ${l2},14`;
}
