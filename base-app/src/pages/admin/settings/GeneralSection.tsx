import { FormField, Input, Stack, Switch, Textarea } from '~/core/ui';
import { MESSAGE_MAX, WORKSPACE_MAX } from './settings';

/* General: the workspace name and maintenance mode, with the message people see while it is on.
   These live on the server (everyone sees them). Drafts until Save; the page validates when Save
   is pressed, and hands down its message (or the server's, for a refused value). */
export interface GeneralSectionProps {
  workspace: string;
  maintenance: boolean;
  maintenanceMessage: string;
  workspaceError: string | null;
  messageError: string | null;
  onWorkspace: (value: string) => void;
  onMaintenance: (on: boolean) => void;
  onMessage: (value: string) => void;
  onEnter: () => void;
}

export function GeneralSection({
  workspace,
  maintenance,
  maintenanceMessage,
  workspaceError,
  messageError,
  onWorkspace,
  onMaintenance,
  onMessage,
  onEnter,
}: GeneralSectionProps) {
  return (
    <Stack gap={5}>
      <FormField
        label="Workspace name"
        description={`Shown in the sidebar and in emails. Up to ${WORKSPACE_MAX} characters.`}
        error={workspaceError}
      >
        <Input
          name="workspace"
          value={workspace}
          maxLength={WORKSPACE_MAX + 20}
          onChange={(e) => onWorkspace(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onEnter();
            }
          }}
        />
      </FormField>
      <Switch
        checked={maintenance}
        onCheckedChange={onMaintenance}
        label="Maintenance mode"
        description="Stops regular users reaching the app. Admins can still sign in."
      />
      <FormField
        label="Maintenance message"
        description={`What people see while maintenance mode is on. Up to ${MESSAGE_MAX} characters; leave it empty for the standard wording.`}
        error={messageError}
      >
        <Textarea
          name="maintenance-message"
          rows={3}
          value={maintenanceMessage}
          onChange={(e) => onMessage(e.target.value)}
        />
      </FormField>
    </Stack>
  );
}
