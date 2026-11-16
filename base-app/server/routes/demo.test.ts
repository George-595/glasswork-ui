import { describe, expect, it } from 'vitest';
import { DEMO_LOGIN } from '../config/env.ts';
import { HttpError } from '../infra/http/errors.ts';
import { createDemoGate } from './demo.ts';

const demoUser = {
  id: DEMO_LOGIN.id,
  name: 'Demo visitor',
  email: DEMO_LOGIN.email,
  role: 'admin' as const,
};
const realAdmin = { ...demoUser, id: 'usr_admin', email: 'owner@example.com' };

describe('the demo gate', () => {
  it('lets the demo login read and sign out, and refuses every change', async () => {
    const gate = createDemoGate(true);
    await expect(
      gate({ principal: demoUser, method: 'GET', path: '/api/users' }),
    ).resolves.toBeUndefined();
    await expect(
      gate({ principal: demoUser, method: 'POST', path: '/api/auth/logout' }),
    ).resolves.toBeUndefined();
    for (const [method, path] of [
      ['POST', '/api/users/invite'],
      ['PATCH', '/api/account'],
      ['POST', '/api/account/password'],
      ['DELETE', '/api/account/sessions/x'],
      ['PUT', '/api/account/avatar'],
    ] as const) {
      const refused = await gate({ principal: demoUser, method, path }).catch((e: unknown) => e);
      expect(refused).toBeInstanceOf(HttpError);
      expect((refused as HttpError).status).toBe(403);
    }
  });

  it('turns the assistant off for the demo login, kindly (no model spend from a public page)', async () => {
    const gate = createDemoGate(true);
    for (const path of ['/api/agent/stream', '/api/llm/complete', '/api/llm/stream']) {
      const refused = await gate({ principal: demoUser, method: 'POST', path }).catch(
        (e: unknown) => e,
      );
      expect((refused as HttpError).status).toBe(503);
      expect((refused as HttpError).code).toBe('ai_disabled');
      expect((refused as HttpError).message).toMatch(/aren't enabled on this demo/);
    }
  });

  it('leaves every other account alone, and does nothing when DEMO_MODE is off', async () => {
    await expect(
      createDemoGate(true)({ principal: realAdmin, method: 'POST', path: '/api/users/invite' }),
    ).resolves.toBeUndefined();
    await expect(
      createDemoGate(false)({ principal: demoUser, method: 'POST', path: '/api/users/invite' }),
    ).resolves.toBeUndefined();
    await expect(
      createDemoGate(true)({ principal: null, method: 'POST', path: '/api/auth/login' }),
    ).resolves.toBeUndefined();
  });
});
