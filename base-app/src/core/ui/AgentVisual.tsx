import {
  AreaChart,
  BarChart,
  Button,
  buttonAttrs,
  Card,
  CardContent,
  ChartCard,
  DataTable,
  DonutChart,
  FlowDiagram,
  Icon,
  KpiRow,
  LineChart,
  Stack,
  Text,
} from '@apps/ui';
import type { AgentVisual, ValueFormat } from '~/core/api';
import { Link } from '~/core/router';
import { formatDate, formatMoney, formatNumber, formatPercent } from '~/core/utils';

/* AgentVisualView — draws one thing the assistant showed (services/actions/visuals.ts on the
   server): a chart, key-figure tiles, a table, a flow diagram or a link to a page, with the
   kit's own components, so a chart in a chat looks and reads like one on the Graphs page.

   Numbers arrive ready to show: `gbp` values are pounds (formatMoney takes pence, hence the
   x100), `percent` is a ratio. With `onPin`, a chart, tiles, table or diagram offers "Pin to
   Views" (the page saves it with the save_view action); `pinned` turns it into a receipt. */
export interface AgentVisualViewProps {
  visual: AgentVisual;
  onPin?: () => void;
  pinned?: boolean;
  /** Pinning is in flight. */
  pinning?: boolean;
}

export function formatValue(format: ValueFormat | undefined, compact = false) {
  if (format === 'gbp') return (n: number) => formatMoney(Math.round(n * 100), 'GBP', { compact });
  if (format === 'percent') return (n: number) => formatPercent(n);
  return (n: number) => formatNumber(n, compact ? { compact: true } : undefined);
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function PinButton({ onPin, pinned, pinning }: Omit<AgentVisualViewProps, 'visual'>) {
  if (!onPin) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onPin}
      disabled={pinned || pinning}
      aria-live="polite"
    >
      <Icon name={pinned ? 'check' : 'pin'} size={16} />
      {pinned ? 'Pinned to Views' : pinning ? 'Pinning…' : 'Pin to Views'}
    </Button>
  );
}

export function AgentVisualView({ visual, ...pin }: AgentVisualViewProps) {
  switch (visual.kind) {
    case 'chart': {
      const fmt = formatValue(visual.format, true);
      const first = visual.series[0];
      const empty = visual.series.every((s) => s.points.length === 0);
      const labels = first?.points.map((p) => p.x) ?? [];
      const horizontal = labels.length > 6 && !labels.every((l) => ISO_DAY.test(l));
      const common = { title: visual.title, description: visual.description, height: 260 };
      return (
        <ChartCard
          title={visual.title}
          description={visual.description}
          actions={<PinButton {...pin} />}
          empty={empty}
          height={260}
        >
          {visual.chart === 'line' ? (
            <LineChart {...common} series={visual.series} yFormat={fmt} />
          ) : visual.chart === 'area' ? (
            <AreaChart {...common} series={visual.series} yFormat={fmt} />
          ) : visual.chart === 'donut' ? (
            <DonutChart
              title={visual.title}
              description={visual.description}
              data={(first?.points ?? []).map((p) => ({ label: p.x, value: p.y }))}
              valueFormat={fmt}
            />
          ) : visual.series.length === 1 ? (
            <BarChart
              {...common}
              orientation={horizontal ? 'horizontal' : 'vertical'}
              data={(first?.points ?? []).map((p) => ({ label: p.x, value: p.y }))}
              valueFormat={fmt}
            />
          ) : (
            <BarChart
              {...common}
              orientation={horizontal ? 'horizontal' : 'vertical'}
              series={visual.series.map((s) => ({
                name: s.name,
                data: s.points.map((p) => ({ label: p.x, value: p.y })),
              }))}
              valueFormat={fmt}
            />
          )}
        </ChartCard>
      );
    }
    case 'kpis':
      return (
        <Stack gap={2}>
          <KpiRow
            label={visual.title ?? 'Key figures'}
            items={visual.tiles.map((t) => ({
              id: t.label,
              label: t.label,
              value: t.value,
              format: formatValue(t.format),
              ...(t.change !== undefined ? { delta: t.change } : {}),
              ...(t.hint ? { footnote: t.hint } : {}),
            }))}
          />
          <PinButton {...pin} />
        </Stack>
      );
    case 'table': {
      type Row = Record<string, string | number | null> & { __key: string };
      const rows: Row[] = visual.rows.map((r, i) => ({ ...r, __key: String(i) }));
      return (
        <Stack gap={2}>
          <DataTable<Row>
            caption={visual.title}
            rows={rows}
            rowKey={(r) => r.__key}
            pageSize={10}
            columns={visual.columns.map((c) => {
              const numeric = c.format === 'gbp' || c.format === 'number' || c.format === 'percent';
              const fmt = numeric ? formatValue(c.format as ValueFormat) : null;
              return {
                key: c.key,
                header: c.label,
                align: numeric ? ('end' as const) : ('start' as const),
                sortable: true,
                sortValue: (r: Row) => r[c.key] ?? '',
                cell: (r: Row) => {
                  const v = r[c.key];
                  if (v === null || v === undefined) return '—';
                  if (fmt && typeof v === 'number') return fmt(v);
                  if (c.format === 'date' && typeof v === 'string' && ISO_DAY.test(v.slice(0, 10)))
                    return formatDate(v.slice(0, 10));
                  return String(v);
                },
              };
            })}
          />
          <PinButton {...pin} />
        </Stack>
      );
    }
    case 'diagram':
      return (
        <Card>
          <CardContent>
            <Stack gap={2}>
              <FlowDiagram
                title={visual.title}
                description={visual.description}
                direction={visual.direction}
                nodes={visual.nodes}
                edges={visual.edges}
              />
              <PinButton {...pin} />
            </Stack>
          </CardContent>
        </Card>
      );
    case 'link':
      return (
        <Stack gap={1}>
          <Link to={visual.path} {...buttonAttrs('outline', 'sm')}>
            {visual.label}
            <Icon name="chevron-right" size={16} />
          </Link>
          {visual.description && <Text size="small">{visual.description}</Text>}
        </Stack>
      );
  }
}
