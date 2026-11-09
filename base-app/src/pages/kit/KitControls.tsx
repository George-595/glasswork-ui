import { useState } from 'react';
import { Link } from '~/core/router';
import {
  Avatar,
  AvatarGroup,
  Badge,
  type BadgeVariant,
  Breadcrumbs,
  Button,
  type ButtonSize,
  type ButtonVariant,
  buttonAttrs,
  Checkbox,
  Cluster,
  DescriptionList,
  Eyebrow,
  FormField,
  Icon,
  Input,
  Kbd,
  NativeSelect,
  SegmentedControl,
  Separator,
  Slider,
  Stack,
  Switch,
  Tabs,
  Text,
  Textarea,
} from '~/core/ui';
import { DEMO_PEOPLE } from './demo-data';
import { KitBlock, KitSection, useKitLoading } from './KitParts';

/* Sections 1 to 3: buttons, form controls, and small display parts. Every control is shown in
   the states a reader will meet: default, selected, invalid, disabled. */

const VARIANTS: readonly ButtonVariant[] = [
  'primary',
  'secondary',
  'neutral',
  'outline',
  'ghost',
  'link',
  'danger',
  'success',
];
const SIZES: readonly ButtonSize[] = ['sm', 'md', 'lg'];
const BADGES: readonly BadgeVariant[] = [
  'neutral',
  'brand',
  'success',
  'warning',
  'danger',
  'info',
  'up',
  'down',
];

export function ButtonsSection() {
  const loading = useKitLoading();
  return (
    <KitSection
      id="buttons"
      title="Buttons"
      intro="Eight levels in three sizes, each built from its own colour roles."
    >
      <KitBlock
        title="Levels, sizes and states"
        note="Each row is one level: three sizes, then pressed, disabled, aria-disabled and icon-only (and loading, with the preview switch on). Hover and focus are live: try them."
        wide
      >
        <Stack gap={4}>
          {VARIANTS.map((v) => (
            <Stack key={v} gap={2} data-level={v}>
              <Eyebrow>{v}</Eyebrow>
              <Cluster gap={3}>
                {SIZES.map((s) => (
                  <Button key={s} variant={v} size={s}>
                    {s === 'sm' ? 'Small' : s === 'md' ? 'Medium' : 'Large'}
                  </Button>
                ))}
                <Button variant={v} aria-pressed="true">
                  Pressed
                </Button>
                <Button variant={v} disabled>
                  Disabled
                </Button>
                <Button variant={v} aria-disabled="true">
                  Aria-disabled
                </Button>
                {loading && (
                  <Button variant={v} loading>
                    Loading
                  </Button>
                )}
                <Button variant={v} size="icon" aria-label={`${v} add`}>
                  <Icon name="plus" size={16} />
                </Button>
              </Cluster>
            </Stack>
          ))}
        </Stack>
      </KitBlock>

      <KitBlock
        title="States"
        note="Disabled buttons are skipped by Tab; aria-disabled ones keep focus."
      >
        <Cluster gap={3}>
          <Button>Default</Button>
          <Button disabled>Disabled</Button>
          <Button aria-disabled="true">Pending…</Button>
          <Button variant="outline" disabled>
            Disabled
          </Button>
        </Cluster>
      </KitBlock>

      <KitBlock title="With icons" note="Icon-only buttons always carry an aria-label.">
        <Cluster gap={3}>
          <Button>
            <Icon name="plus" size={14} />
            New item
          </Button>
          <Button variant="outline">
            Next
            <Icon name="chevron-right" size={14} />
          </Button>
          <Button variant="neutral" size="icon" aria-label="Settings">
            <Icon name="settings" size={16} />
          </Button>
          <Button variant="ghost" size="icon" aria-label="More actions">
            <Icon name="more" size={16} />
          </Button>
        </Cluster>
      </KitBlock>

      <KitBlock
        title="Links that look like buttons"
        note="buttonAttrs() on an anchor: same classes, real navigation."
      >
        <Cluster gap={3}>
          <Link to="/" {...buttonAttrs('primary', 'md')}>
            Go home
          </Link>
          <Link to="/graphs" {...buttonAttrs('outline', 'md')}>
            See graphs
          </Link>
        </Cluster>
      </KitBlock>
    </KitSection>
  );
}

export function InputsSection() {
  const [notify, setNotify] = useState(true);
  const [terms, setTerms] = useState(false);
  const [volume, setVolume] = useState(40);
  const [range, setRange] = useState('week');
  const [density, setDensity] = useState('comfortable');

  return (
    <KitSection
      id="inputs"
      title="Inputs and choices"
      intro="Native elements first, styled on the tokens. Every field has a visible label."
    >
      <KitBlock title="Text fields">
        <Stack gap={4}>
          <FormField label="Full name">
            <Input placeholder="Ada Lovelace" />
          </FormField>
          <FormField label="Email" error="Enter an email address like name@example.com.">
            <Input type="email" defaultValue="not-an-email" />
          </FormField>
          <FormField label="Workspace">
            <Input defaultValue="Read-only" disabled />
          </FormField>
          <FormField label="Notes">
            <Textarea rows={3} placeholder="Anything we should know?" />
          </FormField>
        </Stack>
      </KitBlock>

      <KitBlock title="Select, checkbox and switch">
        <Stack gap={4}>
          <FormField label="Region">
            <NativeSelect defaultValue="uk">
              <option value="uk">United Kingdom</option>
              <option value="eu">European Union</option>
              <option value="us">United States</option>
            </NativeSelect>
          </FormField>
          <Checkbox label="Remember me" defaultChecked />
          <Checkbox label="Select all (mixed)" indeterminate />
          <Checkbox
            label="I accept the terms"
            checked={terms}
            onChange={(e) => setTerms(e.target.checked)}
          />
          <Checkbox label="Unavailable option" disabled />
          <Switch
            label="Email notifications"
            description="Weekly summary, Mondays."
            checked={notify}
            onCheckedChange={setNotify}
          />
          <Switch label="Beta features" checked={false} onCheckedChange={() => {}} disabled />
        </Stack>
      </KitBlock>

      <KitBlock
        title="Slider and segmented control"
        note="Arrow keys step the slider; Home and End jump to the ends."
      >
        <Stack gap={4}>
          <Slider
            label="Volume"
            value={volume}
            onValueChange={setVolume}
            formatValue={(v) => `${v}%`}
            ticks={[0, 25, 50, 75, 100]}
          />
          <Slider label="Locked" defaultValue={70} disabled />
          <SegmentedControl
            label="Date range"
            value={range}
            onValueChange={setRange}
            options={[
              { value: 'day', label: 'Day' },
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
              { value: 'year', label: 'Year', disabled: true },
            ]}
          />
          <SegmentedControl
            label="Row density"
            size="sm"
            value={density}
            onValueChange={setDensity}
            options={[
              { value: 'compact', label: 'Compact' },
              { value: 'comfortable', label: 'Comfortable' },
            ]}
          />
        </Stack>
      </KitBlock>

      <KitBlock title="Tabs" note="Left and Right move and select; the panel below follows.">
        <Tabs
          label="Account sections"
          tabs={[
            {
              id: 'profile',
              label: 'Profile',
              content: (
                <Text size="small" tone="muted">
                  Your name, photo and contact details.
                </Text>
              ),
            },
            {
              id: 'security',
              label: 'Security',
              content: (
                <Text size="small" tone="muted">
                  Password, sessions and sign-in history.
                </Text>
              ),
            },
            {
              id: 'billing',
              label: 'Billing',
              content: (
                <Text size="small" tone="muted">
                  Plan, invoices and payment methods.
                </Text>
              ),
            },
          ]}
        />
      </KitBlock>
    </KitSection>
  );
}

export function DisplaySection() {
  return (
    <KitSection
      id="display"
      title="Badges, avatars and small parts"
      intro="The little pieces that fill tables, headers and lists."
    >
      <KitBlock title="Badges" note="Meaning is in the words, never the colour alone.">
        <Cluster gap={3}>
          {BADGES.map((v) => (
            <Badge key={v} variant={v}>
              {v}
            </Badge>
          ))}
        </Cluster>
      </KitBlock>

      <KitBlock title="Avatars">
        <Stack gap={4}>
          <Cluster gap={3}>
            {(['xs', 'sm', 'md', 'lg'] as const).map((s) => (
              <Avatar key={s} name="Ada Admin" size={s} />
            ))}
          </Cluster>
          <AvatarGroup people={DEMO_PEOPLE} max={4} label="Project team" />
        </Stack>
      </KitBlock>

      <KitBlock title="Keyboard keys and breadcrumbs">
        <Stack gap={4}>
          <Text size="small" tone="muted">
            Press <Kbd>Ctrl</Kbd> + <Kbd>K</Kbd> to search, or <Kbd>Esc</Kbd> to close.
          </Text>
          <Breadcrumbs
            items={[
              { label: 'Home', href: '/' },
              { label: 'Kit', href: '/kit' },
              { label: 'Breadcrumbs' },
            ]}
          />
        </Stack>
      </KitBlock>

      <KitBlock title="Description list and separator">
        <DescriptionList
          items={[
            { term: 'Plan', detail: 'Business' },
            { term: 'Seats', detail: '24 of 30 used' },
            { term: 'Renews', detail: '1 November 2026' },
          ]}
        />
        <Separator />
        <Text size="small" tone="muted">
          A separator is a hairline with the right role for its direction.
        </Text>
      </KitBlock>
    </KitSection>
  );
}
