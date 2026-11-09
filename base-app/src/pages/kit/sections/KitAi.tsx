import { useState } from 'react';
import {
  ApprovalCard,
  type ApprovalDecision,
  AssistantLayout,
  ChatMessage,
  ChatThread,
  Composer,
  Stack,
  Text,
  Thinking,
  ToolChip,
} from '~/core/ui';
import { KitBlock, KitSection, useKitLoading } from '../KitParts';

/* The AI-interface section: a conversation, the reasoning trace, tool chips, approvals, the
   composer and the empty assistant screen. The streaming specimens (aria-busy) show only while
   the page's "Preview loading states" switch is on, like every other busy state here. */
export function AiSection() {
  const loading = useKitLoading();
  const [decision, setDecision] = useState<ApprovalDecision | undefined>();
  const [sent, setSent] = useState('');
  const [picked, setPicked] = useState('');

  return (
    <KitSection
      id="ai"
      title="AI interface"
      intro="Primitives for talking to an agent: a message log, its reasoning and tool calls, approvals, and the box you write in."
    >
      <KitBlock title="Conversation" note="A log: new messages are announced politely." wide>
        <ChatThread label="Example conversation" busy={loading}>
          <ChatMessage from="system">Conversation started</ChatMessage>
          <ChatMessage from="user" timestamp="2026-10-12T09:05:00Z">
            {'What is due this week?\nKeep it short.'}
          </ChatMessage>
          <ChatMessage from="assistant" timestamp="2026-10-12T09:05:08Z">
            {'Three things: the Monday standup,\nthe Wednesday review and the Friday demo.'}
          </ChatMessage>
          {loading && (
            <ChatMessage from="assistant" streaming>
              <Thinking active>Writing the reply</Thinking>
            </ChatMessage>
          )}
        </ChatThread>
      </KitBlock>

      <KitBlock
        title="Thinking"
        note="A folded reasoning trace; the label shimmers while it works."
      >
        <Stack gap={3}>
          <Thinking active>Reading the calendar</Thinking>
          <Thinking duration={4} defaultOpen>
            {'The person wants the week at a glance.\nCheck the calendar, then the tasks.'}
          </Thinking>
        </Stack>
      </KitBlock>

      <KitBlock title="Tool calls" note="Running, done and failed; a detail opens under the chip.">
        <Stack gap={2} align="start">
          <ToolChip
            name="calendar.list_events"
            status="done"
            summary="3 events"
            detail={'{ "days": 7 }'}
          />
          <ToolChip
            name="tasks.search"
            status="failed"
            detail="Error: the task service timed out"
          />
          <ToolChip name="mail.draft" status="running" />
        </Stack>
      </KitBlock>

      <KitBlock
        title="Approvals"
        note="Approve is success (danger when destructive); Deny is neutral."
      >
        <Stack gap={3}>
          <ApprovalCard
            title="Send the weekly summary"
            description="The assistant wants to email the draft."
            details={[
              { term: 'To', detail: 'team@example.com' },
              { term: 'Subject', detail: 'Week 42 at a glance' },
            ]}
            decision={decision}
            resolvedNote="Nothing was sent."
            onApprove={() => setDecision('approved')}
            onDeny={() => setDecision('denied')}
          />
          <ApprovalCard title="Delete 3 old drafts" destructive approveLabel="Delete" />
          <ApprovalCard title="Create a calendar hold" decision="approved" />
        </Stack>
      </KitBlock>

      <KitBlock
        title="Composer"
        note="Enter sends, Shift+Enter adds a line. The button is Stop while a reply streams."
      >
        <Stack gap={3}>
          <Composer onSend={setSent} maxLength={500} label="Message to the example assistant" />
          <Text size="small" tone="muted" aria-live="polite">
            {sent ? `Last sent: ${sent}` : 'Nothing sent yet.'}
          </Text>
          <Composer onSend={() => {}} streaming label="Message while a reply streams" />
        </Stack>
      </KitBlock>

      <KitBlock title="Assistant layout" note="The empty state offers starter prompts." wide>
        <AssistantLayout
          empty
          suggestions={['Summarise my week', 'Draft a reply']}
          onSuggestion={setPicked}
          composer={<Composer onSend={setPicked} label="Message to the empty assistant" />}
          notice={
            picked ? (
              <Text size="small" tone="muted" aria-live="polite">
                {`Chosen: ${picked}`}
              </Text>
            ) : null
          }
        />
      </KitBlock>
    </KitSection>
  );
}
