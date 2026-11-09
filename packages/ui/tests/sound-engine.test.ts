// @vitest-environment jsdom
/* The sound engine and the Sounds setting: one AudioContext, every buffer decoded once, a 60 ms
   throttle per sound, silence when off / hidden / server-side / without Web Audio, every error
   swallowed, and a `ui:sound` event whenever a sound would play. A fake AudioContext and a fake
   fetch stand in for the browser; no audio is made. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SOUND_NAMES, setSoundEnabled, soundEnabled } from '../src/sound';
import { playSound, primeSounds, resetSoundEngine } from '../src/sound/engine';
import { resetSoundStore } from '../src/sound/store';

const calls = { contexts: 0, decodes: 0, starts: 0, resumes: 0, fetches: [] as string[] };
let suspended = false;

class FakeAudioContext {
  state = 'running';
  destination = {};
  constructor() {
    calls.contexts += 1;
    if (suspended) this.state = 'suspended';
  }
  createGain() {
    return { gain: { value: 0 }, connect() {} };
  }
  createBufferSource() {
    return {
      buffer: null as unknown,
      connect() {},
      start() {
        calls.starts += 1;
      },
    };
  }
  async decodeAudioData() {
    calls.decodes += 1;
    return { duration: 0.1 };
  }
  async resume() {
    calls.resumes += 1;
    this.state = 'running';
  }
}

const fakeFetch = async (url: string) => {
  calls.fetches.push(url);
  return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
};

const heard: string[] = [];
const onSound = (e: Event) => heard.push((e as CustomEvent<{ name: string }>).detail.name);

/* playSound starts the sound in the background: let its promises settle. */
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  localStorage.clear();
  resetSoundStore();
  resetSoundEngine();
  calls.contexts = calls.decodes = calls.starts = calls.resumes = 0;
  calls.fetches = [];
  suspended = false;
  heard.length = 0;
  (window as unknown as { AudioContext?: unknown }).AudioContext = FakeAudioContext;
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  window.addEventListener('ui:sound', onSound);
});

afterEach(() => {
  window.removeEventListener('ui:sound', onSound);
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
  Object.defineProperty(document, 'hidden', { value: false, configurable: true });
});

describe('playSound', () => {
  it('dispatches ui:sound with the name and starts the sound', async () => {
    playSound('success');
    await settle();
    expect(heard).toEqual(['success']);
    expect(calls.starts).toBe(1);
  });

  it('creates one AudioContext, fetches and decodes each sound once', async () => {
    playSound('tick');
    await settle();
    vi.setSystemTime(Date.now() + 100);
    playSound('tick');
    await settle();
    playSound('open');
    await settle();
    expect(calls.contexts).toBe(1);
    expect(calls.decodes).toBe(2);
    expect(calls.fetches).toHaveLength(2);
    expect(calls.starts).toBe(3);
  });

  it('resumes a suspended context', async () => {
    suspended = true;
    playSound('tick');
    await settle();
    expect(calls.resumes).toBe(1);
    expect(calls.starts).toBe(1);
  });

  it('plays the same sound at most once per 60 ms', async () => {
    playSound('tick');
    vi.setSystemTime(Date.now() + 30);
    playSound('tick');
    playSound('open'); // another sound is not held back
    vi.setSystemTime(Date.now() + 40);
    playSound('tick');
    await settle();
    expect(heard).toEqual(['tick', 'open', 'tick']);
    expect(calls.starts).toBe(3);
  });

  it('is silent when sounds are off', async () => {
    setSoundEnabled(false);
    playSound('tick');
    await settle();
    expect(heard).toEqual([]);
    expect(calls.contexts).toBe(0);
  });

  it('is silent in a hidden tab', async () => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    playSound('tick');
    await settle();
    expect(heard).toEqual([]);
    expect(calls.contexts).toBe(0);
  });

  it('still reports the event where there is no AudioContext, and plays nothing', async () => {
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
    expect(() => playSound('tick')).not.toThrow();
    await settle();
    expect(heard).toEqual(['tick']);
    expect(calls.starts).toBe(0);
  });

  it('swallows a failed fetch and tries again on the next play', async () => {
    const fail = vi.fn<() => Promise<never>>(async () => {
      throw new Error('offline');
    });
    vi.stubGlobal('fetch', fail);
    expect(() => playSound('tick')).not.toThrow();
    await settle();
    expect(calls.starts).toBe(0);
    vi.stubGlobal('fetch', vi.fn(fakeFetch));
    vi.setSystemTime(Date.now() + 100);
    playSound('tick');
    await settle();
    expect(calls.starts).toBe(1);
  });

  it('swallows a failed decode and a throwing AudioContext', async () => {
    FakeAudioContext.prototype.decodeAudioData = async () => {
      throw new Error('bad data');
    };
    expect(() => playSound('tick')).not.toThrow();
    await settle();
    expect(calls.starts).toBe(0);
    FakeAudioContext.prototype.decodeAudioData = async () => {
      calls.decodes += 1;
      return { duration: 0.1 };
    };
    class Broken {
      constructor() {
        throw new Error('no audio');
      }
    }
    resetSoundEngine();
    (window as unknown as { AudioContext?: unknown }).AudioContext = Broken;
    vi.setSystemTime(Date.now() + 100);
    expect(() => playSound('open')).not.toThrow();
    await settle();
  });
});

describe('primeSounds', () => {
  it('fetches and decodes every sound once, and a second call does nothing', async () => {
    await primeSounds();
    await primeSounds();
    expect(calls.decodes).toBe(SOUND_NAMES.length);
    expect(calls.fetches).toHaveLength(SOUND_NAMES.length);
    // a later play reuses the decoded buffer
    playSound('tick');
    await settle();
    expect(calls.decodes).toBe(SOUND_NAMES.length);
    expect(calls.starts).toBe(1);
  });
});

describe('on the server', () => {
  it('does nothing without a window', async () => {
    const win = globalThis.window;
    vi.stubGlobal('window', undefined);
    try {
      expect(() => playSound('tick')).not.toThrow();
      await expect(primeSounds()).resolves.toBeUndefined();
    } finally {
      vi.stubGlobal('window', win);
    }
    expect(heard).toEqual([]);
    expect(calls.contexts).toBe(0);
  });
});

describe('the Sounds setting', () => {
  it('is on by default', () => {
    expect(soundEnabled()).toBe(true);
  });

  it('persists in localStorage under ui-sounds', () => {
    setSoundEnabled(false);
    expect(localStorage.getItem('ui-sounds')).toBe('off');
    expect(soundEnabled()).toBe(false);
    setSoundEnabled(true);
    expect(localStorage.getItem('ui-sounds')).toBe('on');
    expect(soundEnabled()).toBe(true);
  });

  it('reads a stored off, and ignores junk', () => {
    localStorage.setItem('ui-sounds', 'off');
    expect(soundEnabled()).toBe(false);
    localStorage.setItem('ui-sounds', 'maybe');
    expect(soundEnabled()).toBe(true);
  });

  it('plays toggle-on as confirmation when turned on, and nothing when turned off', async () => {
    setSoundEnabled(false);
    expect(heard).toEqual([]);
    setSoundEnabled(true);
    await settle();
    expect(heard).toEqual(['toggle-on']);
  });

  it('still works for the page when storage is blocked', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      expect(soundEnabled()).toBe(true);
      expect(() => setSoundEnabled(false)).not.toThrow();
      expect(soundEnabled()).toBe(false);
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });
});
