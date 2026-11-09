import { type ReactNode, useState } from 'react';
import { Button } from './button';
import { Dialog } from './dialog';

/* ConfirmDialog — "Are you sure?" for an action that is hard to undo, on the
   kit's Dialog (native <dialog>: focus trap, Esc, inert page, focus returns to
   the opener). The first focusable control is Cancel, so Enter on open never
   confirms a destructive action by accident.

   `onConfirm` may be async. While it runs the dialog is pending: Esc, the
   scrim and the Close button do nothing, Cancel is disabled, and the confirm
   button stays focusable (so focus is not dropped) but is aria-disabled,
   aria-busy and reads `pendingLabel`. When it resolves the dialog closes; when
   it rejects the dialog stays open and says why, in an alert, so the person
   can retry or cancel. `destructive` makes the confirm button red. */
export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  /** Extra detail between the description and the buttons. */
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Shown on the confirm button while onConfirm runs. Default "Working…". */
  pendingLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  pendingLabel = 'Working…',
  destructive,
  onConfirm,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // a mounted dialog is reopened: it starts clean, whatever closed it last time (Cancel included)
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setFailure(null);
  }

  const close = () => {
    setFailure(null);
    onClose();
  };

  const confirm = async () => {
    if (pending) return;
    setPending(true);
    setFailure(null);
    try {
      await onConfirm();
      setPending(false);
      onClose();
    } catch (error) {
      setPending(false);
      setFailure(error instanceof Error && error.message ? error.message : 'Something went wrong.');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={title}
      description={description}
      dismissible={!pending}
      footer={
        <>
          <Button variant="outline" disabled={pending} onClick={close}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            loading={pending}
            data-pending={pending || undefined}
            onClick={confirm}
          >
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {failure && (
        <p role="alert" className="ui-confirm-error m-0 mt-3 text-[13px] text-danger">
          {failure}
        </p>
      )}
    </Dialog>
  );
}
