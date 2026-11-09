import { migration001 } from './001_baseline.ts';
import { migration002 } from './002_agent.ts';
import { migration003 } from './003_view_as.ts';
import type { Migration } from './types.ts';

export type { Migration } from './types.ts';

/* Every migration, in order. Adding one: a new NNN_name.ts file and one line here. */
export const MIGRATIONS: readonly Migration[] = [migration001, migration002, migration003];
