import { describe, expect, it } from 'vitest';
import { sum } from '../lib/numbers.ts';
import { getRecentActivity } from './activity.ts';
import { getAuditLog } from './audit.ts';
import { FAKE_NOW } from './constants.ts';
import { getCategoryBreakdown, getKpis, getMonthlySignups, getRevenueSeries } from './metrics.ts';
import { getTransactions } from './transactions.ts';
import { getUsers } from './users.ts';

const NOW_MS = Date.parse(FAKE_NOW);

describe('fake data: determinism', () => {
  it('returns deep-equal results on repeated calls', () => {
    expect(getUsers()).toEqual(getUsers());
    expect(getTransactions()).toEqual(getTransactions());
    expect(getRevenueSeries()).toEqual(getRevenueSeries());
    expect(getKpis()).toEqual(getKpis());
    expect(getAuditLog()).toEqual(getAuditLog());
    expect(getRecentActivity()).toEqual(getRecentActivity());
  });
});

describe('fake data: users', () => {
  it('has the requested count, unique ids and example.com emails', () => {
    const users = getUsers();
    expect(users).toHaveLength(48);
    expect(new Set(users.map((u) => u.id)).size).toBe(48);
    expect(new Set(users.map((u) => u.email)).size).toBe(48);
    for (const u of users) expect(u.email.endsWith('@example.com')).toBe(true);
  });

  it('has no dates after FAKE_NOW', () => {
    for (const u of getUsers()) {
      expect(Date.parse(u.createdAt)).toBeLessThanOrEqual(NOW_MS);
      expect(Date.parse(u.lastActiveAt)).toBeLessThanOrEqual(NOW_MS);
    }
  });
});

describe('fake data: transactions', () => {
  const txns = getTransactions();

  it('has 240 transactions, unique ids, integer pence and sorted newest first', () => {
    expect(txns).toHaveLength(240);
    expect(new Set(txns.map((t) => t.id)).size).toBe(240);
    for (const t of txns) expect(Number.isInteger(t.amountMinor)).toBe(true);
    for (let i = 1; i < txns.length; i++) {
      expect(Date.parse(txns[i - 1]?.date ?? '')).toBeGreaterThanOrEqual(
        Date.parse(txns[i]?.date ?? ''),
      );
    }
  });

  it('keeps every date within the last 180 days up to FAKE_NOW', () => {
    const windowStart = NOW_MS - 180 * 86_400_000;
    for (const t of txns) {
      const ms = Date.parse(t.date);
      expect(ms).toBeLessThanOrEqual(NOW_MS);
      expect(ms).toBeGreaterThanOrEqual(windowStart);
    }
  });

  it('category breakdown totals the transaction sum', () => {
    const total = sum(getCategoryBreakdown().map((r) => r.value));
    expect(total).toBe(sum(txns.map((t) => t.amountMinor)));
  });
});

describe('fake data: metrics', () => {
  it('revenue and costs have 90 daily points ending on FAKE_NOW, as integer pence', () => {
    const { revenue, costs } = getRevenueSeries();
    expect(revenue).toHaveLength(90);
    expect(costs).toHaveLength(90);
    expect(revenue.at(-1)?.date).toBe('2026-10-01');
    for (const p of [...revenue, ...costs]) {
      expect(Number.isInteger(p.value)).toBe(true);
      expect(Date.parse(p.date)).toBeLessThanOrEqual(NOW_MS);
    }
  });

  it('returns four KPIs in the documented order with 12-point trends', () => {
    const kpis = getKpis();
    expect(kpis.map((k) => k.id)).toEqual([
      'revenue',
      'active-users',
      'conversion',
      'open-tickets',
    ]);
    for (const k of kpis) expect(k.trend).toHaveLength(12);
    const conversion = kpis.find((k) => k.id === 'conversion');
    expect(conversion?.value).toBeGreaterThan(0);
    expect(conversion?.value).toBeLessThan(1);
  });

  it('returns monthly signups as labels in the en-GB short form', () => {
    const rows = getMonthlySignups();
    expect(rows).toHaveLength(12);
    // newer locale data (CLDR 49, Node 26) writes the year as ’26
    expect(rows.at(-1)?.label).toMatch(/^Oct ’?26$/);
  });
});

describe('fake data: audit and activity', () => {
  it('audit log is newest first, with documentation IPs and example.com actors', () => {
    const log = getAuditLog();
    expect(log).toHaveLength(120);
    for (let i = 1; i < log.length; i++) {
      expect(Date.parse(log[i - 1]?.at ?? '')).toBeGreaterThanOrEqual(Date.parse(log[i]?.at ?? ''));
    }
    for (const e of log) {
      expect(/^(192\.0\.2\.|198\.51\.100\.)/.test(e.ip)).toBe(true);
      expect(e.actor.endsWith('@example.com')).toBe(true);
    }
  });

  it('recent activity returns eight items no later than FAKE_NOW', () => {
    const items = getRecentActivity();
    expect(items).toHaveLength(8);
    for (const item of items) expect(Date.parse(item.at)).toBeLessThanOrEqual(NOW_MS);
  });
});
