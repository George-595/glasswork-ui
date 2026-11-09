import {
  AppearanceControls,
  BACKDROPS,
  type Backdrop,
  BackdropSwatch,
  ChoiceCard,
  FormSection,
  Grid,
  PRESET_LABELS,
  type ShaderPreset,
  Stack,
  Switch,
  setSoundEnabled,
  useSoundEnabled,
} from '~/core/ui';
import { BACKDROP_LABEL, type ModePref, type Settings } from './settings';

/* Appearance: the kit's AppearanceControls (Style: Enterprise | Glass, Theme: Light | Dark |
   System) and, for the glass skin, the backdrop as a card per scene. Everything here is a draft
   until the page's Save; nothing changes the live theme while you choose. The Sounds switch is the
   exception: it is a per-device setting (the kit's `ui-sounds`) that applies at once. */
function backdropLabel(b: Backdrop): string {
  return BACKDROP_LABEL[b] ?? PRESET_LABELS[b as ShaderPreset];
}

export interface AppearanceSectionProps {
  value: Settings;
  onChange: (patch: Partial<Settings>) => void;
}

export function AppearanceSection({ value, onChange }: AppearanceSectionProps) {
  const sounds = useSoundEnabled();
  return (
    <Stack gap={5}>
      <FormSection
        title="Style and theme"
        description="Enterprise or Glass, and Light, Dark or System (which follows your device when you save)."
      >
        <AppearanceControls
          skin={value.skin}
          onSkinChange={(skin) => onChange({ skin })}
          mode={value.mode}
          onModeChange={(mode) => onChange({ mode: mode as ModePref })}
        />
      </FormSection>

      <FormSection
        title="Glass backdrop"
        description="The scene behind the Glass skin. The Enterprise skin never shows one."
      >
        <Grid role="radiogroup" aria-label="Glass backdrop" minItemWidth={176} gap={3}>
          {BACKDROPS.map((b) => (
            <ChoiceCard
              key={b}
              name="backdrop"
              value={b}
              checked={value.backdrop === b}
              onSelect={() => onChange({ backdrop: b })}
              label={backdropLabel(b)}
              preview={<BackdropSwatch backdrop={b} />}
            />
          ))}
        </Grid>
      </FormSection>

      <FormSection
        title="Sounds"
        description="Kept on this device and applied at once, not with Save."
      >
        <Switch
          label="Sounds"
          description="Quiet sounds for switches, panels, messages and alerts."
          checked={sounds}
          onCheckedChange={setSoundEnabled}
        />
      </FormSection>
    </Stack>
  );
}
