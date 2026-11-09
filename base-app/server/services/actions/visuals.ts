import type { AgentVisual, Kpi, ValueFormat, VisualTool } from '../../../shared/api.ts';
import { type Infer, type ObjectSchema, validate } from '../../lib/schema.ts';
import type { DataService } from '../data.ts';
import { ServiceError } from '../errors.ts';
import { DATA_QUERY, describeSeries, resolveQuery } from './queries.ts';

/* The visuals the assistant can put in a chat, and that a person can pin as a saved view.
   Each is a schema (the show_* action's input) and a `render` that turns that input into an
   AgentVisual, reading the database where the input names a query. The chat and the Views
   page both draw through `renderVisual`, so a pinned chart is the same chart, re-read. */

const FORMAT = {
  type: 'string',
  enum: ['gbp', 'number', 'percent'],
  description: 'gbp: pounds (not pence). percent: a ratio, 0.12 is 12%. Default number.',
} as const;
const TITLE = { type: 'string', minLength: 1, maxLength: 120 } as const;
const DESCRIPTION = { type: 'string', maxLength: 300 } as const;
const SERIES = {
  type: 'array',
  maxItems: 8,
  description: 'Numbers you worked out yourself, only when no query can give them.',
  items: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 60 },
      points: {
        type: 'array',
        maxItems: 400,
        items: {
          type: 'object',
          properties: { x: { type: 'string', maxLength: 60 }, y: { type: 'number' } },
          required: ['x', 'y'],
          additionalProperties: false,
        },
      },
    },
    required: ['name', 'points'],
    additionalProperties: false,
  },
} as const;

export const SHOW_CHART = {
  type: 'object',
  properties: {
    title: TITLE,
    description: DESCRIPTION,
    chart: {
      type: 'string',
      enum: ['line', 'area', 'bar', 'donut'],
      description:
        'line/area for time, bar to compare groups, donut for parts of a whole (one series, few slices).',
    },
    format: FORMAT,
    query: DATA_QUERY,
    series: SERIES,
  },
  required: ['title', 'chart'],
  additionalProperties: false,
} as const;

export const SHOW_KPIS = {
  type: 'object',
  properties: {
    title: { type: 'string', maxLength: 120 },
    days: {
      type: 'integer',
      enum: [7, 30, 90],
      description:
        "The app's headline KPIs from the database, over this range against the one before.",
    },
    tiles: {
      type: 'array',
      maxItems: 8,
      description: 'Figures you worked out from tool results, when they are not the headline KPIs.',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', minLength: 1, maxLength: 60 },
          value: { type: 'number' },
          format: FORMAT,
          change: { type: 'number', description: 'Change as a ratio: 0.12 is up 12%.' },
          hint: { type: 'string', maxLength: 80 },
        },
        required: ['label', 'value'],
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
} as const;

export const SHOW_TABLE = {
  type: 'object',
  properties: {
    title: TITLE,
    description: DESCRIPTION,
    query: DATA_QUERY,
    columns: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        properties: {
          key: { type: 'string', minLength: 1, maxLength: 40 },
          label: { type: 'string', minLength: 1, maxLength: 60 },
          format: { type: 'string', enum: ['gbp', 'number', 'percent', 'text', 'date'] },
        },
        required: ['key', 'label'],
        additionalProperties: false,
      },
    },
    rows: {
      type: 'array',
      maxItems: 100,
      description: 'One object per row, keyed by the column keys; values are text or numbers.',
      items: { type: 'object' },
    },
  },
  required: ['title'],
  additionalProperties: false,
} as const;

export const SHOW_DIAGRAM = {
  type: 'object',
  properties: {
    title: TITLE,
    description: DESCRIPTION,
    direction: { type: 'string', enum: ['right', 'down'], description: 'Default right.' },
    nodes: {
      type: 'array',
      minItems: 2,
      maxItems: 24,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', minLength: 1, maxLength: 40, pattern: '^[A-Za-z0-9_-]+$' },
          label: { type: 'string', minLength: 1, maxLength: 60 },
          detail: { type: 'string', maxLength: 120 },
        },
        required: ['id', 'label'],
        additionalProperties: false,
      },
    },
    edges: {
      type: 'array',
      maxItems: 48,
      items: {
        type: 'object',
        properties: {
          from: { type: 'string', maxLength: 40 },
          to: { type: 'string', maxLength: 40 },
          label: { type: 'string', maxLength: 40 },
        },
        required: ['from', 'to'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'nodes', 'edges'],
  additionalProperties: false,
} as const;

export const VISUAL_SCHEMAS: Record<VisualTool, ObjectSchema> = {
  show_chart: SHOW_CHART,
  show_kpis: SHOW_KPIS,
  show_table: SHOW_TABLE,
  show_diagram: SHOW_DIAGRAM,
};
export const VISUAL_TOOLS = Object.keys(VISUAL_SCHEMAS) as VisualTool[];

const invalid = (message: string) => new ServiceError('invalid', 'invalid_input', message);

function exactlyOne(input: { query?: unknown; series?: unknown }, inline: string): void {
  if ((input.query === undefined) === (input[inline as 'series'] === undefined)) {
    throw invalid(`input: give exactly one of query or ${inline}`);
  }
}

async function chart(data: DataService, input: Infer<typeof SHOW_CHART>): Promise<AgentVisual> {
  exactlyOne(input, 'series');
  let series = input.series ?? [];
  let format: ValueFormat = input.format ?? 'number';
  if (input.query) {
    const r = await resolveQuery(data, input.query);
    series = r.series;
    format = input.format ?? r.format;
  }
  if (input.chart === 'donut') series = series.slice(0, 1);
  return {
    kind: 'chart',
    chart: input.chart,
    title: input.title,
    ...(input.description ? { description: input.description } : {}),
    format,
    series,
  };
}

const KPI_FORMAT: Record<Kpi['unit'], ValueFormat> = {
  money: 'gbp',
  count: 'number',
  percent: 'percent',
};

async function kpis(data: DataService, input: Infer<typeof SHOW_KPIS>): Promise<AgentVisual> {
  if (input.tiles && input.days !== undefined) throw invalid('input: give days or tiles, not both');
  const tiles = input.tiles
    ? input.tiles.map((t) => ({
        label: t.label,
        value: t.value,
        format: t.format ?? 'number',
        ...(t.change !== undefined ? { change: t.change } : {}),
        ...(t.hint ? { hint: t.hint } : {}),
      }))
    : (await data.kpis(input.days === undefined ? undefined : (input.days as 7 | 30 | 90))).map(
        (k) => ({
          label: k.label,
          value: k.unit === 'money' ? Math.round(k.value) / 100 : k.value,
          format: KPI_FORMAT[k.unit],
          ...(k.previous !== 0 ? { change: (k.value - k.previous) / Math.abs(k.previous) } : {}),
          hint: input.days ? `against the ${input.days} days before` : 'against the period before',
        }),
      );
  return { kind: 'kpis', ...(input.title ? { title: input.title } : {}), tiles };
}

const cell = (v: unknown): string | number | null =>
  typeof v === 'number' && Number.isFinite(v)
    ? v
    : typeof v === 'string'
      ? v.slice(0, 200)
      : typeof v === 'boolean'
        ? String(v)
        : null;

const GROUP_LABEL: Record<string, string> = {
  category: 'Category',
  status: 'Status',
  customer: 'Customer',
  day: 'Day',
  week: 'Week of',
  month: 'Month',
};

async function table(data: DataService, input: Infer<typeof SHOW_TABLE>): Promise<AgentVisual> {
  const head = {
    kind: 'table' as const,
    title: input.title,
    ...(input.description ? { description: input.description } : {}),
  };
  if (input.query) {
    if (input.columns || input.rows) throw invalid('input: give query, or columns and rows');
    const r = await resolveQuery(data, input.query);
    const by = input.query.dataset === 'transactions' ? (input.query.groupBy ?? 'category') : 'day';
    const first =
      input.query.dataset === 'signups'
        ? { key: 'x', label: 'Month', format: 'text' as const }
        : {
            key: 'x',
            label: GROUP_LABEL[by] ?? 'Group',
            format: by === 'day' || by === 'week' ? ('date' as const) : ('text' as const),
          };
    const xs = r.series[0]?.points.map((p) => p.x) ?? [];
    return {
      ...head,
      columns: [first, ...r.series.map((s) => ({ key: s.name, label: s.name, format: r.format }))],
      rows: xs.slice(0, 100).map((x, i) => ({
        x,
        ...Object.fromEntries(r.series.map((s) => [s.name, s.points[i]?.y ?? null])),
      })),
    };
  }
  if (!input.columns || !input.rows) throw invalid('input: give query, or columns and rows');
  const columns = input.columns.map((c) => ({
    key: c.key,
    label: c.label,
    ...(c.format ? { format: c.format } : {}),
  }));
  return {
    ...head,
    columns,
    rows: input.rows.map((row) =>
      Object.fromEntries(
        columns.map((c) => [c.key, cell((row as Record<string, unknown>)[c.key])]),
      ),
    ),
  };
}

function diagram(input: Infer<typeof SHOW_DIAGRAM>): AgentVisual {
  const ids = new Set<string>();
  for (const n of input.nodes) {
    if (ids.has(n.id)) throw invalid(`nodes: the id "${n.id}" is used twice`);
    ids.add(n.id);
  }
  for (const [i, e] of input.edges.entries()) {
    if (!ids.has(e.from)) throw invalid(`edges[${i}].from: no node "${e.from}"`);
    if (!ids.has(e.to)) throw invalid(`edges[${i}].to: no node "${e.to}"`);
  }
  return {
    kind: 'diagram',
    title: input.title,
    ...(input.description ? { description: input.description } : {}),
    direction: input.direction ?? 'right',
    nodes: input.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      ...(n.detail ? { detail: n.detail } : {}),
    })),
    edges: input.edges.map((e) => ({
      from: e.from,
      to: e.to,
      ...(e.label ? { label: e.label } : {}),
    })),
  };
}

/** Draws a visual from a show_* action's input (already checked against its schema). */
export async function renderVisual(
  data: DataService,
  tool: VisualTool,
  input: unknown,
): Promise<AgentVisual> {
  switch (tool) {
    case 'show_chart':
      return chart(data, input as Infer<typeof SHOW_CHART>);
    case 'show_kpis':
      return kpis(data, input as Infer<typeof SHOW_KPIS>);
    case 'show_table':
      return table(data, input as Infer<typeof SHOW_TABLE>);
    case 'show_diagram':
      return diagram(input as Infer<typeof SHOW_DIAGRAM>);
  }
}

/** Checks a saved view's stored input against its tool's schema, then draws it. */
export async function renderSaved(
  data: DataService,
  tool: string,
  spec: unknown,
): Promise<AgentVisual> {
  if (!(tool in VISUAL_SCHEMAS)) throw invalid(`Unknown visual "${tool.slice(0, 40)}"`);
  const t = tool as VisualTool;
  const r = validate(VISUAL_SCHEMAS[t], spec);
  if (!r.ok) throw invalid(r.error);
  return renderVisual(data, t, r.value);
}

/** What the model is told a visual showed: its kind, title and every number on it. */
export function describeVisual(v: AgentVisual): string {
  switch (v.kind) {
    case 'chart':
      return `Showed the person a ${v.chart} chart "${v.title}":\n${describeSeries(v.series, v.format)}`;
    case 'kpis':
      return `Showed the person KPI tiles${v.title ? ` "${v.title}"` : ''}: ${v.tiles
        .map(
          (t) =>
            `${t.label}=${t.value} [${t.format}]${t.change !== undefined ? ` change ${t.change.toFixed(3)}` : ''}`,
        )
        .join('; ')}`;
    case 'table':
      return `Showed the person a table "${v.title}" (${v.rows.length} rows): ${JSON.stringify(v.rows.slice(0, 30))}`;
    case 'diagram':
      return `Showed the person a diagram "${v.title}" with ${v.nodes.length} steps and ${v.edges.length} links.`;
    case 'link':
      return `Gave the person a link to ${v.path} ("${v.label}"). They open it themselves.`;
  }
}
