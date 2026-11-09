import { useId, useMemo, useState } from 'react';
import { useDebouncedValue, useLocalStorage } from '~/core/hooks';
import { param, useUrlState } from '~/core/router';
import {
  AreaChart,
  Button,
  ChartCard,
  Cluster,
  type Column,
  CopyButton,
  type CsvSink,
  DataTable,
  downloadCsv,
  FormField,
  Grid,
  Heading,
  Input,
  KpiRow,
  LineChart,
  type LineSeries,
  Meter,
  Money,
  Page,
  Panel,
  PromptDialog,
  Section,
  SegmentedControl,
  Slider,
  Stack,
  Text,
  ToolLayout,
  toast,
} from '~/core/ui';
import { formatMoney, formatPercent } from '~/core/utils';
import {
  projectSavings,
  type SavingsErrors,
  type SavingsInput,
  type SavingsRaw,
  type SavingsResult,
  type SavingsYear,
  validateSavings,
} from './savings';

/* The savings calculator. The inputs live in the URL (so a link reproduces the
   calculation) as the same text the boxes hold; every change re-validates and,
   when the inputs are valid, re-projects. Amounts are typed in pounds. Each
   number has a text box and a slider that edit the same text. Up to three
   scenarios can be saved (in this browser) and compared. */

const DEFAULTS: SavingsRaw = {
  initialMinor: '10000',
  monthlyMinor: '250',
  annualRatePct: '5',
  years: '10',
  compounding: 'monthly',
};

// Module-level: useUrlState reads the schema on every render.
const URL_SCHEMA = {
  start: param.string(DEFAULTS.initialMinor),
  monthly: param.string(DEFAULTS.monthlyMinor),
  rate: param.string(DEFAULTS.annualRatePct),
  years: param.string(DEFAULTS.years),
  comp: param.string(DEFAULTS.compounding),
};

const URL_KEY = {
  initialMinor: 'start',
  monthlyMinor: 'monthly',
  annualRatePct: 'rate',
  years: 'years',
  compounding: 'comp',
} as const;

const rawToUrl = (r: SavingsRaw) => ({
  start: r.initialMinor,
  monthly: r.monthlyMinor,
  rate: r.annualRatePct,
  years: r.years,
  comp: r.compounding,
});

const money = (minor: number) => formatMoney(minor);
const moneyCompact = (minor: number) => formatMoney(minor, 'GBP', { compact: true });
const pounds = (n: number) => formatMoney(n * 100).replace(/\.00$/, '');

const COMPOUNDING = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual', label: 'Annual' },
] as const;

interface NumberField {
  key: 'initialMinor' | 'monthlyMinor' | 'annualRatePct' | 'years';
  label: string;
  sliderLabel: string;
  inputMode: 'decimal' | 'numeric';
  min: number;
  max: number;
  step: number;
  format: (n: number) => string;
}

/* The slider's range is the useful part of the validated range; the box still
   accepts anything the validation does, and the slider then parks at its end. */
const FIELDS: readonly NumberField[] = [
  {
    key: 'initialMinor',
    label: 'Starting amount (£)',
    sliderLabel: 'Starting amount slider',
    inputMode: 'decimal',
    min: 0,
    max: 100_000,
    step: 500,
    format: pounds,
  },
  {
    key: 'monthlyMinor',
    label: 'Monthly contribution (£)',
    sliderLabel: 'Monthly contribution slider',
    inputMode: 'decimal',
    min: 0,
    max: 5_000,
    step: 25,
    format: pounds,
  },
  {
    key: 'annualRatePct',
    label: 'Annual rate (%)',
    sliderLabel: 'Annual rate slider',
    inputMode: 'decimal',
    min: 0,
    max: 25,
    step: 0.25,
    format: (n) => `${n}%`,
  },
  {
    key: 'years',
    label: 'Years',
    sliderLabel: 'Years slider',
    inputMode: 'numeric',
    min: 1,
    max: 50,
    step: 1,
    format: (n) => `${n} ${n === 1 ? 'year' : 'years'}`,
  },
];

/** The slider position for the box's text: its number, clamped; the default when it is not a number. */
function sliderValue(raw: string, f: NumberField): number {
  const n = Number(raw.trim().replace(/^£\s*/, '').replaceAll(',', ''));
  const v = raw.trim() === '' || !Number.isFinite(n) ? Number(DEFAULTS[f.key]) : n;
  return Math.min(f.max, Math.max(f.min, v));
}

const inPounds = (minor: number) => minor / 100;

const YEAR_COLUMNS: readonly Column<SavingsYear>[] = [
  {
    key: 'year',
    header: 'Year',
    sortable: true,
    footer: (rows) => `Final (year ${rows[rows.length - 1]?.year ?? 0})`,
  },
  {
    key: 'balanceMinor',
    header: 'Balance',
    align: 'end',
    cell: (y) => <Money minor={y.balanceMinor} />,
    csv: (y) => inPounds(y.balanceMinor),
    footer: (rows) => <Money minor={rows[rows.length - 1]?.balanceMinor ?? 0} />,
  },
  {
    key: 'contributedMinor',
    header: 'Contributed',
    align: 'end',
    cell: (y) => <Money minor={y.contributedMinor} />,
    csv: (y) => inPounds(y.contributedMinor),
    footer: (rows) => <Money minor={rows[rows.length - 1]?.contributedMinor ?? 0} />,
  },
  {
    key: 'interestMinor',
    header: 'Interest',
    align: 'end',
    cell: (y) => <Money minor={y.interestMinor} />,
    csv: (y) => inPounds(y.interestMinor),
    footer: (rows) => <Money minor={rows[rows.length - 1]?.interestMinor ?? 0} />,
  },
];

/* ---- scenarios ---- */

const MAX_SCENARIOS = 3;
const SCENARIO_KEY = 'app.savings.scenarios';
const LETTERS = ['A', 'B', 'C'] as const;

interface Scenario {
  id: number;
  name: string;
  raw: SavingsRaw;
}

interface ScenarioRun extends Scenario {
  input: SavingsInput;
  result: SavingsResult;
}

const isRaw = (v: unknown): v is SavingsRaw =>
  typeof v === 'object' &&
  v !== null &&
  (Object.keys(DEFAULTS) as (keyof SavingsRaw)[]).every(
    (k) => typeof (v as Record<string, unknown>)[k] === 'string',
  );

/** Whatever storage holds, reduced to well-formed scenarios (it is only a convenience). */
function sane(stored: unknown): Scenario[] {
  if (!Array.isArray(stored)) return [];
  return stored
    .filter(
      (s): s is Scenario =>
        typeof s === 'object' &&
        s !== null &&
        typeof (s as Scenario).id === 'number' &&
        typeof (s as Scenario).name === 'string' &&
        isRaw((s as Scenario).raw),
    )
    .slice(0, MAX_SCENARIOS);
}

const nextName = (scenarios: readonly Scenario[]) =>
  `Scenario ${LETTERS.find((l) => !scenarios.some((s) => s.name === `Scenario ${l}`)) ?? 'D'}`;

const describeInput = (i: SavingsInput) =>
  `${money(i.initialMinor)} start, ${money(i.monthlyMinor)} a month, ${i.annualRatePct}% for ${i.years} ${i.years === 1 ? 'year' : 'years'}, ${i.compounding}`;

const COMPARE_COLUMNS: readonly Column<ScenarioRun>[] = [
  { key: 'name', header: 'Scenario' },
  {
    key: 'start',
    header: 'Start',
    align: 'end',
    cell: (s) => <Money minor={s.input.initialMinor} />,
    sortValue: (s) => s.input.initialMinor,
  },
  {
    key: 'monthly',
    header: 'Monthly',
    align: 'end',
    cell: (s) => <Money minor={s.input.monthlyMinor} />,
    sortValue: (s) => s.input.monthlyMinor,
  },
  {
    key: 'rate',
    header: 'Rate',
    align: 'end',
    cell: (s) => `${s.input.annualRatePct}%`,
    sortValue: (s) => s.input.annualRatePct,
  },
  {
    key: 'years',
    header: 'Years',
    align: 'end',
    cell: (s) => s.input.years,
    sortValue: (s) => s.input.years,
  },
  {
    key: 'final',
    header: 'Final balance',
    align: 'end',
    cell: (s) => <Money minor={s.result.finalMinor} />,
    sortValue: (s) => s.result.finalMinor,
  },
  {
    key: 'interest',
    header: 'Interest',
    align: 'end',
    cell: (s) => <Money minor={s.result.interestMinor} />,
    sortValue: (s) => s.result.interestMinor,
  },
];

export interface ToolOnePageProps {
  /** Where "Export CSV" hands the file. Default: a browser download. Tests inject one. */
  csvSink?: CsvSink;
}

export default function ToolOnePage({ csvSink }: ToolOnePageProps = {}) {
  const base = useId();
  const [url, setUrl] = useUrlState(URL_SCHEMA);
  const raw: SavingsRaw = {
    initialMinor: url.start,
    monthlyMinor: url.monthly,
    annualRatePct: url.rate,
    years: url.years,
    compounding: url.comp,
  };
  const check = useMemo(
    () =>
      validateSavings({
        initialMinor: url.start,
        monthlyMinor: url.monthly,
        annualRatePct: url.rate,
        years: url.years,
        compounding: url.comp,
      }),
    [url.start, url.monthly, url.rate, url.years, url.comp],
  );
  const errors: SavingsErrors = check.ok ? {} : check.errors;
  const projection = useMemo(() => (check.ok ? projectSavings(check.value) : null), [check]);

  const update = (key: keyof SavingsRaw, value: string) => setUrl({ [URL_KEY[key]]: value });

  const ids = {
    initialMinor: `${base}-initial`,
    monthlyMinor: `${base}-monthly`,
    annualRatePct: `${base}-rate`,
    years: `${base}-years`,
    compounding: `${base}-compounding`,
  } as const;

  /* The sentence for screen readers. Debounced, so dragging a slider does not make the
     live region read out every step. */
  const sentence =
    projection && check.ok
      ? `After ${check.value.years} ${check.value.years === 1 ? 'year' : 'years'} you would have ${money(projection.finalMinor)}: ${money(projection.contributedMinor)} contributed and ${money(projection.interestMinor)} interest.`
      : 'Fix the highlighted fields to see the projection.';
  const announced = useDebouncedValue(sentence, 400);

  const reset = () => {
    setUrl(rawToUrl(DEFAULTS));
    toast.info('Reset to the starting numbers');
  };

  /* ---- scenarios ---- */
  const [stored, setStored] = useLocalStorage<unknown>(SCENARIO_KEY, []);
  const scenarios = useMemo(() => sane(stored), [stored]);
  const [naming, setNaming] = useState(false);
  const full = scenarios.length >= MAX_SCENARIOS;
  const fullId = `${base}-full`;

  const save = (name: string) => {
    if (!check.ok || full) return;
    const id = Math.max(0, ...scenarios.map((s) => s.id)) + 1;
    setStored([...scenarios, { id, name, raw }]);
    toast.success(`Saved ${name}`);
  };
  const remove = (s: Scenario) => {
    setStored(scenarios.filter((x) => x.id !== s.id));
    toast.info(`Removed ${s.name}`);
  };

  const runs = useMemo<ScenarioRun[]>(
    () =>
      scenarios.flatMap((s) => {
        const v = validateSavings(s.raw);
        return v.ok ? [{ ...s, input: v.value, result: projectSavings(v.value) }] : [];
      }),
    [scenarios],
  );
  const compareSeries: LineSeries[] = runs.map((r) => ({
    name: r.name,
    points: r.result.years.map((y) => ({ x: String(y.year), y: y.balanceMinor })),
  }));

  const exportCsv = () => {
    if (!projection) return;
    downloadCsv('savings-projection.csv', YEAR_COLUMNS, projection.years, csvSink);
    toast.success('Exported savings-projection.csv');
  };

  return (
    <Page
      title="Savings calculator"
      eyebrow="Tool 1"
      description="Project a savings balance from a starting amount, a monthly contribution and a rate."
      actions={
        <>
          <CopyButton
            text={() => window.location.href}
            label="Copy link"
            onCopy={() =>
              toast.success('Link copied', { description: 'Anyone with it sees this calculation.' })
            }
            onError={() =>
              toast.error('Could not copy the link', {
                description: 'Copy the address from the browser bar instead.',
              })
            }
          />
          <Button variant="outline" size="sm" onClick={reset}>
            Reset
          </Button>
        </>
      }
    >
      <ToolLayout
        inputsTitle="Your numbers"
        inputs={
          <>
            <Stack
              as="form"
              aria-label="Savings inputs"
              gap={4}
              onSubmit={(e) => e.preventDefault()}
            >
              {FIELDS.map((f) => (
                <Stack key={f.key} gap={2}>
                  <FormField id={ids[f.key]} label={f.label} error={errors[f.key]}>
                    <Input
                      inputMode={f.inputMode}
                      value={raw[f.key]}
                      onChange={(e) => update(f.key, e.target.value)}
                    />
                  </FormField>
                  <Slider
                    hideLabel
                    label={f.sliderLabel}
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    value={sliderValue(raw[f.key], f)}
                    formatValue={f.format}
                    showValue={false}
                    onValueChange={(v) => update(f.key, String(v))}
                  />
                </Stack>
              ))}
              <FormField id={ids.compounding} label="Compounding" error={errors.compounding}>
                {(c) => (
                  <SegmentedControl
                    id={c.id}
                    label="Compounding"
                    options={COMPOUNDING}
                    value={raw.compounding}
                    aria-describedby={c['aria-describedby']}
                    onValueChange={(v) => update('compounding', v)}
                    fullWidth
                  />
                )}
              </FormField>
            </Stack>
            <Stack gap={2} align="start">
              <Button
                onClick={() => setNaming(true)}
                disabled={!check.ok || full}
                aria-describedby={full ? fullId : undefined}
              >
                Save scenario
              </Button>
              {full && (
                <Text id={fullId} size="small" tone="muted">
                  You have saved {MAX_SCENARIOS} scenarios. Remove one to save another.
                </Text>
              )}
            </Stack>
          </>
        }
        resultsTitle="Projection"
        results={
          <>
            <Text aria-live="polite" className="sr-only">
              {announced}
            </Text>
            {projection && check.ok ? (
              <>
                <KpiRow
                  label="Projection figures"
                  cols={{ base: 1, sm: 3 }}
                  items={[
                    { label: 'Final balance', value: projection.finalMinor, format: money },
                    {
                      label: 'Total contributed',
                      value: projection.contributedMinor,
                      format: money,
                    },
                    {
                      label: 'Interest earned',
                      value: projection.interestMinor,
                      format: money,
                    },
                  ]}
                />
                <Panel gap={2}>
                  <Meter
                    label="Interest share"
                    value={
                      projection.finalMinor > 0
                        ? (projection.interestMinor / projection.finalMinor) * 100
                        : 0
                    }
                    formatValue={(v) => formatPercent(v / 100)}
                  />
                  <Text size="small" tone="muted">
                    Share of the final balance that came from interest.
                  </Text>
                </Panel>
                <ChartCard
                  title="Contributions and interest by year"
                  description="What you paid in, and the interest on top, at each year end."
                  headingLevel="h3"
                  height={260}
                >
                  <AreaChart
                    title="Contributions and interest by year"
                    height={260}
                    yFormat={moneyCompact}
                    stacked
                    series={[
                      {
                        name: 'Contributions',
                        points: projection.years.map((y) => ({
                          x: String(y.year),
                          y: y.contributedMinor,
                        })),
                      },
                      {
                        name: 'Interest',
                        points: projection.years.map((y) => ({
                          x: String(y.year),
                          y: y.interestMinor,
                        })),
                      },
                    ]}
                  />
                </ChartCard>
              </>
            ) : (
              <Panel>
                <Text size="small" tone="muted">
                  Fix the highlighted fields to see the projection.
                </Text>
              </Panel>
            )}

            <Section title="Scenarios" level={3} gap={3}>
              {scenarios.length === 0 ? (
                <Text size="small" tone="muted">
                  Save up to {MAX_SCENARIOS} versions of the numbers to compare them side by side.
                </Text>
              ) : (
                <Grid as="ul" minItemWidth={208} gap={3} aria-label="Saved scenarios">
                  {scenarios.map((s) => {
                    const run = runs.find((r) => r.id === s.id);
                    return (
                      <li key={s.id}>
                        <Panel gap={1} fullHeight>
                          <Heading level={4} size={4}>
                            {s.name}
                          </Heading>
                          <Text size="title">
                            {run ? <Money minor={run.result.finalMinor} /> : 'Not valid'}
                          </Text>
                          {run && (
                            <Text size="small" tone="muted">
                              {describeInput(run.input)}
                            </Text>
                          )}
                          <Cluster gap={2}>
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label={`Load ${s.name}`}
                              onClick={() => setUrl(rawToUrl(s.raw))}
                            >
                              Load
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label={`Remove ${s.name}`}
                              onClick={() => remove(s)}
                            >
                              Remove
                            </Button>
                          </Cluster>
                        </Panel>
                      </li>
                    );
                  })}
                </Grid>
              )}
              {runs.length >= 2 && (
                <>
                  <ChartCard
                    title="Scenario comparison"
                    description="Balance at each year end, one line per scenario."
                    headingLevel="h4"
                    height={260}
                  >
                    <LineChart
                      title="Scenario comparison"
                      height={260}
                      yFormat={moneyCompact}
                      series={compareSeries}
                    />
                  </ChartCard>
                  <Panel>
                    <DataTable
                      caption="Scenario comparison table"
                      columns={COMPARE_COLUMNS}
                      rows={runs}
                      rowKey={(r) => String(r.id)}
                      pageSize={0}
                      facets={false}
                      dense
                    />
                  </Panel>
                </>
              )}
            </Section>

            {projection && check.ok && (
              <Panel>
                <Section
                  title="Year by year"
                  level={3}
                  gap={3}
                  actions={
                    <Button variant="outline" size="sm" onClick={exportCsv}>
                      Export CSV
                    </Button>
                  }
                >
                  <DataTable
                    caption="Balance by year"
                    columns={YEAR_COLUMNS}
                    rows={projection.years}
                    rowKey={(y) => String(y.year)}
                    pageSize={projection.years.length <= 15 ? 0 : 10}
                    initialSort={{ key: 'year', dir: 'asc' }}
                  />
                </Section>
              </Panel>
            )}
          </>
        }
      />

      <PromptDialog
        open={naming}
        title="Save scenario"
        description="Give this set of numbers a name so you can tell it apart."
        label="Scenario name"
        defaultValue={nextName(scenarios)}
        submitText="Save"
        onSubmit={save}
        onClose={() => setNaming(false)}
      />
    </Page>
  );
}
