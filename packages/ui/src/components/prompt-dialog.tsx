import { useId, useState } from 'react';
import { Button } from './button';
import { Dialog, dialogFooterClasses } from './dialog';
import { Input, Label } from './input';

/* PromptDialog — the accessible replacement for window.prompt(), generalised
   from site/apps/web/src/trading/NameDialog.tsx: a titled modal with one
   labelled text field, submit and cancel. Empty or blank input cannot submit. */
export interface PromptDialogProps {
  open: boolean;
  title: string;
  description?: string;
  label: string;
  defaultValue?: string;
  submitText?: string;
  cancelText?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}

export function PromptDialog({ open, title, description, onClose, ...form }: PromptDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={title} description={description}>
      {/* remounted on every open, so the field starts from defaultValue again */}
      <PromptForm key={open ? 'open' : 'closed'} onClose={onClose} {...form} />
    </Dialog>
  );
}

type PromptFormProps = Omit<PromptDialogProps, 'open' | 'title' | 'description'>;

/* showModal() focuses the first focusable element, which is the field. */
function PromptForm({
  label,
  defaultValue = '',
  submitText = 'Save',
  cancelText = 'Cancel',
  onSubmit,
  onClose,
}: PromptFormProps) {
  const inputId = useId();
  const [value, setValue] = useState(defaultValue);
  const trimmed = value.trim();

  return (
    <form
      className="ui-form m-0 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!trimmed) return;
        onSubmit(trimmed);
        onClose();
      }}
    >
      <Label htmlFor={inputId}>{label}</Label>
      <Input id={inputId} value={value} onChange={(e) => setValue(e.target.value)} />
      <div className={dialogFooterClasses}>
        <Button variant="outline" size="sm" onClick={onClose}>
          {cancelText}
        </Button>
        <Button type="submit" size="sm" disabled={!trimmed}>
          {submitText}
        </Button>
      </div>
    </form>
  );
}
