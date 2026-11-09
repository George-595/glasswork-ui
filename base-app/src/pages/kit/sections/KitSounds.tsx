import {
  Button,
  Cluster,
  SOUND_NAMES,
  type SoundName,
  Switch,
  setSoundEnabled,
  useSoundEnabled,
} from '~/core/ui';
import { KitBlock, KitSection } from '../KitParts';

/* Section: interface sounds. The kit plays them itself after a person's action; here each one
   has a button that plays it on purpose, and the same Sounds setting the Settings page has. A
   button press is the person's action, so the sound plays through the Button's `sound` prop. */
const WHEN: Record<SoundName, string> = {
  tick: 'a checkbox, a tab or a segment changes',
  'toggle-on': 'a switch turns on',
  'toggle-off': 'a switch turns off',
  open: 'a panel or dialog opens',
  close: 'a panel or dialog closes',
  send: 'a message is sent',
  notify: 'a note or plain message appears',
  success: 'something worked',
  error: 'something failed',
  reply: 'the assistant finishes a reply',
  approval: 'the assistant waits for your approval',
};

export function SoundsSection() {
  const on = useSoundEnabled();
  return (
    <KitSection
      id="sounds"
      title="Sounds"
      intro="Quiet interface sounds, played only after something a person does, never on hover or when a page loads."
    >
      <KitBlock title="Setting" note="Kept on this device. Off by choice, on by default.">
        <Switch
          label="Sounds"
          description="Quiet sounds for switches, panels, messages and alerts."
          checked={on}
          onCheckedChange={setSoundEnabled}
        />
      </KitBlock>
      <KitBlock
        title="Every sound"
        note="Press one to hear it. Nothing plays while Sounds is off."
        wide
      >
        <Cluster gap={2}>
          {SOUND_NAMES.map((name) => (
            <Button
              key={name}
              variant="neutral"
              size="sm"
              sound={name}
              title={`Plays when ${WHEN[name]}`}
            >
              Play: {name}
            </Button>
          ))}
        </Cluster>
      </KitBlock>
    </KitSection>
  );
}
