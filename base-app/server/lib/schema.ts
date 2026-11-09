/* A small JSON Schema: the subset an action's input needs, written once and used twice. The
   model is sent it as the tool's input schema (both providers accept plain JSON Schema), and
   `validate` checks what comes back, from the model or from a page, before an action runs.
   `Infer<S>` gives the action's `run` the matching TypeScript type, so the schema, the check
   and the type cannot drift apart.

   Supported: string (enum, minLength, maxLength, pattern, format "date"), integer and number
   (minimum, maximum, enum), boolean, array (items, minItems, maxItems), object (properties,
   required, additionalProperties: false). An object with no `properties` accepts any object
   (a nested spec checked by its own schema later). Nothing else: no $ref, oneOf or defaults,
   which providers handle unevenly. Unknown keys are refused when additionalProperties is
   false; otherwise they are dropped, so `value` holds only what the schema names. */

export type StringSchema = {
  readonly type: 'string';
  readonly description?: string;
  readonly enum?: readonly string[];
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly format?: 'date';
};
export type NumberSchema = {
  readonly type: 'integer' | 'number';
  readonly description?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly enum?: readonly number[];
};
export type BooleanSchema = { readonly type: 'boolean'; readonly description?: string };
export type ArraySchema = {
  readonly type: 'array';
  readonly description?: string;
  readonly items: Schema;
  readonly minItems?: number;
  readonly maxItems?: number;
};
export type ObjectSchema = {
  readonly type: 'object';
  readonly description?: string;
  readonly properties?: { readonly [key: string]: Schema };
  readonly required?: readonly string[];
  readonly additionalProperties?: false;
};
export type Schema = StringSchema | NumberSchema | BooleanSchema | ArraySchema | ObjectSchema;

type Simplify<T> = { [K in keyof T]: T[K] } & {};
type InferObject<S extends ObjectSchema> = S['properties'] extends {
  readonly [key: string]: Schema;
}
  ? Simplify<
      {
        -readonly [K in keyof S['properties'] & ReqKeys<S>]: Infer<S['properties'][K]>;
      } & {
        -readonly [K in Exclude<keyof S['properties'], ReqKeys<S>>]?: Infer<S['properties'][K]>;
      }
    >
  : Record<string, unknown>;
type ReqKeys<S extends ObjectSchema> = S['required'] extends readonly (infer R)[]
  ? R & string
  : never;

/** The TypeScript type a value that passed `validate(schema, …)` has. */
export type Infer<S> = S extends { readonly type: 'string'; readonly enum: readonly (infer E)[] }
  ? E
  : S extends StringSchema
    ? string
    : S extends { readonly type: 'integer' | 'number'; readonly enum: readonly (infer E)[] }
      ? E
      : S extends NumberSchema
        ? number
        : S extends BooleanSchema
          ? boolean
          : S extends { readonly type: 'array'; readonly items: infer I }
            ? Infer<I>[]
            : S extends ObjectSchema
              ? InferObject<S>
              : never;

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/* Checks `value` against `schema`. The error names the first wrong field by its path
   ("filters.status[1]: must be one of paid, pending"), short enough to hand back to a model
   so it can correct its call. */
export function validate<S extends Schema>(schema: S, value: unknown): Validation<Infer<S>> {
  const out = check(schema, value, '');
  return 'error' in out
    ? { ok: false, error: out.error }
    : { ok: true, value: out.value as Infer<S> };
}

function check(s: Schema, v: unknown, path: string): { value: unknown } | { error: string } {
  const at = path === '' ? 'input' : path;
  const fail = (msg: string) => ({ error: `${at}: ${msg}` });
  switch (s.type) {
    case 'string': {
      if (typeof v !== 'string') return fail('must be a string');
      if (s.enum && !s.enum.includes(v)) return fail(`must be one of ${s.enum.join(', ')}`);
      if (s.minLength !== undefined && [...v].length < s.minLength)
        return fail(
          s.minLength === 1 ? 'must not be empty' : `must be at least ${s.minLength} characters`,
        );
      if (s.maxLength !== undefined && [...v].length > s.maxLength)
        return fail(`must be at most ${s.maxLength} characters`);
      if (s.pattern !== undefined && !new RegExp(s.pattern).test(v))
        return fail('is not in the expected form');
      if (s.format === 'date' && (!DATE.test(v) || Number.isNaN(Date.parse(v))))
        return fail('must be a date, YYYY-MM-DD');
      return { value: v };
    }
    case 'integer':
    case 'number': {
      if (typeof v !== 'number' || !Number.isFinite(v)) return fail('must be a number');
      if (s.type === 'integer' && !Number.isInteger(v)) return fail('must be a whole number');
      if (s.enum && !s.enum.includes(v)) return fail(`must be one of ${s.enum.join(', ')}`);
      if (s.minimum !== undefined && v < s.minimum) return fail(`must be at least ${s.minimum}`);
      if (s.maximum !== undefined && v > s.maximum) return fail(`must be at most ${s.maximum}`);
      return { value: v };
    }
    case 'boolean':
      return typeof v === 'boolean' ? { value: v } : fail('must be true or false');
    case 'array': {
      if (!Array.isArray(v)) return fail('must be a list');
      if (s.minItems !== undefined && v.length < s.minItems)
        return fail(`must have at least ${s.minItems} item${s.minItems === 1 ? '' : 's'}`);
      if (s.maxItems !== undefined && v.length > s.maxItems)
        return fail(`must have at most ${s.maxItems} items`);
      const items: unknown[] = [];
      for (const [i, item] of v.entries()) {
        const r = check(s.items, item, `${path}[${i}]`);
        if ('error' in r) return r;
        items.push(r.value);
      }
      return { value: items };
    }
    case 'object': {
      if (typeof v !== 'object' || v === null || Array.isArray(v)) return fail('must be an object');
      const record = v as Record<string, unknown>;
      if (!s.properties) return { value: record };
      const out: Record<string, unknown> = {};
      for (const key of s.required ?? []) {
        if (record[key] === undefined || record[key] === null)
          return { error: `${path === '' ? key : `${path}.${key}`}: is required` };
      }
      for (const [key, item] of Object.entries(record)) {
        const prop = s.properties[key];
        const sub = path === '' ? key : `${path}.${key}`;
        if (!prop) {
          if (s.additionalProperties === false) return { error: `${sub}: is not a known field` };
          continue;
        }
        // a model often sends null for "not given"; an optional field treats it as absent
        if (item === null && !(s.required ?? []).includes(key)) continue;
        const r = check(prop, item, sub);
        if ('error' in r) return r;
        out[key] = r.value;
      }
      return { value: out };
    }
  }
}
