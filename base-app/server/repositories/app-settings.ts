import { isUniqueViolation } from '../infra/db/index.ts';
import type { DbExecutor } from '../infra/db/types.ts';

/* SQL for server-side settings: one row per key, the value JSON text. Which keys exist and
   what their values mean is the settings service's. */
export interface SettingRecord {
  key: string;
  /** JSON text, as stored. */
  value: string;
  updatedAt: string;
  updatedByUserId: string | null;
}

type SettingRow = {
  setting_key: string;
  value: string;
  updated_at: string;
  updated_by_user_id: string | null;
};

const toSetting = (r: SettingRow): SettingRecord => ({
  key: r.setting_key,
  value: r.value,
  updatedAt: r.updated_at,
  updatedByUserId: r.updated_by_user_id,
});

const COLUMNS = 'setting_key, value, updated_at, updated_by_user_id';

export function appSettingsRepository(db: DbExecutor) {
  return {
    async get(key: string): Promise<SettingRecord | null> {
      const [row] = await db.query<SettingRow>(
        `SELECT ${COLUMNS} FROM app_settings WHERE setting_key = ?`,
        [key],
      );
      return row ? toSetting(row) : null;
    },
    async list(): Promise<SettingRecord[]> {
      const rows = await db.query<SettingRow>(
        `SELECT ${COLUMNS} FROM app_settings ORDER BY setting_key`,
      );
      return rows.map(toSetting);
    },
    /** Writes a value. UPDATE first, INSERT when nothing matched (portable upsert); a concurrent
        first write that wins the INSERT makes this one fall back to UPDATE. */
    async set(key: string, value: string, at: Date, byUserId: string | null): Promise<void> {
      const update = () =>
        db.execute(
          'UPDATE app_settings SET value = ?, updated_at = ?, updated_by_user_id = ? WHERE setting_key = ?',
          [value, at, byUserId, key],
        );
      if ((await update()).rowsAffected > 0) return;
      try {
        await db.execute(
          'INSERT INTO app_settings (setting_key, value, updated_at, updated_by_user_id) VALUES (?, ?, ?, ?)',
          [key, value, at, byUserId],
        );
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        await update();
      }
    },
    async delete(key: string): Promise<boolean> {
      const r = await db.execute('DELETE FROM app_settings WHERE setting_key = ?', [key]);
      return r.rowsAffected > 0;
    },
  };
}
export type AppSettingsRepository = ReturnType<typeof appSettingsRepository>;
