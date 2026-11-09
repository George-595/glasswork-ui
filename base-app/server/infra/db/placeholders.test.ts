import { describe, expect, it } from 'vitest';
import { toPostgresPlaceholders } from './placeholders.ts';

describe('toPostgresPlaceholders', () => {
  it('numbers plain placeholders in order', () => {
    expect(toPostgresPlaceholders('SELECT * FROM t WHERE a = ? AND b = ?')).toBe(
      'SELECT * FROM t WHERE a = $1 AND b = $2',
    );
  });

  it('leaves a ? inside a single-quoted string alone', () => {
    expect(toPostgresPlaceholders("SELECT '?' , ?")).toBe("SELECT '?' , $1");
  });

  it('handles doubled quotes as escapes inside strings', () => {
    expect(toPostgresPlaceholders("SELECT 'it''s ?' , ?")).toBe("SELECT 'it''s ?' , $1");
  });

  it('leaves a ? inside a double-quoted identifier alone', () => {
    expect(toPostgresPlaceholders('SELECT "a?b" FROM t WHERE x = ?')).toBe(
      'SELECT "a?b" FROM t WHERE x = $1',
    );
  });

  it('leaves a ? inside a line comment alone', () => {
    expect(toPostgresPlaceholders('SELECT ? -- why?\nFROM t WHERE y = ?')).toBe(
      'SELECT $1 -- why?\nFROM t WHERE y = $2',
    );
  });

  it('leaves a ? inside a block comment alone', () => {
    expect(toPostgresPlaceholders('SELECT /* ? */ ?')).toBe('SELECT /* ? */ $1');
  });

  it('returns the SQL unchanged when there are no placeholders', () => {
    expect(toPostgresPlaceholders('SELECT 1')).toBe('SELECT 1');
  });
});
