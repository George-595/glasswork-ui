import {
  FAKE_NOW,
  getAuditLog,
  getKpis,
  getMonthlySignups,
  getRecentActivity,
  getRevenueSeries,
  getTransactions,
  getUsers,
} from '../../fixtures/index.ts';
import type { DbClient } from '../infra/db/types.ts';
import { createRepositories } from '../repositories/index.ts';
import { hashPassword } from './passwords.ts';

/* After migrations: fills EMPTY tables with the deterministic demo fixtures
   (development only, unless seedDemoData says otherwise), and makes sure the
   admin account exists. A table that already has rows is never touched.

   The admin: created when no user with ADMIN_EMAIL exists, with ADMIN_PASSWORD
   (config/env.ts supplies the fixed dev credential in development and refuses
   to start production without a real one). An existing admin with no password
   gets ADMIN_PASSWORD; an existing password is never changed. */
export interface SeedOptions {
  adminEmail: string;
  adminPassword: string;
  /** Demo users, transactions, audit log, metrics. Default: on. main.ts turns it off in production. */
  seedDemoData?: boolean;
}

export interface SeedReport {
  seeded: string[];
  admin: 'created' | 'exists' | 'password set';
}

export async function seedIfEmpty(db: DbClient, opts: SeedOptions): Promise<SeedReport> {
  const seeded: string[] = [];
  const report: SeedReport = { seeded, admin: 'exists' };

  await db.transaction(async (tx) => {
    const r = createRepositories(tx);

    if (opts.seedDemoData ?? true) {
      if ((await r.users.count()) === 0) {
        for (const u of getUsers()) await r.users.insert(u);
        seeded.push('users');
      }
      if (await r.metrics.isEmpty('transactions')) {
        for (const t of getTransactions()) await r.transactions.insert(t);
        seeded.push('transactions');
      }
      if (await r.metrics.isEmpty('audit_events')) {
        for (const e of getAuditLog()) await r.audit.insert(e);
        seeded.push('audit_events');
      }
      if (await r.metrics.isEmpty('activity')) {
        for (const a of getRecentActivity(24)) await r.activity.insert(a);
        seeded.push('activity');
      }
      if (await r.metrics.isEmpty('revenue_daily')) {
        // 180 days: the longest range (90) and the 90 before it, for the comparison line
        const { revenue, costs } = getRevenueSeries(180);
        for (const [i, point] of revenue.entries()) {
          await r.metrics.insertRevenueDay(point.date, point.value, costs[i]?.value ?? 0);
        }
        seeded.push('revenue_daily');
      }
      if (await r.metrics.isEmpty('kpis')) {
        for (const [i, k] of getKpis().entries()) await r.metrics.insertKpi(k, i);
        seeded.push('kpis');
      }
      if (await r.metrics.isEmpty('signups_monthly')) {
        for (const [i, s] of getMonthlySignups().entries()) await r.metrics.insertSignups(i, s);
        seeded.push('signups_monthly');
      }
    }

    const email = opts.adminEmail.trim().toLowerCase();
    const existing = await r.users.findCredentialsByEmail(email);
    if (!existing) {
      const at = new Date().toISOString();
      await r.users.insert(
        {
          id: 'usr_admin',
          name: 'Admin',
          email,
          role: 'admin',
          status: 'active',
          team: 'Platform',
          createdAt: at,
          lastActiveAt: at,
        },
        await hashPassword(opts.adminPassword),
      );
      report.admin = 'created';
    } else if (!existing.passwordHash) {
      await r.users.setPasswordHash(
        existing.user.id,
        await hashPassword(opts.adminPassword),
        new Date(),
      );
      report.admin = 'password set';
    }

    // The bell and the inbox have something to show on a fresh development database.
    if ((opts.seedDemoData ?? true) && (await r.metrics.isEmpty('notifications'))) {
      const admin = await r.users.findCredentialsByEmail(email);
      if (admin) {
        const anchor = Date.parse(FAKE_NOW);
        const minutes = (n: number) => new Date(anchor - n * 60_000);
        const demo = [
          {
            kind: 'security',
            title: 'New sign-in to your account',
            body: 'Chrome on macOS, from 127.0.0.1.',
            link: null,
            ago: 14,
            read: false,
          },
          {
            kind: 'team',
            title: 'Invitation sent',
            body: 'Ada invited Priya Shah (priya@example.com) as editor.',
            link: '/admin/users',
            ago: 95,
            read: false,
          },
          {
            kind: 'system',
            title: 'Welcome to the notifications network',
            body: 'New ones arrive here as they happen, without a refresh. Choose how you hear about each kind under Preferences.',
            link: '/notifications',
            ago: 26 * 60,
            read: false,
          },
          {
            kind: 'account',
            title: 'Your role changed',
            body: 'An admin changed your role from editor to admin.',
            link: null,
            ago: 3 * 24 * 60,
            read: true,
          },
          {
            kind: 'system',
            title: 'Scheduled maintenance finished',
            body: 'Everything is back to normal.',
            link: null,
            ago: 9 * 24 * 60,
            read: true,
          },
        ] as const;
        for (const [i, n] of demo.entries()) {
          await r.notifications.insert({
            id: `ntf_demo_${i + 1}`,
            userId: admin.user.id,
            kind: n.kind,
            title: n.title,
            body: n.body,
            link: n.link,
            createdAt: minutes(n.ago),
          });
          if (n.read)
            await r.notifications.markRead(admin.user.id, `ntf_demo_${i + 1}`, minutes(n.ago - 5));
        }
        seeded.push('notifications');
      }
    }
  });
  return report;
}
