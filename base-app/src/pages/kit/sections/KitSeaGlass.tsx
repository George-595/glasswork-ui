import { useCallback, useState } from 'react';
import {
  Button,
  Cluster,
  forgetSeaGlassVerdict,
  Grid,
  Icon,
  type IconName,
  SeaGlass,
  type SeaGlassMode,
  type SeaGlassReason,
  SeaGlassStage,
  type SeaGlassView,
  SegmentedControl,
  Stack,
  Text,
} from '~/core/ui';
import { KitBlock, KitSection } from '../KitParts';

/* Section: the sea glass material (frosted glass pebbles on sunlit paper, adapted from
   Blueemi/sea-glass-demo). A small control centre built from SeaGlass pieces, with a switch
   for how it is drawn and a line saying what is showing and why: Auto lets the lag monitor
   decide (it watches the first five seconds and falls back to Still, or to Flat, on a device
   that struggles). */
const MODES = [
  { value: 'auto', label: 'Auto' },
  { value: 'live', label: 'Live' },
  { value: 'still', label: 'Still' },
  { value: 'flat', label: 'Flat' },
] as const;

const RANGES = ['Day', 'Week', 'Month'] as const;

const TABS: readonly { icon: IconName; label: string }[] = [
  { icon: 'home', label: 'Home' },
  { icon: 'chart', label: 'Reports' },
  { icon: 'mail', label: 'Inbox' },
  { icon: 'users', label: 'Team' },
];

const VIEW_LABEL: Record<SeaGlassView, string> = {
  live: 'Live',
  still: 'Still',
  flat: 'Flat',
};

const REASON: Record<SeaGlassReason, string> = {
  starting: 'animating, and timing the first five seconds',
  smooth: 'this device draws it smoothly',
  lagged: 'this device lagged, so it stopped animating',
  'too-slow': 'this device was far too slow, so the GPU was released',
  remembered: 'this browser lagged here earlier today',
  'low-power': 'this looks like a phone or a low-power device, so it draws once and rests',
  'reduced-motion': 'your system asks for reduced motion',
  'reduced-transparency': 'your system asks for reduced transparency',
  'no-webgl': 'WebGL is not available',
  waiting: 'waiting for the GPU',
  forced: 'chosen above',
};

export function SeaGlassSection() {
  const [mode, setMode] = useState<SeaGlassMode>('auto');
  const [status, setStatus] = useState<[SeaGlassView, SeaGlassReason]>(['flat', 'waiting']);
  const [aiMode, setAiMode] = useState(false);
  const [alerts, setAlerts] = useState(true);
  const [night, setNight] = useState(false);
  const [range, setRange] = useState<(typeof RANGES)[number]>('Week');
  const [tab, setTab] = useState('Home');
  const onViewChange = useCallback(
    (view: SeaGlassView, reason: SeaGlassReason) => setStatus([view, reason]),
    [],
  );

  return (
    <KitSection
      id="sea-glass"
      title="Sea glass"
      intro="Frosted glass pebbles on sunlit paper (moonlit in dark mode), drawn by one WebGL shader under ordinary elements. Hover lifts a piece, pressing sinks it, the pointer moves the sun."
    >
      <KitBlock
        title="Pieces on paper"
        note="If the device lags in the first five seconds it stops animating (Still), or drops the GPU entirely (Flat)."
        wide
      >
        <Stack gap={4}>
          <Cluster gap={3}>
            <SegmentedControl
              label="Drawn as"
              size="sm"
              options={MODES}
              value={mode}
              onValueChange={(v) => setMode(v as SeaGlassMode)}
            />
            <Button
              variant="neutral"
              size="sm"
              onClick={() => {
                forgetSeaGlassVerdict();
                window.location.reload();
              }}
            >
              Re-test this device
            </Button>
          </Cluster>
          <Text size="small" tone="muted" role="status">
            {VIEW_LABEL[status[0]]}: {REASON[status[1]]}.
          </Text>

          <SeaGlassStage variant="panel" mode={mode} onViewChange={onViewChange}>
            <Stack gap={5}>
              <Cluster gap={3} nowrap>
                <SeaGlass tint="periwinkle" shape="pill" grow>
                  <Icon name="search" size={18} />
                  <Text as="span" tone="muted" truncate>
                    Search the kit
                  </Text>
                  <SeaGlass
                    as="button"
                    type="button"
                    shape="pill"
                    pad="sm"
                    tint={aiMode ? 'orchid' : 'clear'}
                    lit={aiMode}
                    aria-pressed={aiMode}
                    onClick={() => setAiMode((v) => !v)}
                  >
                    <Icon name="sparkles" size={16} />
                    <Text as="span" size="small" weight="semibold">
                      AI mode
                    </Text>
                  </SeaGlass>
                </SeaGlass>
                <SeaGlass tint="coral" shape="circle" aria-hidden="true">
                  <Text as="span" weight="semibold">
                    G
                  </Text>
                </SeaGlass>
              </Cluster>

              <Grid minItemWidth={260} gap={5} align="start">
                <Cluster gap={3} nowrap>
                  <SeaGlass
                    as="button"
                    type="button"
                    tint={alerts ? 'aqua' : 'clear'}
                    aria-pressed={alerts}
                    onClick={() => setAlerts((v) => !v)}
                    grow
                  >
                    <Icon name="bell" size={18} />
                    <Stack gap={0}>
                      <Text as="span" weight="semibold">
                        Notifications
                      </Text>
                      <Text as="span" size="small" tone="muted">
                        {alerts ? 'On · 3 new' : 'Off'}
                      </Text>
                    </Stack>
                  </SeaGlass>
                  <SeaGlass
                    as="button"
                    type="button"
                    shape="circle"
                    tint={night ? 'amber' : 'clear'}
                    lit={night}
                    aria-pressed={night}
                    aria-label="Night light"
                    onClick={() => setNight((v) => !v)}
                  >
                    <Icon name="moon" size={18} />
                  </SeaGlass>
                </Cluster>

                <Cluster gap={2} nowrap role="group" aria-label="Range">
                  {RANGES.map((r) => (
                    <SeaGlass
                      key={r}
                      as="button"
                      type="button"
                      shape="tile"
                      tint={range === r ? 'seafoam' : 'clear'}
                      aria-pressed={range === r}
                      onClick={() => setRange(r)}
                      grow
                      justify="center"
                    >
                      {range === r && <Icon name="check" size={16} />}
                      <Text as="span" weight="semibold">
                        {r}
                      </Text>
                    </SeaGlass>
                  ))}
                </Cluster>
              </Grid>

              <Grid minItemWidth={260} gap={5} align="start">
                <SeaGlass tint="orchid" shape="card" pad="lg">
                  <Stack gap={1}>
                    <Text as="span" size="small" tone="muted">
                      This week
                    </Text>
                    <Text as="span" size="display" weight="semibold">
                      £12,480
                    </Text>
                    <Text as="span" size="small">
                      Up 8.2% on last week
                    </Text>
                  </Stack>
                </SeaGlass>

                <Stack gap={5} align="end">
                  <SeaGlass tint="aqua" shape="pill" pad="sm" block justify="between">
                    {TABS.map((t) => (
                      <SeaGlass
                        key={t.label}
                        as="button"
                        type="button"
                        shape="pill"
                        pad="sm"
                        bare={tab !== t.label}
                        aria-pressed={tab === t.label}
                        aria-label={t.label}
                        onClick={() => setTab(t.label)}
                      >
                        <Icon name={t.icon} size={18} />
                      </SeaGlass>
                    ))}
                  </SeaGlass>
                  <SeaGlass
                    as="button"
                    type="button"
                    shape="square"
                    pad="lg"
                    tint="amber"
                    aria-label="New item"
                  >
                    <Icon name="plus" size={20} />
                  </SeaGlass>
                </Stack>
              </Grid>
            </Stack>
          </SeaGlassStage>
        </Stack>
      </KitBlock>
    </KitSection>
  );
}
