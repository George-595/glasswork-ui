import { describe, expect, it } from 'vitest';
import { DbConfigError } from './errors.ts';
import { parseDatabaseUrl, redactUrl } from './url.ts';

describe('parseDatabaseUrl', () => {
  it('reads the in-memory sqlite form', () => {
    expect(parseDatabaseUrl('sqlite::memory:')).toEqual({ driver: 'sqlite', path: ':memory:' });
  });

  it('reads a relative sqlite path', () => {
    expect(parseDatabaseUrl('sqlite:./rel.db')).toEqual({ driver: 'sqlite', path: './rel.db' });
  });

  it('reads an absolute sqlite path from the triple-slash form', () => {
    expect(parseDatabaseUrl('sqlite:///abs.db')).toEqual({ driver: 'sqlite', path: '/abs.db' });
  });

  it('rejects an sqlite URL with no path', () => {
    expect(() => parseDatabaseUrl('sqlite:')).toThrow(DbConfigError);
  });

  it('keeps postgres:// and postgresql:// URLs as the connection string', () => {
    expect(parseDatabaseUrl('postgres://u:p@h:5432/db')).toEqual({
      driver: 'postgres',
      url: 'postgres://u:p@h:5432/db',
    });
    expect(parseDatabaseUrl('postgresql://h/db')).toEqual({
      driver: 'postgres',
      url: 'postgresql://h/db',
    });
  });

  it('keeps mysql:// URLs as the connection string', () => {
    expect(parseDatabaseUrl('mysql://u:p@h:3306/db')).toEqual({
      driver: 'mysql',
      url: 'mysql://u:p@h:3306/db',
    });
  });

  it('rejects an unknown scheme', () => {
    expect(() => parseDatabaseUrl('mongodb://h/db')).toThrow(DbConfigError);
  });

  it('never puts the password in the error text', () => {
    let message = '';
    try {
      parseDatabaseUrl('mongodb://admin:hunter2secret@h/db');
    } catch (err) {
      message = err instanceof Error ? err.message : '';
    }
    expect(message).toContain('mongodb://');
    expect(message).not.toContain('hunter2secret');
    expect(message).toContain('***');
  });
});

describe('redactUrl', () => {
  it('replaces the password with ***', () => {
    expect(redactUrl('postgres://george:s3cret@db.example:5432/app')).toBe(
      'postgres://george:***@db.example:5432/app',
    );
  });

  it('leaves a URL without a password unchanged', () => {
    expect(redactUrl('mysql://db.example/app')).toBe('mysql://db.example/app');
  });

  it('redacts a password query parameter', () => {
    expect(redactUrl('postgres://h/db?sslmode=require&password=abc&x=1')).toBe(
      'postgres://h/db?sslmode=require&password=***&x=1',
    );
  });
});
