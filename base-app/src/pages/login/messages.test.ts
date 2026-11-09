import { describe, expect, it } from 'vitest';
import { ApiError } from '~/core/api';
import {
  FALLBACK,
  OFFLINE,
  signInMessage,
  TOO_MANY,
  UNREACHABLE,
  WRONG_PASSWORD,
} from './messages';

describe('signInMessage', () => {
  it('never says which of the email and the password was wrong', () => {
    expect(signInMessage(new ApiError(401, 'invalid_credentials', 'x'), true)).toBe(WRONG_PASSWORD);
    expect(WRONG_PASSWORD).not.toMatch(/only|which|unknown|no such/i);
  });

  it('names the wait for a rate limit', () => {
    expect(signInMessage(new ApiError(429, 'rate_limited', 'x'), true)).toBe(TOO_MANY);
    expect(TOO_MANY).toContain('15 minutes');
  });

  it('blames the connection, not the password, when nothing answered', () => {
    const none = new ApiError(0, 'network', 'The API could not be reached.');
    expect(signInMessage(none, true)).toBe(UNREACHABLE);
    expect(signInMessage(none, false)).toBe(OFFLINE);
  });

  it("shows the server's own words for any other failure", () => {
    expect(signInMessage(new ApiError(500, 'internal_error', 'Database is down.'), true)).toBe(
      'Database is down.',
    );
  });

  it('falls back to a plain sentence for something that is not an API error', () => {
    expect(signInMessage(new Error('boom'), true)).toBe(FALLBACK);
  });
});
