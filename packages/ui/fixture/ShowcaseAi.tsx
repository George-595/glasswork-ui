/* The AI-interface primitives in their states, for the Showcase (and so the browser a11y
   gate): a conversation with every message role, Thinking active and done, ToolChips in all
   three states, an ApprovalCard pending, destructive and resolved, the Composer idle,
   streaming and disabled, and the empty AssistantLayout. */
import {
  ApprovalCard,
  AssistantLayout,
  ChatMessage,
  ChatThread,
  Composer,
  Section,
  Thinking,
  ToolChip,
} from '../src/index';

const noop = () => {};

export function AiSection() {
  return (
    <Section title="AI interface" description="A conversation, its reasoning, tools and approvals.">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: 560 }}>
        <AssistantLayout
          className="h-full"
          composer={<Composer onSend={noop} maxLength={500} />}
          threadLabel="Example conversation"
        >
          <ChatMessage from="system">Conversation started</ChatMessage>
          <ChatMessage from="user" timestamp="2026-10-12T09:05:00Z">
            {'What is due this week?\nKeep it short.'}
          </ChatMessage>
          <ChatMessage from="assistant" name="Assistant" timestamp="2026-10-12T09:05:08Z">
            <Thinking duration={3} defaultOpen>
              {'Checking the calendar first,\nthen the task list.'}
            </Thinking>
            <ToolChip
              name="calendar.list"
              status="done"
              summary="2 events"
              detail={'{ "days": 7 }'}
            />
            <ToolChip name="tasks.search" status="failed" />
            <ToolChip name="mail.draft" status="running" />
            <ApprovalCard
              title="Send the weekly summary"
              description="To the whole team."
              details={[
                { term: 'Recipients', detail: '4' },
                { term: 'Subject', detail: 'Week 42' },
              ]}
            />
            <ApprovalCard title="Archive 3 old threads" destructive decision="denied" />
            <ApprovalCard
              title="Create a calendar hold"
              decision="approved"
              resolvedNote="by Ada"
            />
          </ChatMessage>
          <ChatMessage from="assistant" streaming>
            <Thinking active>Writing the reply</Thinking>
          </ChatMessage>
        </AssistantLayout>
      </div>
      <ChatThread label="Short thread" style={{ maxHeight: 120 }}>
        <ChatMessage from="user">Hello</ChatMessage>
      </ChatThread>
      <Composer onSend={noop} streaming label="Message while streaming" />
      <Composer onSend={noop} disabled label="Message when disabled" />
      <div style={{ height: 320 }}>
        <AssistantLayout
          empty
          className="h-full"
          suggestions={['Summarise my week', 'Draft a reply']}
          composer={<Composer onSend={noop} label="Message to the empty assistant" />}
        />
      </div>
    </Section>
  );
}
