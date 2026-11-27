/* The controls on the showcase page (wired into Showcase.tsx with one line), so the browser
   a11y gate (contrast) and the touch gate (48px) measure every state. Server-rendered, so every
   value is fixed and every handler a no-op. */
import {
  ControlTile,
  Countdown,
  HoldToConfirm,
  Keypad,
  LevelSlider,
  PanelHeader,
  SegmentedControl,
  StatusDot,
  ValueStepper,
} from '../src/index';

const noop = () => {};
const NOW = Date.UTC(2026, 10, 10, 12, 0, 0);

const VIEWS = [
  { value: 'a', label: 'Day', icon: 'sun' },
  { value: 'b', label: 'Night', icon: 'moon' },
  { value: 'c', label: 'Away', icon: 'plane' },
] as const;

const grid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
  gap: 12,
} as const;

export function ControlsShowcase() {
  return (
    <section aria-label="Controls" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PanelHeader title="Controls" />

      <div style={grid}>
        <ControlTile
          label="Lamp"
          context="Hall"
          icon="lightbulb"
          status="On · 70 %"
          tone="active"
          action={{ kind: 'toggle', pressed: true, onPressedChange: noop }}
          secondary={{ label: 'Lamp details', onClick: noop }}
          meta={<span className="sr-only">70 percent</span>}
        />
        <ControlTile
          label="Fan"
          context="Study"
          icon="fan"
          status="Off"
          action={{ kind: 'toggle', pressed: false, onPressedChange: noop }}
        />
        <ControlTile
          label="Heater"
          context="Landing"
          icon="flame"
          status="Heating to 20 °C"
          tone="warning"
          state="pending"
          stateText="Switching on…"
          action={{ kind: 'toggle', pressed: true, onPressedChange: noop }}
        />
        <ControlTile
          label="Garage"
          context="Outside"
          icon="door-closed"
          status="Closed"
          tone="success"
          state="failed"
          stateText="Couldn't reach it"
          action={{ kind: 'toggle', pressed: false, onPressedChange: noop }}
        />
        <ControlTile
          label="Speaker"
          context="Kitchen"
          icon="speaker"
          status="Offline"
          tone="danger"
          state="unavailable"
          stateText="Not reachable right now"
          action={{ kind: 'toggle', pressed: false, onPressedChange: noop }}
        />
        <ControlTile
          label="Blinds"
          context="Lounge"
          icon="blinds"
          status="Open 40 %"
          action={{ kind: 'open', href: '#controls' }}
          secondary={{ label: 'Blinds settings', icon: 'settings', href: '#controls' }}
        />
        <ControlTile
          label="Router"
          icon="router"
          status="Online"
          tone="success"
          action={{ kind: 'open', onOpen: noop }}
        />
        <ControlTile
          label="Temperature"
          context="Bedroom"
          icon="thermometer"
          status="19.4 °C"
          action={{ kind: 'none' }}
        />
        <ControlTile
          label="Lamp"
          context="Wall display"
          icon="lightbulb"
          status="On"
          tone="active"
          size="lg"
          action={{ kind: 'toggle', pressed: true, onPressedChange: noop }}
        />
        <ControlTile
          label="Plug"
          icon="plug"
          status="Off"
          size="sm"
          action={{ kind: 'toggle', pressed: false, onPressedChange: noop }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 420 }}>
        <LevelSlider label="Brightness" value={70} formatValue={(v) => `${v} %`} />
        <LevelSlider
          label="Warmth"
          value={30}
          size="lg"
          ends={{ min: 'Warm', max: 'Cool' }}
          ghost={55}
          ghostLabel="Confirmed 55 %"
          formatValue={(v) => `${v} %`}
        />
        <LevelSlider label="Volume" value={50} size="xl" formatValue={(v) => `${v} %`} />
        <LevelSlider label="Locked level" value={20} disabled formatValue={(v) => `${v} %`} />
      </div>
      <div style={{ display: 'flex', gap: 24 }}>
        <LevelSlider
          label="Position"
          value={60}
          orientation="vertical"
          size="lg"
          ends={{ min: 'Closed', max: 'Open' }}
          formatValue={(v) => `${v} %`}
        />
        <ValueStepper
          label="Target"
          value={19.5}
          min={10}
          max={28}
          step={0.5}
          onValueChange={noop}
          format={(v) => `${v.toFixed(1)} °C`}
          status="Heating to 19.5 °C…"
        />
        <ValueStepper
          label="Target (at the limit)"
          value={28}
          min={10}
          max={28}
          step={0.5}
          size="lg"
          onValueChange={noop}
          format={(v) => `${v.toFixed(1)} °C`}
        />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        <StatusDot tone="neutral" label="Idle" />
        <StatusDot tone="success" label="Online" />
        <StatusDot tone="info" label="Updating" />
        <StatusDot tone="warning" label="Low battery" />
        <StatusDot tone="danger" label="Offline" size="lg" />
        <StatusDot tone="active" label="Armed" pulse size="sm" />
        <StatusDot tone="success" label="Connected" showLabel={false} />
        <span>Connected</span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center' }}>
        <Countdown label="Exit delay" until={NOW + 42_000} now={NOW} />
        <Countdown label="Approval expires" until={NOW + 65 * 60_000} now={NOW} tone="warning" />
        <Countdown
          label="Exit delay"
          variant="ring"
          until={NOW + 20_000}
          now={NOW}
          total={60_000}
        />
        <Countdown
          label="Entry delay"
          variant="ring"
          size="lg"
          until={NOW + 8_000}
          now={NOW}
          total={30_000}
          tone="danger"
        />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32 }}>
        <Keypad
          label="Enter your code"
          length={{ min: 4, max: 6 }}
          onSubmit={noop}
          submitLabel="Unlock"
          message="Wrong code. 2 tries left."
          error
        />
        <Keypad label="Enter the wall code" length={{ min: 4, max: 4 }} onSubmit={noop} size="lg" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
        <SegmentedControl label="Mode" options={VIEWS} value="a" size="lg" fullWidth />
        <SegmentedControl label="Mode, small" options={VIEWS} value="b" />
        <HoldToConfirm
          label="Hold to unlock"
          icon="lock-open"
          description="Everyone in the household will be told."
          size="xl"
          variant="primary"
          onConfirm={noop}
        />
      </div>
    </section>
  );
}
