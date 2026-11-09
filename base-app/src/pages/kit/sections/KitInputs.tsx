import { useState } from 'react';
import {
  addCalendarDays,
  Button,
  Calendar,
  Combobox,
  CopyButton,
  DatePicker,
  DateRangePicker,
  type DayRange,
  EMPTY_RANGE,
  FileDropzone,
  FormField,
  HoldToConfirm,
  InlineEdit,
  MultiSelect,
  NumberField,
  OtpField,
  PullToRefresh,
  RadioCards,
  RadioGroup,
  Stack,
  TagInput,
  Text,
  toast,
} from '~/core/ui';
import { KitBlock, KitSection } from '../KitParts';

/* The picker and chip inputs: dates, typeahead, tags, numbers, radio choices, files, inline edit,
   copy and hold-to-confirm. A fixed "today" keeps the specimens the same on every visit. */
const TODAY = '2026-10-12';

const TEAMS = [
  { value: 'eng', label: 'Engineering', description: 'Platform and apps' },
  { value: 'ops', label: 'Operations', description: 'Support and run' },
  { value: 'fin', label: 'Finance', description: 'Closed to new members', disabled: true },
  { value: 'des', label: 'Design' },
  { value: 'dat', label: 'Data' },
];

const ROLES = [
  { value: 'viewer', label: 'Viewer', description: 'Read-only access to the data.' },
  { value: 'editor', label: 'Editor', description: 'Works with the data. Cannot manage users.' },
  { value: 'admin', label: 'Admin', description: 'Manages users and settings.' },
];

const CHANNELS = [
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'Text message' },
  { value: 'none', label: 'None', description: 'You will only see alerts in the app.' },
];

export function PickersSection() {
  const [day, setDay] = useState<string | null>('2026-10-14');
  const [period, setPeriod] = useState<DayRange>({ from: '2026-10-06', to: '2026-10-12' });
  const [open, setOpen] = useState<DayRange>(EMPTY_RANGE);
  const [calendar, setCalendar] = useState<string | null>('2026-10-20');
  const [team, setTeam] = useState<string | null>(null);
  const [teams, setTeams] = useState<string[]>(['eng', 'des']);
  const [tags, setTags] = useState<string[]>(['design system', 'accessibility']);
  const [years, setYears] = useState<number | null>(10);
  const [rate, setRate] = useState<number | null>(0.045);
  const [amount, setAmount] = useState<number | null>(1250);
  const [role, setRole] = useState<string | null>('editor');
  const [channel, setChannel] = useState<string | null>('email');
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState('Q4 savings plan');
  const [deleted, setDeleted] = useState(false);
  const [code, setCode] = useState('');
  const [refreshed, setRefreshed] = useState('09:00');

  return (
    <KitSection
      id="pickers"
      title="Pickers and chips"
      intro="Dates, typeahead, tags, numbers and choices that outgrow a native control. Each one works by keyboard and says what changed."
    >
      <KitBlock
        title="Date and date range"
        note="The calendar is a grid: arrow keys move by day and week, Page Up and Page Down by month (Shift for a year), Home and End to the week's ends."
      >
        <Stack gap={4}>
          <FormField label="Due date">
            <DatePicker
              value={day}
              onValueChange={setDay}
              today={TODAY}
              clearable
              presets={[
                { label: 'Today', day: (t) => t },
                { label: 'In a week', day: (t) => addCalendarDays(t, 7) },
              ]}
            />
          </FormField>
          <FormField label="Reporting period" description="Quick ranges end today.">
            <DateRangePicker value={period} onValueChange={setPeriod} today={TODAY} clearable />
          </FormField>
          <FormField label="Any date">
            <DateRangePicker
              value={open}
              onValueChange={setOpen}
              today={TODAY}
              presets={false}
              placeholder="All time"
              clearable
            />
          </FormField>
        </Stack>
      </KitBlock>

      <KitBlock
        title="Calendar"
        note="Min and max grey out days and stop the keys. Today has a ring."
      >
        <Calendar
          today={TODAY}
          value={calendar}
          onValueChange={setCalendar}
          min="2026-10-05"
          max="2026-11-20"
          label="Pick a day"
        />
      </KitBlock>

      <KitBlock
        title="Combobox, multi-select and tags"
        note="Type to filter, arrows to move, Enter to choose. Backspace in an empty box removes the last chip."
      >
        <Stack gap={4}>
          <FormField label="Team">
            <Combobox options={TEAMS} value={team} onValueChange={setTeam} clearable />
          </FormField>
          <FormField label="Teams to notify">
            <MultiSelect
              options={TEAMS}
              value={teams}
              onValueChange={setTeams}
              placeholder="Choose teams"
            />
          </FormField>
          <FormField
            label="Tags"
            description="Press Enter or a comma to add one. Paste a list too."
          >
            <TagInput
              value={tags}
              onValueChange={setTags}
              max={6}
              placeholder="Add a tag"
              validate={(t) => (t.length > 24 ? 'Keep a tag to 24 characters or fewer.' : null)}
            />
          </FormField>
        </Stack>
      </KitBlock>

      <KitBlock
        title="Number field"
        note="Up and Down step, Page Up and Page Down take ten, Home and End jump to the limits. Typing is read in the locale's format."
      >
        <Stack gap={4}>
          <FormField label="Years">
            <NumberField value={years} onValueChange={setYears} min={1} max={50} suffix="years" />
          </FormField>
          <FormField label="Interest rate">
            <NumberField
              value={rate}
              onValueChange={setRate}
              min={0}
              max={0.25}
              step={0.0025}
              formatOptions={{
                style: 'percent',
                minimumFractionDigits: 1,
                maximumFractionDigits: 2,
              }}
            />
          </FormField>
          <FormField label="Amount">
            <NumberField
              value={amount}
              onValueChange={setAmount}
              min={0}
              step={50}
              prefix="£"
              formatOptions={{ maximumFractionDigits: 2 }}
            />
          </FormField>
        </Stack>
      </KitBlock>

      <KitBlock
        title="Radio group and radio cards"
        note="Native radios in one group: the arrow keys move and choose, Tab leaves."
      >
        <Stack gap={4}>
          <RadioGroup
            legend="Notify me by"
            options={CHANNELS}
            value={channel}
            onValueChange={setChannel}
          />
          <RadioCards
            legend="Role"
            options={ROLES}
            value={role}
            onValueChange={setRole}
            columns={1}
          />
        </Stack>
      </KitBlock>

      <KitBlock
        title="File dropzone"
        note="Drop files or press Enter on it to browse. Refused files are named with the reason."
      >
        <FormField label="Attachments">
          <FileDropzone
            files={files}
            onFilesChange={setFiles}
            accept=".pdf,.csv,image/*"
            maxSize={2_000_000}
            maxFiles={4}
            hint="PDF, CSV or an image, up to 2 MB each. Four files at most."
          />
        </FormField>
      </KitBlock>

      <KitBlock
        title="Inline edit, copy and hold to confirm"
        note="Hold the red button for a second. From the keyboard, hold Space or press it twice."
      >
        <Stack gap={4} align="start">
          <InlineEdit
            label="Plan name"
            value={title}
            onValueChange={setTitle}
            validate={(v) => (v === '' ? 'Enter a name.' : null)}
          />
          <CopyButton text="sk-example-0123456789" label="Copy API key" />
          <HoldToConfirm
            label="Hold to delete plan"
            confirmedLabel="Deleted"
            confirmed={deleted}
            onConfirm={() => {
              setDeleted(true);
              toast.success('Plan deleted (demo)');
            }}
          />
          {deleted && (
            <Button variant="outline" size="sm" onClick={() => setDeleted(false)}>
              Undo
            </Button>
          )}
          <Text size="small" tone="muted">
            Nothing here is saved.
          </Text>
        </Stack>
      </KitBlock>

      <KitBlock
        title="OtpField"
        note="One real text box drawn as six: the phone offers the code from the message, a paste fills it, and a screen reader meets one field."
      >
        <FormField label="Sign-in code" description="The six digits we sent you.">
          <OtpField value={code} onValueChange={setCode} />
        </FormField>
      </KitBlock>

      <KitBlock
        title="PullToRefresh"
        note="On a touch screen, drag the list down from the top. The button does the same for a mouse, a keyboard or anyone who cannot drag."
      >
        <PullToRefresh
          label="Refresh stock"
          onRefresh={() =>
            new Promise<void>((done) =>
              window.setTimeout(() => {
                setRefreshed((t) => (t === '09:00' ? '09:05' : '09:00'));
                done();
              }, 800),
            )
          }
        >
          <Text tone="muted">Stock list, last updated at {refreshed}.</Text>
        </PullToRefresh>
      </KitBlock>
    </KitSection>
  );
}
