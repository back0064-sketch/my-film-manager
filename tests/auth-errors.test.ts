import { describe, expect, it } from 'vitest';
import { classifyAuthError, isInvalidRefreshTokenError } from '@/lib/auth/auth-errors';

describe('登入錯誤分類', () => {
  it('區分密碼錯誤與未驗證信箱', () => {
    expect(classifyAuthError({ message: 'Invalid login credentials' })).toMatchObject({ kind: 'invalid_credentials', status: 401 });
    expect(classifyAuthError({ message: 'Email not confirmed' })).toMatchObject({ kind: 'email_not_confirmed', status: 403 });
  });

  it('將頻率限制與服務中斷轉成可行動的狀態碼', () => {
    expect(classifyAuthError({ status: 429, message: 'rate limit exceeded' }).status).toBe(429);
    expect(classifyAuthError({ status: 503, message: 'upstream unavailable' }).status).toBe(503);
  });

  it('只把失效 refresh token 判定為可清除的 session', () => {
    expect(isInvalidRefreshTokenError({ code: 'refresh_token_not_found' })).toBe(true);
    expect(isInvalidRefreshTokenError({ message: 'Invalid Refresh Token: Refresh Token Not Found' })).toBe(true);
    expect(isInvalidRefreshTokenError({ message: 'Invalid login credentials' })).toBe(false);
    expect(isInvalidRefreshTokenError({ message: 'Network request failed' })).toBe(false);
  });
});
