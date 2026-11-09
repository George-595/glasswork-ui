import type { DbDriver } from '../types.ts';

/* A versioned schema change. `id` sorts in the order migrations apply
   ("001_core", "002_auth"…) and is recorded in schema_migrations once applied.
   `up` returns the statements for a driver: write portable SQL (VARCHAR with a
   length for keys, INTEGER, DOUBLE PRECISION, TEXT) and branch on the driver
   only where the dialects really differ. Never edit a migration once it has
   shipped: add a new one. */
export interface Migration {
  id: string;
  up: (driver: DbDriver) => readonly string[];
}
