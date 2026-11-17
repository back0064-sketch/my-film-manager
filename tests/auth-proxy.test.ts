import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser } }) }));
import { proxy } from '@/proxy';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://testproject.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-key');
});
afterEach(() => vi.unstubAllEnvs());

it('回呼不刷新舊 session，避免與 PKCE 交換互相覆寫', async () => {
  await proxy(new NextRequest('https://site.test/auth/google/callback?code=test'));
  await proxy(new NextRequest('https://site.test/auth/confirm?code=test'));
  expect(getUser).not.toHaveBeenCalled();
});

it('清除本專案 session 時保留 PKCE verifier、其他專案與網站設定', async () => {
  getUser.mockResolvedValue({ error: { code: 'refresh_token_not_found' } });
  const request = new NextRequest('https://site.test/api/auth/session', { headers: { cookie: 'sb-testproject-auth-token.0=old; sb-testproject-auth-token-code-verifier=keep; sb-other-auth-token=other; theme=dark' } });
  const response = await proxy(request);
  expect(response.cookies.get('sb-testproject-auth-token.0')?.maxAge).toBe(0);
  expect(response.cookies.has('sb-testproject-auth-token-code-verifier')).toBe(false);
  expect(request.cookies.get('sb-testproject-auth-token-code-verifier')?.value).toBe('keep');
  expect(request.cookies.get('sb-other-auth-token')?.value).toBe('other');
  expect(request.cookies.get('theme')?.value).toBe('dark');
});
