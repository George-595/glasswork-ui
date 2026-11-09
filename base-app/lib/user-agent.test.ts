import { describe, expect, it } from 'vitest';
import { describeUserAgent } from './user-agent.ts';

const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

describe('describeUserAgent', () => {
  it('names the browser and the system', () => {
    expect(describeUserAgent(CHROME_MAC).label).toBe('Chrome on macOS');
    expect(
      describeUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      ).label,
    ).toBe('Safari on iOS');
  });
  it('tests Edge before Chrome and Chrome before Safari', () => {
    expect(describeUserAgent(`${CHROME_MAC} Edg/126.0.0.0`).browser).toBe('Edge');
    expect(describeUserAgent(CHROME_MAC).browser).toBe('Chrome');
    // headless Chrome is still Chrome, not the Safari token at the end
    expect(
      describeUserAgent(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0.0.0 Safari/537.36',
      ).label,
    ).toBe('Chrome on Linux');
  });
  it('never throws on rubbish', () => {
    expect(describeUserAgent(undefined).label).toBe('Unknown device');
    expect(describeUserAgent('').label).toBe('Unknown device');
    expect(describeUserAgent('Linux box').label).toBe('Unknown browser on Linux');
  });
});
