import { describe, expect, it } from 'vitest';
import { validate } from './schema.ts';

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 5 },
    days: { type: 'integer', enum: [7, 30] },
    ratio: { type: 'number', minimum: 0, maximum: 1 },
    on: { type: 'boolean' },
    day: { type: 'string', format: 'date' },
    tags: { type: 'array', items: { type: 'string', enum: ['a', 'b'] }, maxItems: 2 },
    spec: { type: 'object' },
    nested: {
      type: 'object',
      properties: { id: { type: 'string', pattern: '^[a-z]+$' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  required: ['title'],
  additionalProperties: false,
} as const;

describe('validate', () => {
  it('passes a good value through, typed', () => {
    const r = validate(SCHEMA, {
      title: 'Hi',
      days: 7,
      ratio: 0.5,
      on: true,
      day: '2026-10-15',
      tags: ['a'],
      spec: { anything: [1, 2] },
      nested: { id: 'abc' },
    });
    expect(r).toMatchObject({ ok: true, value: { days: 7, spec: { anything: [1, 2] } } });
    // the value is typed from the schema
    const days: 7 | 30 | undefined = r.ok ? r.value.days : undefined;
    expect(days).toBe(7);
  });

  it('names the first wrong field by its path', () => {
    const cases: [unknown, string][] = [
      [{}, 'title: is required'],
      [{ title: '' }, 'title: must not be empty'],
      [{ title: 'toolong' }, 'title: must be at most 5 characters'],
      [{ title: 'x', days: 8 }, 'days: must be one of 7, 30'],
      [{ title: 'x', days: 7.5 }, 'days: must be a whole number'],
      [{ title: 'x', ratio: 2 }, 'ratio: must be at most 1'],
      [{ title: 'x', on: 'yes' }, 'on: must be true or false'],
      [{ title: 'x', day: '15/10/2026' }, 'day: must be a date, YYYY-MM-DD'],
      [{ title: 'x', tags: ['a', 'c'] }, 'tags[1]: must be one of a, b'],
      [{ title: 'x', tags: ['a', 'b', 'a'] }, 'tags: must have at most 2 items'],
      [{ title: 'x', nested: {} }, 'nested.id: is required'],
      [{ title: 'x', nested: { id: 'A1' } }, 'nested.id: is not in the expected form'],
      [{ title: 'x', nested: { id: 'a', extra: 1 } }, 'nested.extra: is not a known field'],
      [{ title: 'x', sneaky: 1 }, 'sneaky: is not a known field'],
      ['nope', 'input: must be an object'],
    ];
    for (const [value, error] of cases) {
      expect(validate(SCHEMA, value)).toEqual({ ok: false, error });
    }
  });

  it('treats null as absent for an optional field, not a required one', () => {
    expect(validate(SCHEMA, { title: 'x', days: null })).toEqual({
      ok: true,
      value: { title: 'x' },
    });
    expect(validate(SCHEMA, { title: null })).toEqual({ ok: false, error: 'title: is required' });
  });

  it('drops unknown keys when the object allows them', () => {
    const open = { type: 'object', properties: { a: { type: 'string' } } } as const;
    expect(validate(open, { a: 'x', b: 1 })).toEqual({ ok: true, value: { a: 'x' } });
  });
});
