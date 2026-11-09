import type { AgentActionInfo, AgentVisual, Role, SessionUser } from '../../../shared/api.ts';
import { type Infer, type ObjectSchema, validate } from '../../lib/schema.ts';
import { ServiceError } from '../errors.ts';

/* An action is one thing the app can do, defined once and reachable two ways: a page calls it
   (POST /api/actions/:name, through `api.runAction`) and the assistant calls it as a tool. Both
   go through `runAction` below, so they get the same input check, the same role check and the
   same code. The idea is Builder.io's agent-native ("actions are the single source of truth"),
   rebuilt on our own server: no framework, no extra packages.

   effect:  read    looks something up; the model sees the result.
            visual  draws something for the person (a chart, KPI tiles, a table, a diagram, a
                    link); the model is told what was shown, with the numbers.
            write   changes data. With `confirm`, the assistant must ask first: the run stops
                    and the person approves or denies in the chat. A page calling the action
                    directly needs no approval (the person clicked it).
   role:    the least role that may run it (viewer < editor < admin). The server checks it on
            every call, and the assistant is only ever offered the actions its user may run. */

export type ActionEffect = AgentActionInfo['effect'];

export interface ActionContext {
  user: SessionUser;
  /** The caller's address, for the audit log. */
  ip: string;
  now: Date;
  signal?: AbortSignal;
}

/** What a run gives back: the output, and how the chat shows it. */
export interface ActionOutcome {
  result: unknown;
  /** One short line for the tool chip ("12 transactions"). */
  summary?: string;
  /** Drawn in the chat. */
  visual?: AgentVisual;
  /** What the model is told (default: the result as JSON). */
  forModel?: string;
}

export interface ActionDef<S extends ObjectSchema, O> {
  name: string;
  /** The human name, shown on the tool chip and the approval card ("Invite a user"). */
  title: string;
  /** For the model: what it does and when to use it. */
  description: string;
  effect: ActionEffect;
  role: Role;
  /** The assistant must ask the person before running it. */
  confirm?: boolean;
  /** The approve button is a danger button (it removes or overwrites something). */
  destructive?: boolean;
  input: S;
  run(ctx: ActionContext, input: Infer<S>): Promise<O>;
  summary?(output: O, input: Infer<S>): string;
  visual?(output: O, input: Infer<S>): AgentVisual | undefined;
  forModel?(output: O, input: Infer<S>): string;
  /** The approval card: the one-line title and the exact details. */
  describe?(input: Infer<S>, ctx: ActionContext): ApprovalText | Promise<ApprovalText>;
}
export interface ApprovalText {
  title: string;
  details: { term: string; detail: string }[];
}

/** A defined action with its types erased, as the registry holds it. */
export interface Action {
  name: string;
  title: string;
  description: string;
  effect: ActionEffect;
  role: Role;
  confirm: boolean;
  destructive: boolean;
  input: ObjectSchema;
  execute(ctx: ActionContext, input: unknown): Promise<ActionOutcome>;
  describe(input: unknown, ctx: ActionContext): Promise<ApprovalText>;
}

/* `const S` keeps the schema literal, so `run`'s input is typed from it. */
export function defineAction<const S extends ObjectSchema, O>(def: ActionDef<S, O>): Action {
  return {
    name: def.name,
    title: def.title,
    description: def.description,
    effect: def.effect,
    role: def.role,
    confirm: def.confirm ?? false,
    destructive: def.destructive ?? false,
    input: def.input,
    async execute(ctx, raw) {
      const input = raw as Infer<S>;
      const result = await def.run(ctx, input);
      const outcome: ActionOutcome = { result };
      const summary = def.summary?.(result, input);
      if (summary !== undefined) outcome.summary = summary;
      const visual = def.visual?.(result, input);
      if (visual !== undefined) outcome.visual = visual;
      const forModel = def.forModel?.(result, input);
      if (forModel !== undefined) outcome.forModel = forModel;
      return outcome;
    },
    async describe(raw, ctx) {
      return (await def.describe?.(raw as Infer<S>, ctx)) ?? { title: def.title, details: [] };
    },
  };
}

const RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 };
export const mayRun = (user: SessionUser, action: Action): boolean =>
  RANK[user.role] >= RANK[action.role];

export function createActionRegistry(actions: readonly Action[]) {
  const byName = new Map<string, Action>();
  for (const a of actions) {
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(a.name)) throw new Error(`Bad action name "${a.name}"`);
    if (byName.has(a.name)) throw new Error(`Action "${a.name}" is defined twice`);
    byName.set(a.name, a);
  }

  /* The action, or a 404 (unknown, or one this user may not run: the same answer, so a
     viewer cannot learn which admin actions exist). */
  function find(user: SessionUser, name: string): Action {
    const action = byName.get(name);
    if (!action || !mayRun(user, action)) {
      throw new ServiceError(
        'not_found',
        'unknown_action',
        `There is no action "${name.slice(0, 64)}".`,
      );
    }
    return action;
  }

  /* Checks the input against the action's schema; the error names the field. */
  function check(action: Action, raw: unknown): unknown {
    const r = validate(action.input, raw ?? {});
    if (!r.ok) throw new ServiceError('invalid', 'invalid_input', r.error);
    return r.value;
  }

  return {
    /** The actions this user may run. */
    list(user: SessionUser): Action[] {
      return actions.filter((a) => mayRun(user, a));
    },
    find,
    check,
    /** Finds, checks and runs: the one path every caller takes. */
    async run(ctx: ActionContext, name: string, raw: unknown): Promise<ActionOutcome> {
      const action = find(ctx.user, name);
      return action.execute(ctx, check(action, raw));
    },
  };
}
export type ActionRegistry = ReturnType<typeof createActionRegistry>;
