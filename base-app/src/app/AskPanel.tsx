import { useEffect, useRef } from 'react';
import {
  AgentNotice,
  AgentThread,
  clearAskSelection,
  setAskOpen,
  useAgentChat,
  useAsk,
} from '~/core/agent';
import { Link } from '~/core/router';
import {
  AssistantLayout,
  Badge,
  Button,
  buttonAttrs,
  Cluster,
  Composer,
  Icon,
  Sheet,
  Stack,
  Text,
  useAppTheme,
} from '~/core/ui';
import type { RouteDef } from './routes';

/* The Ask panel: the assistant in a sheet over any page, opened by the topbar's Ask button, the
   `a` shortcut, or a page's `askAbout(...)` (core/agent). Every message carries where it was
   asked from: the page's path and name, and the thing the page opened it about (a
   transaction), so "is this one normal?" needs no more words.

   The chat lives in the shell, not the sheet, so closing and reopening keeps the thread; it is
   saved like any other and is in the Assistant page's list. "New chat" starts again. A page
   change closes the panel (a link the assistant drew is followed, and the page shows). */
const SUGGESTIONS: Record<string, readonly string[]> = {
  home: ['Summarise this month', 'What changed since last month?'],
  table: ['Which payments failed this week?', 'Chart this month by category'],
  graphs: ['What stands out in these charts?', 'Compare revenue with last year'],
};
const DEFAULT_SUGGESTIONS = ['Show me this month’s key figures', 'What should I look at first?'];

export function AskPanel({ route }: { route: RouteDef }) {
  const { skin } = useAppTheme();
  const { open, selection } = useAsk();
  const chat = useAgentChat(
    {
      path: route.path,
      title: route.title,
      ...(selection ? { selection } : {}),
    },
    { loadList: false },
  );

  // a new page closes the panel. The panel is mounted when it is first opened (Shell.tsx), so its
  // first render is not a page change: only a path that differs from the one it opened on closes it
  const openedOn = useRef(route.path);
  useEffect(() => {
    if (openedOn.current === route.path) return;
    openedOn.current = route.path;
    setAskOpen(false);
  }, [route.path]);

  const suggestions = selection
    ? [`Tell me about this ${selection.kind}`, `Is this ${selection.kind} unusual?`]
    : (SUGGESTIONS[route.id] ?? DEFAULT_SUGGESTIONS);

  return (
    <Sheet
      open={open}
      onOpenChange={setAskOpen}
      title="Ask the assistant"
      description={`Asking from ${route.title}. The assistant reads your data and asks before it changes anything.`}
    >
      <Stack gap={3}>
        <Cluster gap={2} justify="between">
          {selection ? (
            <Cluster gap={1}>
              <Badge variant="info">
                About: {selection.label ?? `${selection.kind} ${selection.id}`}
              </Badge>
              <Button variant="ghost" size="sm" onClick={clearAskSelection}>
                Ask generally
              </Button>
            </Cluster>
          ) : (
            <Text size="small" tone="muted">
              About: the {route.title} page
            </Text>
          )}
          <Cluster gap={1}>
            {chat.messages.length > 0 && (
              <Button variant="ghost" size="sm" onClick={chat.startNew} disabled={chat.busy}>
                <Icon name="plus" size={16} />
                New chat
              </Button>
            )}
            <Link to="/assistant" {...buttonAttrs('ghost', 'sm')}>
              All chats
            </Link>
          </Cluster>
        </Cluster>
        <AssistantLayout
          empty={chat.messages.length === 0}
          emptyTitle="Ask about this page"
          emptyDescription="Answers come from your data, with charts and diagrams when they help."
          suggestions={suggestions}
          onSuggestion={(s) => void chat.send(s)}
          busy={chat.busy}
          threadLabel="Conversation with the assistant"
          notice={<AgentNotice chat={chat} />}
          composer={
            <Composer
              value={chat.draft}
              onValueChange={chat.setDraft}
              onSend={(text) => void chat.send(text)}
              onStop={chat.stop}
              streaming={chat.busy}
              maxLength={4000}
              placeholder="Ask about this page"
              seaGlass={skin === 'glass'}
            />
          }
        >
          <AgentThread chat={chat} />
        </AssistantLayout>
        <span role="status" className="sr-only">
          {chat.announce}
        </span>
      </Stack>
    </Sheet>
  );
}
