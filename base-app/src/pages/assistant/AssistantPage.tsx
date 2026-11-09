import { useState } from 'react';
import { AgentNotice, AgentThread, useAgentChat } from '~/core/agent';
import {
  AssistantLayout,
  Button,
  Composer,
  ConfirmDialog,
  type ConversationItem,
  ConversationList,
  Page,
  Stack,
  useAppTheme,
} from '~/core/ui';
import { SampleConversation } from './SampleConversation';

/* The assistant: a saved conversation with the model, which acts through the app's actions
   (POST /api/agent/stream; server/services/agent.ts). It looks things up in the database,
   draws what it finds (charts, key figures, tables, flow diagrams, links to a filtered page),
   and asks before it changes anything.

   Chats are saved on the server; the list beside the thread opens one (GET
   /api/agent/conversations/:id) and "New chat" starts another. A reply arrives as events and
   is built into one assistant message: text as it is written, a ToolChip per action (with its
   visual under it), and an ApprovalCard when an action waits for the person. Approve or Deny
   sends the decision and the same message carries on.

   A visual can be pinned to the Views page (the save_view action, with the show_* input that
   drew it), where it is redrawn from the database each time.

   Stop aborts the run and keeps what arrived. A failed send is taken back out of the thread
   and its text goes back into the composer; a Notice says why. With no model key the Notice
   says how to set one, and the example conversation shows the look.

   Announcing: the thread is a polite `log` held `aria-busy` while a reply streams; one status
   line says "Reply complete.", "Reply stopped." or "Waiting for your approval." at the end. */
const SUGGESTIONS = [
  'Chart revenue by category this year',
  'Show me this month’s key figures',
  'Which customers had failed payments recently?',
  'Draw how a payment moves from pending to paid or refunded',
] as const;

export default function AssistantPage() {
  const { skin } = useAppTheme();
  const chat = useAgentChat({ path: '/assistant', title: 'Assistant' });
  const [sample, setSample] = useState(false);
  const [deleting, setDeleting] = useState<ConversationItem | null>(null);
  const { busy, messages } = chat;

  return (
    <Page
      title="Assistant"
      description="Ask about your data. The assistant looks it up, draws charts and diagrams, and asks before it changes anything. Chats are saved."
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSample((s) => !s)}
          aria-pressed={sample}
        >
          Show example conversation
        </Button>
      }
    >
      <Stack gap={3}>
        <AssistantLayout
          aside={
            <ConversationList
              items={chat.chats}
              activeId={chat.activeId}
              onSelect={(id) => void chat.open(id)}
              onNew={chat.startNew}
              onDelete={setDeleting}
            />
          }
          empty={!sample && messages.length === 0}
          emptyTitle="Ask about your data"
          emptyDescription="The assistant reads the database, draws what it finds and can pin it to your Views."
          suggestions={SUGGESTIONS}
          onSuggestion={(s) => void chat.send(s)}
          busy={busy}
          threadLabel="Conversation with the assistant"
          notice={
            sample ? null : (
              <AgentNotice
                chat={chat}
                extra="Until then, the example conversation shows what the assistant looks like."
              />
            )
          }
          composer={
            <Composer
              value={sample ? '' : chat.draft}
              onValueChange={chat.setDraft}
              onSend={(text) => void chat.send(text)}
              onStop={chat.stop}
              streaming={busy}
              disabled={sample}
              maxLength={4000}
              placeholder={sample ? 'This is an example conversation' : 'Ask about your data'}
              seaGlass={skin === 'glass'}
            />
          }
        >
          {sample ? <SampleConversation /> : <AgentThread chat={chat} />}
        </AssistantLayout>
        <span role="status" className="sr-only">
          {chat.announce}
        </span>
      </Stack>
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this chat?"
        description={
          deleting ? `“${deleting.title}” and its messages are deleted for good.` : undefined
        }
        confirmLabel="Delete chat"
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          await chat.remove(deleting.id);
        }}
      />
    </Page>
  );
}
