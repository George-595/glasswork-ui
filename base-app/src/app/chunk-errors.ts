import { reloadApp } from './reload';

/* A new deploy changes every page file's name (content hashes) and the old files go away. A phone
   that kept the app open for days then asks for a file that is gone, or an offline phone asks for
   one it never fetched: the browser's `import()` rejects. The browser words differ, the cause is
   the same. These helpers tell that failure from a bug in our own code and recover from it:
   one reload, never a loop (ENGINEERING.md and README "A deploy while the app is open"). */

/* Chrome: "Failed to fetch dynamically imported module: <url>". Firefox: "error loading
   dynamically imported module". Safari: "Importing a module script failed." Vite's own
   modulepreload helper: "Unable to preload CSS for <url>". */
const CHUNK_MESSAGE =
  /dynamically imported module|importing a module script failed|failed to load module script|unable to preload/i;

export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'ChunkLoadError') return true;
  return CHUNK_MESSAGE.test(error.message);
}

const STORAGE_KEY = 'app-chunk-reload-at';
/* One automatic reload per minute at most: a second failure inside it is a real fault (a file
   missing from the deploy), so the person gets the plain message and a button, not a loop. */
const LOOP_WINDOW_MS = 60_000;

export interface RecoveryDeps {
  online: () => boolean;
  now: () => number;
  storage: () => Pick<Storage, 'getItem' | 'setItem'> | null;
  reload: () => void;
}

const defaults: RecoveryDeps = {
  online: () => navigator.onLine,
  now: () => Date.now(),
  storage: () => {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  },
  reload: reloadApp,
};

/* A reload this page has already started. A failed `import()` and `vite:preloadError` report the
   same missing file, one after the other: the second must not show an error screen for the
   moment the first reload takes. */
let reloading = false;

/** For tests: forget a reload that was started. */
export function resetChunkRecovery(): void {
  reloading = false;
}

/** Reloads the page once because a new version of the app is out. Returns whether a reload is
    under way. It does nothing offline (a reload with no connection loses the app it is in), with
    no sessionStorage (it could not remember having reloaded, so it could loop) or when it has
    already reloaded in the last minute. */
export function reloadForNewVersion(overrides: Partial<RecoveryDeps> = {}): boolean {
  if (reloading) return true;
  const deps = { ...defaults, ...overrides };
  if (!deps.online()) return false;
  const store = deps.storage();
  if (!store) return false;
  const now = deps.now();
  try {
    const last = Number(store.getItem(STORAGE_KEY));
    if (Number.isFinite(last) && last > 0 && now - last < LOOP_WINDOW_MS) return false;
    store.setItem(STORAGE_KEY, String(now));
  } catch {
    return false;
  }
  reloading = true;
  deps.reload();
  return true;
}

/** Vite fires `vite:preloadError` when a page's file (or its CSS) cannot be fetched. Recover with
    one reload and swallow the error; when no reload is allowed, leave it to throw as usual so
    the error screen's plain message shows. Returns the remover. */
export function installPreloadRecovery(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
  overrides: Partial<RecoveryDeps> = {},
): () => void {
  const onError = (event: Event) => {
    if (reloadForNewVersion(overrides)) event.preventDefault();
  };
  target.addEventListener('vite:preloadError', onError);
  return () => target.removeEventListener('vite:preloadError', onError);
}
