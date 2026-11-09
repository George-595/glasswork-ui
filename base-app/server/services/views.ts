import type { SavedView, SessionUser, VisualTool } from '../../shared/api.ts';
import type { DbClient } from '../infra/db/types.ts';
import { newId } from '../lib/ids.ts';
import { validate } from '../lib/schema.ts';
import { createRepositories } from '../repositories/index.ts';
import { renderSaved, VISUAL_SCHEMAS } from './actions/visuals.ts';
import type { DataService } from './data.ts';
import { ServiceError } from './errors.ts';

/* Saved views: visuals a person pinned from a chat (or that the assistant pinned for them),
   kept as the show_* action and its input and drawn again from the database every time the
   Views page opens, so a pinned "revenue by week" chart keeps up with the data. A view that
   no longer draws (a query the server stopped accepting) is listed with its error, not
   dropped. The page is told to refetch (`views` event) after a save or a delete. */
export const MAX_VIEWS_PER_USER = 50;

export function createViewsService(
  db: DbClient,
  deps: {
    data: DataService;
    publish?: (userId: string, event: string, data: unknown) => void;
    now?: () => Date;
  },
) {
  const repos = createRepositories(db);
  const now = deps.now ?? (() => new Date());
  const changed = (userId: string) => deps.publish?.(userId, 'views', { changed: true });

  return {
    async save(
      user: SessionUser,
      title: string,
      tool: VisualTool,
      spec: unknown,
    ): Promise<SavedView> {
      const clean = title.trim();
      if (clean === '' || clean.length > 200) {
        throw new ServiceError('invalid', 'invalid_title', 'Give the view a title.', 'title');
      }
      const checked = validate(VISUAL_SCHEMAS[tool], spec);
      if (!checked.ok) throw new ServiceError('invalid', 'invalid_input', checked.error);
      // drawing it once proves it draws before it is kept
      const visual = await renderSaved(deps.data, tool, checked.value);
      if ((await repos.savedViews.countForUser(user.id)) >= MAX_VIEWS_PER_USER) {
        throw new ServiceError(
          'conflict',
          'too_many_views',
          `You have ${MAX_VIEWS_PER_USER} saved views. Remove one first.`,
        );
      }
      const at = now();
      const id = newId();
      await repos.savedViews.insert({
        id,
        userId: user.id,
        title: clean,
        tool,
        spec: JSON.stringify(checked.value),
        at,
      });
      changed(user.id);
      return { id, title: clean, tool, createdAt: at.toISOString(), visual };
    },

    async list(user: SessionUser): Promise<SavedView[]> {
      const rows = await repos.savedViews.listForUser(user.id, MAX_VIEWS_PER_USER);
      return Promise.all(
        rows.map(async (r): Promise<SavedView> => {
          const base = {
            id: r.id,
            title: r.title,
            tool: r.tool as VisualTool,
            createdAt: r.createdAt,
          };
          try {
            return { ...base, visual: await renderSaved(deps.data, r.tool, JSON.parse(r.spec)) };
          } catch (err) {
            return {
              ...base,
              visual: null,
              error: err instanceof ServiceError ? err.message : 'This view could not be drawn.',
            };
          }
        }),
      );
    },

    async remove(user: SessionUser, id: string): Promise<void> {
      if (!(await repos.savedViews.delete(user.id, id))) {
        throw new ServiceError('not_found', 'view_not_found', 'No such view.');
      }
      changed(user.id);
    },
  };
}
export type ViewsService = ReturnType<typeof createViewsService>;
