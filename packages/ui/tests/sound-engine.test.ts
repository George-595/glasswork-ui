// @vitest-environment jsdom
/* The sound engine and the Sounds setting: one AudioContext, every buffer decoded once, a 60 ms
   throttle per sound, silence when off / hidden / server-side / without Web Audio, every error
   swallowed, and a `ui:sound` event whenever a sound would play. A fake AudioContext and a fake
   fetch stand in for the browser; no audio is made. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ATTENTION_SOUNDS,
  SOUND_NAMES,
  setAttentionSoundEnabled,
  setSoundEnabled,
  setSoundVolume,
  soundArmed,
  soundEnabled,
} from '../src/sound';
import {
  playSound,
  primeSounds,
  repeatSound,
  resetSoundEngine,
  subscribeSoundArmed,
} from '../src/sound/engine';
import { resetDeviceSoundStore, resetSoundStore } from '../src/sound/store';

// a sound whose file is missing has no URL: a test turns that on for the chime
const missing = vi.hoisted(() => ({ chime: false }));
vi.mock('../src/sound/sounds', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../src/sound/sounds')>();
  const urls = { ...orig.SOUND_URLS };
  Object.defineProperty(urls, 'chime', {
    get: () => (missing.chime ? '' : orig.SOUND_URLS.chime),
    enumerable: true,
  });
  return { ...orig, SOUND_URLS: urls };
});

const calls = {
  contexts: 0,
  decodes: 0,
  starts: 0,
  resumes: 0,
  fetches: [] as string[],
  gains: [] as { gain: { value: number } }[],
};
let suspended = false;

class FakeAudioContext {
  state = 'running';
  destination = {};
  constructor() {
    calls.contexts += 1;
    if (suspended) this.state = 'suspended';
  }
  createGain() {
    const g = { gain: { value: 0 }, connect() {} };
    calls.gains.push(g);
    return g;
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
  resetDeviceSoundStore();
  resetSoundEngine();
  calls.contexts = calls.decodes = calls.starts = calls.resumes = 0;
  calls.fetches = [];
  calls.gains = [];
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

describe('attention sounds (chime, alarm)', () => {
  it('are off by default: an ordinary Sounds setting never plays them', async () => {
    expect(soundEnabled()).toBe(true);
    playSound('chime');
    playSound('alarm');
    await settle();
    expect(heard).toEqual([]);
    expect(calls.contexts).toBe(0);
  });

  it('follow their own switch, not the interface one', async () => {
    setAttentionSoundEnabled(true);
    await settle();
    heard.length = 0;
    setSoundEnabled(false); // interface sounds off
    vi.setSystemTime(Date.now() + 100);
    playSound('chime');
    playSound('tick');
    await settle();
    expect(heard).toEqual(['chime']);
    setAttentionSoundEnabled(false);
    vi.setSystemTime(Date.now() + 100);
    heard.length = 0;
    playSound('alarm');
    await settle();
    expect(heard).toEqual([]);
  });

  it('turning them on plays one chime so the person hears the choice', async () => {
    setAttentionSoundEnabled(true);
    await settle();
    expect(heard).toEqual(['chime']);
  });

  it('say nothing in a hidden tab', async () => {
    setAttentionSoundEnabled(true);
    await settle();
    heard.length = 0;
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    vi.setSystemTime(Date.now() + 100);
    playSound('alarm');
    await settle();
    expect(heard).toEqual([]);
  });

  it('are primed only once the switch is on', async () => {
    await primeSounds();
    expect(calls.decodes).toBe(SOUND_NAMES.length);
    setAttentionSoundEnabled(true);
    await settle();
    await primeSounds();
    expect(calls.decodes).toBe(SOUND_NAMES.length + ATTENTION_SOUNDS.length); // all 13
    expect(calls.fetches.every(Boolean)).toBe(true);
  });
});

describe('volume', () => {
  it('scales by the device level and by the sound own volume', async () => {
    playSound('tick');
    await settle();
    const master = calls.gains[0];
    expect(master?.gain.value).toBe(1);
    setSoundVolume(0.5);
    vi.setSystemTime(Date.now() + 100);
    playSound('open', { volume: 0.4 });
    await settle();
    expect(master?.gain.value).toBe(0.5); // the device level
    expect(calls.gains.at(-1)?.gain.value).toBe(0.4); // the sound's own
  });

  it('keeps the level between 0 and 1', async () => {
    setSoundVolume(7);
    playSound('tick');
    await settle();
    expect(calls.gains[0]?.gain.value).toBe(1);
    setSoundVolume(-3);
    vi.setSystemTime(Date.now() + 100);
    playSound('open');
    await settle();
    expect(calls.gains[0]?.gain.value).toBe(0);
  });
});

describe('repeatSound', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setAttentionSoundEnabled(true);
    heard.length = 0;
  });

  it('plays at once, then every gap, then slower after a while, and stops when told', () => {
    const stop = repeatSound('alarm', { everyMs: 4000, slowAfterMs: 20_000, slowEveryMs: 30_000 });
    expect(heard).toEqual(['alarm']);
    vi.advanceTimersByTime(4000);
    expect(heard).toHaveLength(2);
    vi.advanceTimersByTime(16_000); // 20 s in: five plays so far (0, 4, 8, 12, 16) and the one at 20
    expect(heard).toHaveLength(6);
    vi.advanceTimersByTime(29_000);
    expect(heard).toHaveLength(6); // now every 30 s
    vi.advanceTimersByTime(1000);
    expect(heard).toHaveLength(7);
    stop();
    vi.advanceTimersByTime(120_000);
    expect(heard).toHaveLength(7);
  });

  it('stop() before the first gap ends it for good, and a second stop is harmless', () => {
    const stop = repeatSound('alarm', { everyMs: 1000 });
    stop();
    stop();
    vi.advanceTimersByTime(10_000);
    expect(heard).toEqual(['alarm']);
  });

  it('skips a play while the switch is off and carries on when it is back on', () => {
    repeatSound('alarm', { everyMs: 1000 });
    setAttentionSoundEnabled(false);
    vi.advanceTimersByTime(3000);
    expect(heard.filter((n) => n === 'alarm')).toHaveLength(1);
    setAttentionSoundEnabled(true);
    heard.length = 0;
    vi.advanceTimersByTime(1000);
    expect(heard).toContain('alarm');
  });
});

describe('soundArmed', () => {
  it('is false until a gesture has unlocked audio, then true and announced', async () => {
    suspended = true;
    let told = 0;
    const off = subscribeSoundArmed(() => {
      told += 1;
    });
    expect(soundArmed()).toBe(false);
    window.dispatchEvent(new Event('pointerup'));
    await settle();
    expect(soundArmed()).toBe(true);
    expect(told).toBe(1);
    off();
  });

  it('is not armed by a pointerdown, which on touch is no activation for audio', async () => {
    suspended = true;
    const off = subscribeSoundArmed(() => {});
    window.dispatchEvent(new Event('pointerdown'));
    await settle();
    expect(soundArmed()).toBe(false);
    off();
  });

  it('stays false where there is no Web Audio', async () => {
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
    const off = subscribeSoundArmed(() => {});
    window.dispatchEvent(new Event('click'));
    await settle();
    expect(soundArmed()).toBe(false);
    off();
  });
});

describe('a sound with no file, and the clock repeatSound runs on', () => {
  it('two plays of a sound with no URL fetch nothing (never the page in its place), and still report the event', async () => {
    missing.chime = true;
    setAttentionSoundEnabled(true);
    await settle();
    heard.length = 0;
    calls.fetches = [];
    vi.setSystemTime(Date.now() + 100);
    playSound('chime');
    await settle();
    vi.setSystemTime(Date.now() + 100);
    playSound('chime');
    await settle();
    expect(calls.fetches).toEqual([]);
    expect(calls.starts).toBe(0);
    expect(heard).toEqual(['chime', 'chime']);
    missing.chime = false;
  });

  it('repeatSound follows the timers it is given, not the global ones', () => {
    vi.useFakeTimers();
    setAttentionSoundEnabled(true);
    heard.length = 0;
    const queue: { fn: () => void; ms: number; id: number }[] = [];
    const cleared: number[] = [];
    const timers = {
      setTimeout: (fn: () => void, ms: number) =>
        queue.push({ fn, ms, id: queue.length + 1 }) && queue.length,
      clearTimeout: (id: number) => void cleared.push(id),
    };
    const stop = repeatSound('alarm', { everyMs: 4000, timers });
    expect(heard).toEqual(['alarm']);
    vi.advanceTimersByTime(60_000); // the global clock moves it nowhere
    expect(queue).toHaveLength(1);
    expect(queue[0]?.ms).toBe(4000);
    stop();
    expect(cleared).toEqual([1]);
  });
});
