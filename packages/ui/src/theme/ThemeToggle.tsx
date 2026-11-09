import { useId } from 'react';
import { Button } from '../components/button';
import { Label } from '../components/input';
import { NativeSelect } from '../components/native-select';
import { SegmentedControl } from '../components/segmented-control';
import { Icon } from '../icons/Icon';
import type { Skin, Theme, ThemeMode } from './useTheme';

/* ThemeToggle — one icon button that flips light/dark. Its accessible name
   says what pressing it does ("Switch to light mode"), which changes with
   the state, as in the trading dashboard's toggle. */
export interface ThemeToggleProps {
  theme: Theme;
  onToggle: () => void;
  className?: string;
}

export function ThemeToggle({ theme, onToggle, className }: ThemeToggleProps) {
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      onClick={onToggle}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
    </Button>
  );
}

/* SkinSelect — a labelled native select between the skins. */
export interface SkinSelectProps {
  skin: Skin;
  onChange: (skin: Skin) => void;
  label?: string;
}

export function SkinSelect({ skin, onChange, label = 'Theme' }: SkinSelectProps) {
  const id = useId();
  return (
    <span className="inline-flex items-center gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect id={id} value={skin} onChange={(e) => onChange(e.target.value as Skin)}>
        <option value="enterprise">Enterprise</option>
        <option value="glass">Glass</option>
      </NativeSelect>
    </span>
  );
}

/* AppearanceControls — the look, set in two full-width segmented switches a thumb can hit:
   Style (Enterprise | Glass) and Theme (Light | Dark | System). For a settings screen; the
   topbar keeps the one-tap ThemeToggle. */
export interface AppearanceControlsProps {
  skin: Skin;
  onSkinChange: (skin: Skin) => void;
  mode: ThemeMode;
  onModeChange: (mode: ThemeMode) => void;
}

const SKIN_OPTIONS = [
  { value: 'enterprise', label: 'Enterprise' },
  { value: 'glass', label: 'Glass' },
] as const;

const MODE_OPTIONS = [
  { value: 'light', label: <Segment icon="sun" text="Light" />, 'aria-label': 'Light' },
  { value: 'dark', label: <Segment icon="moon" text="Dark" />, 'aria-label': 'Dark' },
  { value: 'system', label: <Segment icon="monitor" text="System" />, 'aria-label': 'System' },
] as const;

function Segment({ icon, text }: { icon: 'sun' | 'moon' | 'monitor'; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon name={icon} size={16} />
      {text}
    </span>
  );
}

export function AppearanceControls({
  skin,
  onSkinChange,
  mode,
  onModeChange,
}: AppearanceControlsProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span aria-hidden className="text-sm font-medium text-fg-muted">
          Style
        </span>
        <SegmentedControl
          label="Style"
          options={SKIN_OPTIONS}
          value={skin}
          onValueChange={(v) => onSkinChange(v as Skin)}
          fullWidth
        />
      </div>
      <div className="flex flex-col gap-2">
        <span aria-hidden className="text-sm font-medium text-fg-muted">
          Theme
        </span>
        <SegmentedControl
          label="Theme"
          options={MODE_OPTIONS}
          value={mode}
          onValueChange={(v) => onModeChange(v as ThemeMode)}
          fullWidth
        />
      </div>
    </div>
  );
}
