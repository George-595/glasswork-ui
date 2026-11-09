/* The controls matrix: every Button level in every state and size, every Toggle and
   Badge state, and the form controls in rest / invalid / disabled. The browser a11y
   gate scans the showcase in four themes, so everything here is contrast-checked in
   all of them. States are real attributes (aria-pressed, disabled, loading); hover has
   no static form, and its roles are covered by the colour gate. */
import {
  Badge,
  type BadgeAppearance,
  type BadgeTone,
  BUTTON_LEVELS,
  Button,
  type ButtonSize,
  Checkbox,
  Icon,
  Input,
  Label,
  NativeSelect,
  PanelHeader,
  SegmentedControl,
  Slider,
  Switch,
  Textarea,
  Toggle,
  ToggleGroup,
} from '../src/index';

const SIZES: readonly ButtonSize[] = ['sm', 'md', 'lg'];
const TONES: readonly BadgeTone[] = [
  'neutral',
  'brand',
  'success',
  'warning',
  'danger',
  'info',
  'up',
  'down',
];
const APPEARANCES: readonly BadgeAppearance[] = ['soft', 'outline', 'solid'];
const noop = () => {};
const row = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } as const;
const col = { display: 'flex', flexDirection: 'column', gap: 12 } as const;

export function ButtonMatrix() {
  return (
    <section style={col} data-testid="button-matrix">
      <PanelHeader title="Buttons">
        <Badge>{BUTTON_LEVELS.length} levels</Badge>
      </PanelHeader>
      {BUTTON_LEVELS.map((level) => (
        <div key={level} style={col} data-level={level}>
          {SIZES.map((size) => (
            <div key={size} style={row}>
              <Button variant={level} size={size}>
                {level} {size}
              </Button>
              <Button variant={level} size={size} aria-pressed="true">
                Pressed
              </Button>
              <Button variant={level} size={size} aria-pressed="false">
                Unpressed
              </Button>
              <Button variant={level} size={size} disabled>
                Disabled
              </Button>
              <Button variant={level} size={size} aria-disabled="true">
                Aria-disabled
              </Button>
              <Button variant={level} size={size} loading>
                Loading
              </Button>
            </div>
          ))}
          <div style={row}>
            <Button variant={level} size="icon" aria-label={`${level} add`}>
              <Icon name="plus" />
            </Button>
            <Button
              variant={level}
              size="icon"
              aria-label={`${level} add, pressed`}
              aria-pressed="true"
            >
              <Icon name="plus" />
            </Button>
            <Button variant={level} size="icon" aria-label={`${level} add, disabled`} disabled>
              <Icon name="plus" />
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}

export function ToggleStates() {
  return (
    <section style={col} data-testid="toggle-states">
      <PanelHeader title="Toggles" level={3} />
      <div style={row}>
        <Toggle defaultPressed={false}>Off</Toggle>
        <Toggle defaultPressed>On</Toggle>
        <Toggle disabled>Disabled</Toggle>
        <Toggle appearance="ghost" defaultPressed>
          Ghost on
        </Toggle>
        <Toggle size="icon" aria-label="Bold" defaultPressed>
          <Icon name="check" />
        </Toggle>
      </div>
      <ToggleGroup
        type="multiple"
        label="Columns"
        defaultValue={['name']}
        options={[
          { value: 'name', label: 'Name' },
          { value: 'status', label: 'Status' },
          { value: 'total', label: 'Total', disabled: true },
        ]}
      />
      <SegmentedControl
        label="Matrix range"
        defaultValue="30"
        options={[
          { value: '7', label: '7 days' },
          { value: '30', label: '30 days' },
          { value: '90', label: '90 days' },
        ]}
      />
    </section>
  );
}

export function BadgeMatrix() {
  return (
    <section style={col} data-testid="badge-matrix">
      <PanelHeader title="Badges" level={3} />
      {APPEARANCES.map((appearance) => (
        <div key={appearance} style={row}>
          {TONES.map((tone) => (
            <Badge key={tone} variant={tone} appearance={appearance}>
              {tone}
            </Badge>
          ))}
        </div>
      ))}
    </section>
  );
}

export function InputStates() {
  return (
    <section style={col} data-testid="input-states">
      <PanelHeader title="Inputs" />
      <div style={{ ...col, maxWidth: 360 }}>
        <Label htmlFor="cm-rest">Rest</Label>
        <Input id="cm-rest" placeholder="Type here" />
        <Label htmlFor="cm-invalid">Invalid</Label>
        <Input id="cm-invalid" aria-invalid="true" defaultValue="not an email" />
        <Label htmlFor="cm-disabled">Disabled</Label>
        <Input id="cm-disabled" disabled defaultValue="Locked" />
        <Label htmlFor="cm-notes">Textarea</Label>
        <Textarea id="cm-notes" rows={2} placeholder="Notes" />
        <Label htmlFor="cm-select">Select</Label>
        <NativeSelect id="cm-select" defaultValue="pg">
          <option value="pg">Postgres</option>
          <option value="mysql">MySQL</option>
        </NativeSelect>
        <Label htmlFor="cm-select-bad">Select, invalid</Label>
        <NativeSelect id="cm-select-bad" aria-invalid="true" defaultValue="pg">
          <option value="pg">Postgres</option>
        </NativeSelect>
      </div>
      <div style={row}>
        <Checkbox label="Unchecked" />
        <Checkbox label="Checked" defaultChecked />
        <Checkbox label="Mixed" indeterminate />
        <Checkbox label="Invalid" aria-invalid="true" />
        <Checkbox label="Disabled" disabled />
        <Checkbox label="Disabled checked" disabled defaultChecked />
      </div>
      <div style={row}>
        <Switch checked={false} onCheckedChange={noop} label="Switch off" />
        <Switch checked onCheckedChange={noop} label="Switch on" />
        <Switch checked={false} onCheckedChange={noop} label="Switch disabled" disabled />
        <Switch checked onCheckedChange={noop} label="Switch on, disabled" disabled />
      </div>
      <div style={{ ...col, maxWidth: 360 }}>
        <Slider label="Slider" defaultValue={40} />
        <Slider label="Slider disabled" defaultValue={40} disabled />
      </div>
    </section>
  );
}
