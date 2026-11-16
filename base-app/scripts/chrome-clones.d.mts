export function cloneDir(options?: { platform?: string; userTempDir?: string }): string | null;
export function snapshotClones(options?: {
  dir?: string | null;
  list?: (dir: string) => string[];
}): Set<string>;
export type Holders = { state: 'free' | 'held' | 'unknown'; pids: number[] };
type Run = (
  cmd: string,
  args: string[],
  options: object,
) => { stdout?: string | null; status: number | null; signal?: string | null; error?: Error };
export function holders(path: string, options?: { run?: Run; timeoutMs?: number }): Holders;
export function inUseByProcess(path: string, options?: { run?: Run; timeoutMs?: number }): boolean;
export function parentOf(pid: number, options?: { run?: Run }): number | null;
export function descendsFrom(
  pid: number,
  root?: number,
  parent?: (pid: number) => number | null,
): boolean;
export function claimNewClones(
  before: Set<string>,
  options?: {
    dir?: string | null;
    list?: (dir: string) => string[];
    who?: (path: string) => Holders;
    ours?: (pid: number) => boolean;
  },
): Set<string>;
export function sweepClaimed(
  claimed: Set<string>,
  options?: {
    dir?: string | null;
    inUse?: (path: string) => boolean;
    remove?: (path: string) => void;
  },
): string[];
export function guardClones(options?: object): {
  claim: () => void;
  sweep: () => string[];
  around: <T>(close: () => Promise<T> | T) => Promise<T>;
};
export function headlessShell(options?: {
  env?: Record<string, string | undefined>;
  platform?: string;
  home?: string;
}): string | undefined;
