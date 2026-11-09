import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type AgentContext,
  type AgentConversation,
  type AgentMessage,
  type AgentPart,
  type AgentToolPart,
  ApiError,
  api,
  type VisualTool,
} from '~/core/api';
import { playSound } from '~/core/ui';

/* useAgentChat — one conversation with the assistant (POST /api/agent/stream), shared by the
   Assistant page and the Ask panel. It holds the saved chats, the open chat's messages, the
   composer draft, the run in flight and the one status line to announce.

   A run is a new message or the answer to an approval; its events build one assistant
   message (text as it arrives, a tool part per action, an approval card). `context` says
   where the person is asking from and is read when a run starts, so it can change between
   messages. Stop aborts the run and keeps what arrived. A failed send is taken back out of
   the thread and its text goes back into the draft. */
export type AgentFailure = { kind: 'not-configured' } | { kind: 'error'; message: string };
export type PinState = 'pinning' | 'pinned';

export const textOf = (m: AgentMessage) =>
  m.parts.flatMap((p) => (p.type === 'text' ? [p.text] : [])).join('\n\n');
export const isVisualTool = (name: string): name is VisualTool =>
  name === 'show_chart' || name === 'show_kpis' || name === 'show_table' || name === 'show_diagram';

/** The reply's parts with one event applied. */
export function withText(parts: AgentPart[], text: string): AgentPart[] {
  const last = parts.at(-1);
  if (last?.type === 'text') return [...parts.slice(0, -1), { ...last, text: last.text + text }];
  return [...parts, { type: 'text', text }];
}
export function withPart(parts: AgentPart[], part: AgentPart): AgentPart[] {
  if (part.type === 'text') return withText(parts, part.text);
  const i = parts.findIndex((p) => p.type === part.type && p.callId === part.callId);
  if (i === -1) return [...parts, part];
  return parts.map((p, j) => (j === i ? part : p));
}

const nowIso = () => new Date().toISOString();
let localSeq = 0;

export interface AgentChat {
  chats: AgentConversation[];
  activeId: string | null;
  messages: AgentMessage[];
  draft: string;
  setDraft: (text: string) => void;
  busy: boolean;
  failure: AgentFailure | null;
  announce: string;
  pins: Record<string, PinState>;
  loadChats: () => void;
  open: (id: string) => Promise<void>;
  startNew: () => void;
  send: (text: string) => Promise<void>;
  decide: (replyId: string, callId: string, approve: boolean) => Promise<void>;
  stop: () => void;
  pin: (part: AgentToolPart) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useAgentChat(context: AgentContext, opts: { loadList?: boolean } = {}): AgentChat {
  const loadList = opts.loadList ?? true;
  const [chats, setChats] = useState<AgentConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<AgentFailure | null>(null);
  const [announce, setAnnounce] = useState('');
  const [pins, setPins] = useState<Record<string, PinState>>({});
  const abort = useRef<AbortController | null>(null);
  const contextRef = useRef(context);
  useEffect(() => {
    contextRef.current = context;
  });

  const loadChats = useCallback(() => {
    if (!loadList) return;
    api
      .conversations()
      .then((r) => setChats(r.conversations))
      .catch(() => {});
  }, [loadList]);
  useEffect(loadChats, [loadChats]);

  async function open(id: string) {
    if (busy) return;
    setFailure(null);
    setAnnounce('');
    setPins({});
    try {
      const r = await api.conversation(id);
      setActiveId(id);
      setMessages(r.messages);
    } catch (err) {
      setFailure({
        kind: 'error',
        message: err instanceof ApiError ? err.message : 'Could not open that chat.',
      });
    }
  }

  function startNew() {
    if (busy) return;
    clear();
  }
  function clear() {
    setActiveId(null);
    setMessages([]);
    setFailure(null);
    setAnnounce('');
    setPins({});
  }

  /* One run. The reply goes into `replyId`: a new assistant message, or (for a decision) the
     one holding the approval card. */
  async function run(
    body: { message?: string; decision?: { callId: string; approve: boolean } },
    replyId: string,
  ) {
    setFailure(null);
    setAnnounce('');
    setBusy(true);
    const controller = new AbortController();
    abort.current = controller;
    const patch = (fn: (parts: AgentPart[]) => AgentPart[]) =>
      setMessages((prev) => prev.map((m) => (m.id === replyId ? { ...m, parts: fn(m.parts) } : m)));
    let conversationId = activeId;
    try {
      const done = await api.agentStream(
        {
          ...body,
          ...(activeId ? { conversationId: activeId } : {}),
          context: contextRef.current,
        },
        {
          signal: controller.signal,
          onConversation: (c) => {
            conversationId = c.id;
            setActiveId(c.id);
          },
          onDelta: (text) => patch((parts) => withText(parts, text)),
          onTool: (part) => patch((parts) => withPart(parts, part)),
          onApproval: (part) => patch((parts) => withPart(parts, part)),
        },
      );
      if (controller.signal.aborted) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === replyId ? { ...m, ...(done.model ? { model: done.model } : {}) } : m,
        ),
      );
      playSound(done.pending ? 'approval' : 'reply');
      setAnnounce(done.pending ? 'Waiting for your approval.' : 'Reply complete.');
      return true;
    } catch (err) {
      if (controller.signal.aborted) return;
      setFailure(
        err instanceof ApiError && err.code === 'llm_not_configured'
          ? { kind: 'not-configured' }
          : {
              kind: 'error',
              message: err instanceof ApiError ? err.message : 'Something went wrong.',
            },
      );
      return false;
    } finally {
      if (abort.current === controller) {
        abort.current = null;
        setBusy(false);
      }
      if (conversationId) loadChats();
    }
  }

  async function send(text: string) {
    localSeq += 1;
    const userId = `local-user-${localSeq}`;
    const replyId = `local-reply-${localSeq}`;
    const now = nowIso();
    setMessages((prev) => [
      ...prev,
      { id: userId, from: 'user', at: now, parts: [{ type: 'text', text }] },
      { id: replyId, from: 'assistant', at: now, parts: [] },
    ]);
    setDraft('');
    const ok = await run({ message: text }, replyId);
    if (ok === false) {
      // give the message back: out of the thread (with any partial reply), into the composer
      setMessages((prev) => prev.filter((m) => m.id !== userId && m.id !== replyId));
      setDraft(text);
    }
  }

  async function decide(replyId: string, callId: string, approve: boolean) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === replyId
          ? {
              ...m,
              parts: m.parts.map((p) =>
                p.type === 'approval' && p.callId === callId
                  ? { ...p, decision: approve ? ('approved' as const) : ('denied' as const) }
                  : p,
              ),
            }
          : m,
      ),
    );
    const ok = await run({ decision: { callId, approve } }, replyId);
    if (ok === false && activeId) void open(activeId);
  }

  function stop() {
    if (!abort.current) return;
    abort.current.abort();
    abort.current = null;
    setBusy(false);
    // keep what had arrived, marked as stopped; a reply with nothing in it yet goes
    setMessages((prev) =>
      prev.flatMap((m, i) =>
        i === prev.length - 1 && m.from === 'assistant'
          ? m.parts.length === 0
            ? []
            : [{ ...m, stopped: true }]
          : [m],
      ),
    );
    setAnnounce('Reply stopped.');
  }

  async function pin(part: AgentToolPart) {
    if (!part.input || !isVisualTool(part.name) || !part.visual) return;
    const title = 'title' in part.visual && part.visual.title ? part.visual.title : part.title;
    setPins((p) => ({ ...p, [part.callId]: 'pinning' }));
    try {
      await api.runAction('save_view', { title, tool: part.name, spec: part.input });
      setPins((p) => ({ ...p, [part.callId]: 'pinned' }));
      setAnnounce(`Pinned “${title}” to Views.`);
    } catch (err) {
      setPins((p) => {
        const next = { ...p };
        delete next[part.callId];
        return next;
      });
      setFailure({
        kind: 'error',
        message: err instanceof ApiError ? err.message : 'Could not pin that.',
      });
    }
  }

  async function remove(id: string) {
    await api.deleteConversation(id);
    if (id === activeId) {
      // the chat on screen is gone: end its run (if one is going) and show a new chat, rather
      // than leaving the deleted thread up with a reply still streaming into it
      if (abort.current) {
        abort.current.abort();
        abort.current = null;
        setBusy(false);
      }
      clear();
    }
    loadChats();
  }

  // leaving mid-reply stops the run (and the paid call)
  useEffect(() => () => abort.current?.abort(), []);

  return {
    chats,
    activeId,
    messages,
    draft,
    setDraft,
    busy,
    failure,
    announce,
    pins,
    loadChats,
    open,
    startNew,
    send,
    decide,
    stop,
    pin,
    remove,
  };
}
