/* The input components on the showcase page (wired into Showcase.tsx with one line), so the
   browser a11y gate covers them in every skin and mode. Server-rendered, so every value is
   fixed and every handler a no-op. */
import {
  Calendar,
  Combobox,
  CopyButton,
  DatePicker,
  DateRangePicker,
  FileDropzone,
  FormField,
  HoldToConfirm,
  InlineEdit,
  MultiSelect,
  NumberField,
  OtpField,
  PanelHeader,
  PullToRefresh,
  RadioCards,
  RadioGroup,
  TagInput,
} from '../src/index';

const noop = () => {};
const TODAY = '2026-10-12';
const TEAMS = [
  { value: 'eng', label: 'Engineering', description: 'Platform and apps' },
  { value: 'ops', label: 'Operations' },
  { value: 'des', label: 'Design' },
];
const ROLES = [
  { value: 'viewer', label: 'Viewer', description: 'Read only' },
  { value: 'editor', label: 'Editor', description: 'Can change things' },
  { value: 'admin', label: 'Admin', description: 'Full access' },
];

export function InputsShowcase() {
  return (
    <section aria-label="Inputs" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PanelHeader title="Inputs" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
        <FormField label="Due date">
          <DatePicker value="2026-10-14" onValueChange={noop} today={TODAY} clearable />
        </FormField>
        <FormField label="Period">
          <DateRangePicker
            value={{ from: '2026-10-06', to: '2026-10-12' }}
            onValueChange={noop}
            today={TODAY}
          />
        </FormField>
        <FormField label="Team">
          <Combobox options={TEAMS} value="ops" onValueChange={noop} clearable />
        </FormField>
        <FormField label="Teams">
          <MultiSelect options={TEAMS} value={['eng', 'des']} onValueChange={noop} />
        </FormField>
        <FormField label="Tags">
          <TagInput value={['alpha', 'beta']} onValueChange={noop} />
        </FormField>
        <FormField label="Years">
          <NumberField value={12} onValueChange={noop} min={0} max={50} suffix="yrs" />
        </FormField>
        <RadioGroup legend="Default role" options={ROLES} value="viewer" onValueChange={noop} />
        <InlineEdit label="Plan name" value="Q4 plan" onValueChange={noop} />
        <FormField label="Sign-in code" description="Six digits, sent to your phone.">
          <OtpField value="1234" onValueChange={noop} />
        </FormField>
        <PullToRefresh onRefresh={noop} label="Refresh stock">
          <p style={{ margin: 0 }}>Pull this list down to refresh it.</p>
        </PullToRefresh>
      </div>
      <RadioCards legend="Role" options={ROLES} value="editor" onValueChange={noop} />
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <Calendar today={TODAY} value="2026-10-14" label="Calendar" />
        <Calendar
          mode="range"
          today={TODAY}
          range={{ from: '2026-10-06', to: '2026-10-12' }}
          label="Range calendar"
        />
      </div>
      <FormField label="Attachments">
        <FileDropzone
          files={[new File(['x'], 'report.pdf')]}
          onFilesChange={noop}
          hint="PDF up to 2 MB"
        />
      </FormField>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <CopyButton text="token" label="Copy token" />
        <CopyButton text="link" label="Copy link" iconOnly />
        <HoldToConfirm label="Hold to delete" onConfirm={noop} />
      </div>
    </section>
  );
}
