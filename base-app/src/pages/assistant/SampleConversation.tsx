import { useState } from 'react';
import {
  ApprovalCard,
  type ApprovalDecision,
  ChatMessage,
  Generate,
  Text,
  Thinking,
  ToolChip,
} from '~/core/ui';

/* A fixed example conversation, for the demo when no model is configured. It exercises the
   reasoning trace, tool chips in all three states and an approval the reader can actually
   decide. Nothing here talks to the server; the times are fixed so the page is the same for
   everyone. */
const REASONING =
  'The person wants the week at a glance.\nCheck the calendar for events, then the task list for anything due.\nThe task search failed, so say so plainly and offer to retry.';

export function SampleConversation() {
  const [decision, setDecision] = useState<ApprovalDecision | undefined>();
  return (
    <>
      <ChatMessage from="system">Example conversation. Nothing is sent to a model.</ChatMessage>
      <ChatMessage from="user" name="You" timestamp="2026-10-12T09:05:00Z">
        {'What is on this week?\nAnd email the team a summary.'}
      </ChatMessage>
      <ChatMessage from="assistant" name="Assistant" timestamp="2026-10-12T09:05:09Z">
        <Thinking duration={4} defaultOpen>
          {REASONING}
        </Thinking>
        <ToolChip
          name="calendar.list_events"
          status="done"
          summary="3 events"
          detail={'{\n  "from": "2026-10-12",\n  "days": 7\n}'}
        />
        <ToolChip name="tasks.search" status="failed" detail="Error: the task service timed out" />
        <ToolChip name="mail.draft" status="running" />
        <Text preserveLines>
          {
            'You have three events: Monday standup, Wednesday review and a Friday demo.\nI could not read your task list, so I have left it out.\nI have drafted the summary and need your go-ahead to send it.'
          }
        </Text>
        <Generate done="Approval ready">
          <ApprovalCard
            title="Send the weekly summary"
            description="The assistant wants to email the draft."
            details={[
              { term: 'To', detail: 'team@example.com' },
              { term: 'Subject', detail: 'Week 42 at a glance' },
            ]}
            decision={decision}
            resolvedNote="Nothing was sent, this is an example."
            onApprove={() => setDecision('approved')}
            onDeny={() => setDecision('denied')}
          />
        </Generate>
      </ChatMessage>
    </>
  );
}
