/* The display components on the showcase page, so the browser a11y gate (contrast) and the touch gate
   (48px) measure every state. Server-rendered, so every value is fixed and every handler a no-op. The
   Screensaver is a full-screen layer that only shows after idle, so the live one is rendered switched
   off; its tests drive it with fake timers. `ScreensaverSample` is a static copy of what it draws (the
   dimmer, the solid chip, a clock and a status line, in the same roles) laid out in the page, so the
   browser contrast pass measures the shown state too. */

import { Badge } from '../src/components/badge';
import { Button } from '../src/components/button';
import { PanelHeader } from '../src/components/panel-header';
import { Text } from '../src/components/typography/Text';
import { CellGrid } from '../src/display/CellGrid';
import { DirectionPad } from '../src/display/DirectionPad';
import { MediaTile } from '../src/display/MediaTile';
import { QrCode } from '../src/display/QrCode';
import { Screensaver } from '../src/display/Screensaver';
import { type PlayerStep, StepPlayer } from '../src/display/StepPlayer';
import { type SwatchOption, SwatchPicker } from '../src/display/SwatchPicker';
import { AppRoot } from '../src/shell/AppRoot';

const noop = () => {};

// a 1x1 transparent GIF: a picture that is there but has nothing to draw
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

const grid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
  gap: 12,
} as const;

const STEPS: readonly PlayerStep[] = [
  { id: 'a', atMs: 0, title: 'Front door opens', detail: 'Someone comes in' },
  { id: 'b', atMs: 40_000, title: 'Landing smoke alarm goes off', detail: 'Every light turns on' },
  { id: 'c', atMs: 90_000, title: 'Alarm is silenced' },
];

const COLOURS: readonly SwatchOption[] = [
  { value: 'red', label: 'Red', role: 'swatch-1' },
  { value: 'orange', label: 'Orange', role: 'swatch-2' },
  { value: 'amber', label: 'Amber', role: 'swatch-3' },
  { value: 'yellow', label: 'Yellow', role: 'swatch-4' },
  { value: 'green', label: 'Green', role: 'swatch-5' },
  { value: 'teal', label: 'Teal', role: 'swatch-6' },
  { value: 'blue', label: 'Blue', role: 'swatch-7' },
  { value: 'indigo', label: 'Indigo', role: 'swatch-8' },
  { value: 'violet', label: 'Violet', role: 'swatch-9' },
  { value: 'pink', label: 'Pink', role: 'swatch-10' },
];

const player = (over: Partial<Parameters<typeof StepPlayer>[0]> = {}) => (
  <StepPlayer
    title="Smoke alarm"
    description="What happens when the alarm goes off at night."
    steps={STEPS}
    durationMs={120_000}
    status="playing"
    positionMs={52_000}
    speed={1}
    onPlay={noop}
    onPause={noop}
    onRestart={noop}
    onSpeedChange={noop}
    {...over}
  />
);

/* What the Screensaver draws once shown, in the page's flow: the same dimmer roles, chip and text. */
function ScreensaverSample({ dim }: { dim: 'low' | 'medium' }) {
  return (
    <div
      data-sample={`screensaver-${dim}`}
      className={`grid place-items-center rounded-lg p-8 ${dim === 'low' ? 'bg-scrim' : 'bg-scrim-strong'}`}
    >
      <div className="max-w-[90vw] rounded-xl border border-solid border-border bg-surface-solid px-8 py-6 text-center text-fg">
        <Text as="p" size="display">
          19:42
        </Text>
        <Text as="p" tone="muted">
          Disarmed · all shut · 2 home
        </Text>
      </div>
    </div>
  );
}

export function ShowcaseDisplay() {
  return (
    <section aria-label="Display" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PanelHeader title="Display" />

      <div style={{ maxWidth: 720 }}>
        <CellGrid
          label="Watched areas"
          src={BLANK}
          alt="A still of the yard"
          value={new Set([13, 14, 25, 26, 40])}
          onChange={noop}
          cellName={({ column }) => (column < 4 ? 'Left' : column < 8 ? 'Middle' : 'Right')}
        />
      </div>

      <div style={grid}>
        <MediaTile
          title="Drive"
          poster={{ src: BLANK, alt: 'The drive', takenAt: '19:41:20' }}
          state="still"
          badges={<Badge variant="info">Motion</Badge>}
          action={<Button variant="neutral">Watch live</Button>}
          menu={
            <Button variant="ghost" size="icon" aria-label="More for Drive">
              …
            </Button>
          }
          onOpen={noop}
        />
        <MediaTile
          title="Garden"
          poster={{ src: BLANK, alt: 'The garden', takenAt: '19:40:02' }}
          state="connecting"
          action={<Button variant="neutral">Stop</Button>}
        />
        <MediaTile
          title="Doorbell"
          poster={{ src: BLANK, alt: 'The front door' }}
          state="live"
          live={<div />}
          badges={<Badge variant="brand">Person</Badge>}
          action={<Button variant="neutral">Stop</Button>}
          size="lg"
        />
        <MediaTile
          title="Shed"
          poster={{ src: BLANK, alt: 'The shed', takenAt: '14:02:11' }}
          state="unavailable"
          stateText="Offline since 14:02"
          action={
            <Button variant="neutral" disabled>
              Watch live
            </Button>
          }
        />
        <MediaTile
          title="Hall"
          poster={{ src: null, alt: 'No picture of the hall' }}
          state="off"
          stateText="Turned off by Sam"
          ratio="4/3"
        />
        <MediaTile
          title="Study"
          poster={{ src: null, alt: 'No picture of the study' }}
          state="still"
          ratio="1/1"
        />
      </div>

      <div style={grid}>
        {player()}
        {player({ status: 'paused', speed: 10 })}
        {player({ status: 'idle', positionMs: 0 })}
        {player({ status: 'done', positionMs: 120_000 })}
        {player({
          disabled: true,
          disabledReason: 'Another scenario is running.',
          status: 'idle',
          positionMs: 0,
        })}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
        <SwatchPicker label="Light colour" options={COLOURS} value="blue" onValueChange={noop} />
        <SwatchPicker
          label="Light colour, none chosen"
          options={COLOURS}
          value={null}
          onValueChange={noop}
          size="lg"
        />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
        <DirectionPad label="Remote" onPress={noop} />
        <DirectionPad label="Remote, large" onPress={noop} size="lg" />
        <DirectionPad label="Remote, off" onPress={noop} disabled />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
        <QrCode value="https://example.test/start?code=ABCDEFGH" label="an example address" />
        <QrCode value="Hello" label="a greeting" size="sm" />
      </div>

      <div style={grid}>
        <ScreensaverSample dim="medium" />
        <ScreensaverSample dim="low" />
      </div>

      <AppRoot kiosk aria-label="A kiosk root: nothing in it can be selected or zoomed">
        <Text>Kiosk root: selection, callout and double-tap zoom are off</Text>
      </AppRoot>

      <Screensaver idleMs={120_000} active={false}>
        <p>12:00</p>
      </Screensaver>
    </section>
  );
}
