import {
  AgentVisualView,
  ApprovalCard,
  ChatMessage,
  Notice,
  Stack,
  Text,
  Thinking,
  ToolChip,
} from '~/core/ui';
import { type AgentChat, isVisualTool, textOf } from './useAgentChat';

/* AgentThread — the messages of one chat (useAgentChat), drawn with the kit's AI primitives: the
   person's messages, and each reply as text, a ToolChip per action with its visual under it
   (pinnable to Views), and an ApprovalCard when an action waits. "Thinking" shows until the
   first event of a reply. Goes inside an AssistantLayout. */
export function AgentThread({ chat }: { chat: AgentChat }) {
  const { messages, busy, pins } = chat;
  const last = messages.at(-1);
  const waiting = busy && last?.from === 'assistant' && last.parts.length === 0;
  return messages.map((m, i) => {
    const streaming = busy && i === messages.length - 1 && m.from === 'assistant';
    if (m.from === 'user') {
      return (
        <ChatMessage key={m.id} from="user" name="You" timestamp={m.at}>
          {textOf(m)}
        </ChatMessage>
      );
    }
    return (
      <Stack key={m.id} gap={1}>
        <ChatMessage
          from="assistant"
          name="Assistant"
          timestamp={m.at}
          streaming={streaming}
          copyText={textOf(m)}
        >
          {waiting && streaming ? (
            <Thinking active>Thinking</Thinking>
          ) : (
            <Stack gap={2}>
              {m.parts.map((p, j) =>
                p.type === 'text' ? (
                  // biome-ignore lint/suspicious/noArrayIndexKey: text parts have no id and never reorder
                  <Text key={`t${j}`} preserveLines>
                    {p.text}
                  </Text>
                ) : p.type === 'approval' ? (
                  <ApprovalCard
                    key={p.callId}
                    title={p.title}
                    details={p.details}
                    destructive={p.destructive}
                    decision={p.decision}
                    onApprove={() => void chat.decide(m.id, p.callId, true)}
                    onDeny={() => void chat.decide(m.id, p.callId, false)}
                  />
                ) : p.status === 'denied' ? null : (
                  <Stack key={p.callId} gap={2}>
                    <ToolChip name={p.title} status={p.status} summary={p.summary} />
                    {p.visual && (
                      <AgentVisualView
                        visual={p.visual}
                        {...(p.input && isVisualTool(p.name)
                          ? {
                              onPin: () => void chat.pin(p),
                              pinned: pins[p.callId] === 'pinned',
                              pinning: pins[p.callId] === 'pinning',
                            }
                          : {})}
                      />
                    )}
                  </Stack>
                ),
              )}
            </Stack>
          )}
        </ChatMessage>
        {m.stopped && <ChatMessage from="system">Stopped</ChatMessage>}
      </Stack>
    );
  });
}

/* The line above the composer when a run failed: how to set a model key, or what went wrong. */
export function AgentNotice({ chat, extra }: { chat: AgentChat; extra?: string }) {
  const { failure } = chat;
  if (failure?.kind === 'not-configured') {
    return (
      <Notice tone="warning" title="The assistant is not set up yet">
        <Text size="small">
          The server has no model key. Set ANTHROPIC_API_KEY (or GEMINI_API_KEY and
          LLM_PROVIDER=gemini) in base-app/.env, then restart the server.{extra ? ` ${extra}` : ''}
        </Text>
      </Notice>
    );
  }
  if (failure) {
    return (
      <Notice tone="danger" title="The assistant could not answer">
        <Text size="small">{failure.message}</Text>
      </Notice>
    );
  }
  return null;
}
