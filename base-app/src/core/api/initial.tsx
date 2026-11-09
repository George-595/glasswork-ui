import { createContext, type ReactNode, useContext } from 'react';

/* The request-scoped initial-data cache.

   A server render answers the GET calls a page makes on its first render (the route's
   `prefetch`, app/routes.ts) through the same code the API runs, and hands the answers to the
   render here, keyed by API path ('/metrics/kpis?days=30', relative to the API base). The
   browser gets the same answers embedded in the page, so hydration starts from exactly what the
   server drew and nothing is fetched twice.

   - `useApiQuery(load, key, fromServer(path))` reads its first answer from here (useApiQuery.ts).
   - AuthProvider and SettingsProvider read '/auth/me' and '/settings' from here.
   - It is for FIRST RENDERS only. The browser calls `expire()` on its first move to another page,
     and a hook that has reloaded or changed its key never looks again, so a stale answer is
     never shown later in the session.
   - An entry holds what the API answered to THIS request's cookie. It is data the API would have
     sent anyway; nothing else is ever put here. */
export class InitialData {
  private entries: Map<string, unknown> | null;
  /** The instant the server drew the page (ISO), so a screen that shows the time can show the
      same one when the browser hydrates it. Absent in a client-only app. */
  readonly now: string | undefined;

  constructor(queries: Readonly<Record<string, unknown>> = {}, now?: string) {
    this.entries = new Map(Object.entries(queries));
    this.now = now;
  }

  /** The answer for `path`, or undefined (never prefetched, or expired). */
  peek(path: string): unknown {
    return this.entries?.get(path);
  }

  /** Forget everything: the first screen has been drawn. */
  expire(): void {
    this.entries = null;
  }
}

const InitialDataContext = createContext<InitialData | null>(null);

export function InitialDataProvider({
  data,
  children,
}: {
  data: InitialData;
  children: ReactNode;
}) {
  return <InitialDataContext.Provider value={data}>{children}</InitialDataContext.Provider>;
}

/** The initial data of this render, or null in a client-only app and in a test. */
export function useInitialData(): InitialData | null {
  return useContext(InitialDataContext);
}
