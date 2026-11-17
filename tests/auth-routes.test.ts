import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicApiError } from '@/lib/middlewares/api-handler';

const { auth, requireUser } = vi.hoisted(() => ({
  auth: { updateUser: vi.fn(), signOut: vi.fn(), getUser: vi.fn(), exchangeCodeForSession: vi.fn(), signInWithOAuth: vi.fn(), verifyOtp: vi.fn() },
  requireUser: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => ({ auth }) }));
vi.mock('@/lib/auth/session', () => ({ requireUser }));
import { POST } from '@/app/api/auth/password/route';
import { GET as googleCallback } from '@/app/auth/google/callback/route';
import { GET as googleStart } from '@/app/api/auth/google/route';
import { GET as confirm } from '@/app/auth/confirm/route';
import { NextRequest } from 'next/server';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('AUTH_GOOGLE_ENABLED', 'true');
  vi.stubEnv('AUTH_OWNER_ID', 'existing-owner');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://site.test');
  requireUser.mockResolvedValue({ id: 'existing-owner' });
  auth.updateUser.mockResolvedValue({ error: null });
  auth.signOut.mockResolvedValue({ error: null });
  auth.exchangeCodeForSession.mockResolvedValue({ error: null });
  auth.getUser.mockResolvedValue({ data: { user: { id: 'existing-owner' } }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

function passwordRequest(origin = 'https://site.test', password = 'test-password-123') {
  return new Request('https://site.test/api/auth/password', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
}

describe('伺服器密碼更新', () => {
  it('拒絕跨站請求及未登入請求，不呼叫密碼更新', async () => {
    expect((await POST(passwordRequest('https://evil.test'))).status).toBe(403);
    requireUser.mockRejectedValueOnce(new PublicApiError('請先登入', 401));
    expect((await POST(passwordRequest())).status).toBe(401);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it('更新後登出，回應不得快取', async () => {
    const response = await POST(passwordRequest());
    expect(await response.json()).toEqual({ updated: true, signedOut: true });
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
  it('保留明確錯誤，不將更新成功但登出失敗說成密碼失敗', async () => {
    auth.updateUser.mockResolvedValueOnce({ error: { code: 'same_password' } });
    const failed = await POST(passwordRequest());
    expect((await failed.json()).error).toContain('不能與原密碼相同');
    auth.signOut.mockResolvedValueOnce({ error: { code: 'network_error' } });
    expect(await (await POST(passwordRequest())).json()).toEqual({ updated: true, signedOut: false });
  });
});

describe('Google 登入既有帳號保護', () => {
  it('沒有指定既有 owner 時，不啟動 Google 登入', async () => {
    vi.stubEnv('AUTH_OWNER_ID', '');
    expect((await googleStart(new Request('https://site.test/api/auth/google'))).headers.get('location')).toBe('https://site.test/auth/login-error');
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
  });
  it('不同 UUID 立即登出，不把新帳號接到舊專案', async () => {
    auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'new-account' } }, error: null });
    const response = await googleCallback(new Request('https://site.test/auth/google/callback?code=test-code'));
    expect(response.headers.get('location')).toBe('https://site.test/auth/login-error');
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
  it('既有 UUID 才能進入首頁，忽略外部 next 參數', async () => {
    const response = await googleCallback(new Request('https://site.test/auth/google/callback?code=test-code&next=https://evil.test'));
    expect(response.headers.get('location')).toBe('https://site.test/');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('重設回呼拒絕反斜線重新導向與非 recovery token', async () => {
    auth.verifyOtp.mockResolvedValueOnce({ error: null });
    const response = await confirm(new NextRequest('https://site.test/auth/confirm?token_hash=test&type=recovery&next=%2F%5Cevil.test'));
    expect(response.headers.get('location')).toBe('https://site.test/auth/reset');
    auth.verifyOtp.mockClear();
    await confirm(new NextRequest('https://site.test/auth/confirm?token_hash=test&type=signup'));
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });
});
