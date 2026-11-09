import type { DbExecutor } from '../infra/db/types.ts';

/* SQL for the agent's saved chats: conversations and their messages. Content and the pending
   approval state are JSON text that the service writes and reads; nothing here looks inside.
   Every query is scoped by the owner, so another user's conversation id finds nothing. */
export interface ConversationRecord {
  id: string;
  userId: string;
  title: string;
  /** JSON of the run waiting for an approval, or null. */
  pending: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface AgentMessageRecord {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  /** JSON blocks. */
  content: string;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: string;
}

type ConversationRow = {
  id: string;
  user_id: string;
  title: string;
  pending: string | null;
  created_at: string;
  updated_at: string;
};
type MessageRow = {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  model: string | null;
  input_tokens: number | string | null;
  output_tokens: number | string | null;
  created_at: string;
};

const CONVERSATION_COLUMNS = 'id, user_id, title, pending, created_at, updated_at';
const MESSAGE_COLUMNS =
  'id, conversation_id, role, content, model, input_tokens, output_tokens, created_at';

const toConversation = (r: ConversationRow): ConversationRecord => ({
  id: r.id,
  userId: r.user_id,
  title: r.title,
  pending: r.pending,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const numberOrNull = (v: number | string | null): number | null => (v === null ? null : Number(v));
const toMessage = (r: MessageRow): AgentMessageRecord => ({
  id: r.id,
  conversationId: r.conversation_id,
  role: r.role === 'assistant' ? 'assistant' : 'user',
  content: r.content,
  model: r.model,
  inputTokens: numberOrNull(r.input_tokens),
  outputTokens: numberOrNull(r.output_tokens),
  createdAt: r.created_at,
});

export function agentRepository(db: DbExecutor) {
  return {
    async insertConversation(c: {
      id: string;
      userId: string;
      title: string;
      at: Date;
    }): Promise<void> {
      await db.execute(
        `INSERT INTO agent_conversations (id, user_id, title, pending, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, ?)`,
        [c.id, c.userId, c.title, c.at, c.at],
      );
    },
    async findConversation(userId: string, id: string): Promise<ConversationRecord | null> {
      const rows = await db.query<ConversationRow>(
        `SELECT ${CONVERSATION_COLUMNS} FROM agent_conversations WHERE id = ? AND user_id = ?`,
        [id, userId],
      );
      return rows[0] ? toConversation(rows[0]) : null;
    },
    /** A user's conversations, most recently active first (ix_agent_conversations_user_id_updated_at). */
    async listConversations(userId: string, limit: number): Promise<ConversationRecord[]> {
      const n = Math.max(1, Math.min(200, Math.floor(limit)));
      const rows = await db.query<ConversationRow>(
        `SELECT ${CONVERSATION_COLUMNS} FROM agent_conversations
         WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT ${n}`,
        [userId],
      );
      return rows.map(toConversation);
    },
    /** Sets the title; false when the conversation is not the user's. */
    async renameConversation(
      userId: string,
      id: string,
      title: string,
      at: Date,
    ): Promise<boolean> {
      const r = await db.execute(
        'UPDATE agent_conversations SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?',
        [title, at, id, userId],
      );
      return r.rowsAffected > 0;
    },
    /** Records activity (and the pending state, null to clear it). */
    async touchConversation(id: string, pending: string | null, at: Date): Promise<void> {
      await db.execute('UPDATE agent_conversations SET pending = ?, updated_at = ? WHERE id = ?', [
        pending,
        at,
        id,
      ]);
    },
    /** Takes the waiting approval for this run: clears `pending` only if it still holds exactly
        `expected`. True for the one caller that wins; a second approve (a double click, another
        tab) gets false and must not run the action again. */
    async claimPending(id: string, expected: string, at: Date): Promise<boolean> {
      const r = await db.execute(
        'UPDATE agent_conversations SET pending = NULL, updated_at = ? WHERE id = ? AND pending = ?',
        [at, id, expected],
      );
      return r.rowsAffected === 1;
    },
    /** Deletes the conversation and (fk ON DELETE CASCADE) its messages; false when it is
        not the user's. */
    async deleteConversation(userId: string, id: string): Promise<boolean> {
      const r = await db.execute('DELETE FROM agent_conversations WHERE id = ? AND user_id = ?', [
        id,
        userId,
      ]);
      return r.rowsAffected > 0;
    },
    async insertMessage(m: {
      id: string;
      conversationId: string;
      role: 'user' | 'assistant';
      content: string;
      model?: string | null;
      inputTokens?: number | null;
      outputTokens?: number | null;
      at: Date;
    }): Promise<void> {
      await db.execute(
        `INSERT INTO agent_messages
           (id, conversation_id, role, content, model, input_tokens, output_tokens, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          m.id,
          m.conversationId,
          m.role,
          m.content,
          m.model ?? null,
          m.inputTokens ?? null,
          m.outputTokens ?? null,
          m.at,
        ],
      );
    },
    async deleteMessage(id: string): Promise<void> {
      await db.execute('DELETE FROM agent_messages WHERE id = ?', [id]);
    },
    /** Every message of a conversation, oldest first; id (UUIDv7) breaks a tie in time. */
    async listMessages(conversationId: string): Promise<AgentMessageRecord[]> {
      const rows = await db.query<MessageRow>(
        `SELECT ${MESSAGE_COLUMNS} FROM agent_messages
         WHERE conversation_id = ? ORDER BY created_at, id`,
        [conversationId],
      );
      return rows.map(toMessage);
    },
  };
}

/* SQL for saved views: a pinned visual, stored as the show_* action and its input. */
export interface SavedViewRecord {
  id: string;
  userId: string;
  title: string;
  tool: string;
  /** JSON input of the show_* action. */
  spec: string;
  createdAt: string;
}
type ViewRow = {
  id: string;
  user_id: string;
  title: string;
  tool: string;
  spec: string;
  created_at: string;
};
const toView = (r: ViewRow): SavedViewRecord => ({
  id: r.id,
  userId: r.user_id,
  title: r.title,
  tool: r.tool,
  spec: r.spec,
  createdAt: r.created_at,
});

export function savedViewsRepository(db: DbExecutor) {
  return {
    async insert(v: {
      id: string;
      userId: string;
      title: string;
      tool: string;
      spec: string;
      at: Date;
    }): Promise<void> {
      await db.execute(
        `INSERT INTO saved_views (id, user_id, title, tool, spec, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [v.id, v.userId, v.title, v.tool, v.spec, v.at, v.at],
      );
    },
    /** Oldest first, so a dashboard keeps its order as views are added (ix_saved_views_user_id_created_at). */
    async listForUser(userId: string, limit: number): Promise<SavedViewRecord[]> {
      const n = Math.max(1, Math.min(200, Math.floor(limit)));
      const rows = await db.query<ViewRow>(
        `SELECT id, user_id, title, tool, spec, created_at FROM saved_views
         WHERE user_id = ? ORDER BY created_at, id LIMIT ${n}`,
        [userId],
      );
      return rows.map(toView);
    },
    async countForUser(userId: string): Promise<number> {
      const rows = await db.query<{ n: number | string }>(
        'SELECT COUNT(*) AS n FROM saved_views WHERE user_id = ?',
        [userId],
      );
      return Number(rows[0]?.n ?? 0);
    },
    /** false when the view is not the user's. */
    async delete(userId: string, id: string): Promise<boolean> {
      const r = await db.execute('DELETE FROM saved_views WHERE id = ? AND user_id = ?', [
        id,
        userId,
      ]);
      return r.rowsAffected > 0;
    },
  };
}
