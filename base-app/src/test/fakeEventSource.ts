/* A fake EventSource for tests: nothing connects; the test pushes events in with emit() and makes
   the connection fail with fail(). Pass `createEventSource={(url) => new FakeEventSource(url)}` to
   RealtimeProvider. `FakeEventSource.all` lists every one made (reset it in beforeEach). */
import type { EventSourceLike } from '~/core/realtime';

export class FakeEventSource implements EventSourceLike {
  static all: FakeEventSource[] = [];
  /** The newest source that is still open. */
  static get current(): FakeEventSource {
    const open = FakeEventSource.all.filter((s) => !s.closed);
    const last = open[open.length - 1];
    if (!last) throw new Error('No open FakeEventSource.');
    return last;
  }

  readonly url: string;
  closed = false;
  private listeners = new Map<string, ((e: MessageEvent<string>) => void)[]>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.all.push(this);
  }
  addEventListener(type: string, listener: (e: MessageEvent<string>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  close() {
    this.closed = true;
  }
  /** Delivers an event; an object is sent as JSON, like the server does. */
  emit(type: string, data: unknown = {}) {
    for (const l of this.listeners.get(type) ?? []) {
      l({ data: typeof data === 'string' ? data : JSON.stringify(data) } as MessageEvent<string>);
    }
  }
  fail() {
    for (const l of this.listeners.get('error') ?? []) l({} as MessageEvent<string>);
  }
  listensTo(type: string) {
    return this.listeners.has(type);
  }
}
