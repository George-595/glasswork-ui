import type { DbDriver } from '../types.ts';
import { dialectFor } from './dialect.ts';
import type { Migration } from './types.ts';

/* The agent's tables (services/agent.ts): saved chats and saved views.

   agent_conversations  one chat, owned by a user. `pending` holds the state of a run that
                        stopped to ask the person to approve an action (JSON), null otherwise.
   agent_messages       the chat's messages in order: content is the provider-neutral blocks
                        (text, tool calls, tool results with what the page shows for them), as
                        JSON. Assistant messages carry the model and token counts.
   saved_views          a visual the person pinned: the show_* action and its input (JSON),
                        re-drawn from the database each time the Views page opens. */
export const migration002: Migration = {
  id: '002_agent',
  up: (driver: DbDriver) => {
    const d = dialectFor(driver);
    return [
      `CREATE TABLE agent_conversations (
        id ${d.id} NOT NULL,
        user_id ${d.id} NOT NULL,
        title VARCHAR(200) NOT NULL,
        pending ${d.text},
        created_at ${d.timestamp} NOT NULL,
        updated_at ${d.timestamp} NOT NULL,
        CONSTRAINT pk_agent_conversations PRIMARY KEY (id),
        CONSTRAINT fk_agent_conversations_user_id FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE CASCADE
      )`,
      'CREATE INDEX ix_agent_conversations_user_id_updated_at ON agent_conversations (user_id, updated_at)',

      `CREATE TABLE agent_messages (
        id ${d.id} NOT NULL,
        conversation_id ${d.id} NOT NULL,
        role VARCHAR(16) NOT NULL,
        content ${d.text} NOT NULL,
        model VARCHAR(100),
        input_tokens INTEGER,
        output_tokens INTEGER,
        created_at ${d.timestamp} NOT NULL,
        CONSTRAINT pk_agent_messages PRIMARY KEY (id),
        CONSTRAINT fk_agent_messages_conversation_id FOREIGN KEY (conversation_id)
          REFERENCES agent_conversations (id) ON DELETE CASCADE,
        CONSTRAINT ck_agent_messages_role CHECK (role IN ('user', 'assistant'))
      )`,
      'CREATE INDEX ix_agent_messages_conversation_id_created_at ON agent_messages (conversation_id, created_at)',

      `CREATE TABLE saved_views (
        id ${d.id} NOT NULL,
        user_id ${d.id} NOT NULL,
        title VARCHAR(200) NOT NULL,
        tool VARCHAR(40) NOT NULL,
        spec ${d.text} NOT NULL,
        created_at ${d.timestamp} NOT NULL,
        updated_at ${d.timestamp} NOT NULL,
        CONSTRAINT pk_saved_views PRIMARY KEY (id),
        CONSTRAINT fk_saved_views_user_id FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT ck_saved_views_tool CHECK (tool IN ('show_chart', 'show_kpis', 'show_table', 'show_diagram'))
      )`,
      'CREATE INDEX ix_saved_views_user_id_created_at ON saved_views (user_id, created_at)',
    ];
  },
};
