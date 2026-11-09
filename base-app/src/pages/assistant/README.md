# assistant

`/assistant`: a saved conversation with the model, which acts through the app's actions
(`POST /api/agent/stream`, `server/services/agent.ts`). It reads the database, draws what it finds,
and asks before it changes anything. Made of the kit's AI primitives (`AssistantLayout` with a
`ConversationList` aside, `ChatMessage`, `Composer`, `Thinking`, `ToolChip`, `ApprovalCard`) and
`AgentVisualView` from `src/core/ui`.

- **A run** is one message (or the answer to an approval). Its events build one assistant message:
  text as it is written, a `ToolChip` per action with its visual under it (a chart, key figures, a
  table, a `FlowDiagram`, a link to a page already filtered), and an `ApprovalCard` when an action
  waits. Approve or Deny posts `{ decision }` and the same message carries on.
- **Saved chats.** The server saves every message; the list beside the thread opens one (`GET
  /api/agent/conversations/:id`), "New chat" starts another, and a chat can be deleted after a
  `ConfirmDialog`. A chat waiting for an approval carries a "Waiting" badge.
- **Pin to Views.** A chart, tiles, table or diagram can be pinned: the page runs the `save_view`
  action with the show_* input that drew it, so the Views page redraws it from the data.
- "Thinking" shows until the first event. Stop aborts the run and keeps what arrived, with a
  "Stopped" note (a reply with nothing in it yet is dropped). The thread is `aria-busy` while a
  reply streams and one status line says "Reply complete.", "Reply stopped." or "Waiting for your
  approval." at the end. A failed send takes the message back out and puts its text in the
  composer again, with a `Notice` saying why.
- **Not configured** (`llm_not_configured`): a warning `Notice` names the key to set
  (`ANTHROPIC_API_KEY`, or `GEMINI_API_KEY` with `LLM_PROVIDER=gemini`, in `base-app/.env`).
  "Show example conversation" renders `SampleConversation`, a fixed thread that sends nothing.
- **Shared with the Ask panel.** The chat logic is `useAgentChat` and the thread is `AgentThread`
  (`src/core/agent`); the shell's Ask panel (`src/app/AskPanel.tsx`) uses the same two, with the page
  it was opened from as context. This page sends `{ path: '/assistant', title: 'Assistant' }`.
