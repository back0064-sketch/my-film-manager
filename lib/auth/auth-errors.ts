export type AuthErrorLike = {
  status?: number;
  code?: string;
  message?: string;
};

export type AuthErrorKind = 'invalid_credentials' | 'email_not_confirmed' | 'rate_limited' | 'service_unavailable' | 'unknown';

export function classifyAuthError(error: AuthErrorLike): { kind: AuthErrorKind; status: number; message: string } {
  const text = `${error.code ?? ''} ${error.message ?? ''}`.toLocaleLowerCase('en-US');
  if (text.includes('email not confirmed') || text.includes('email_not_confirmed')) {
    return { kind: 'email_not_confirmed', status: 403, message: '此 Email 尚未完成驗證，請先到信箱點擊驗證連結。' };
  }
  if (error.status === 429 || text.includes('rate limit') || text.includes('too many')) {
    return { kind: 'rate_limited', status: 429, message: '嘗試次數過多，請稍後再試。' };
  }
  if (error.status === 0 || (error.status !== undefined && error.status >= 500)
    || text.includes('fetch failed') || text.includes('network') || text.includes('service unavailable')
    || text.includes('project is paused') || text.includes('database error querying schema')) {
    return { kind: 'service_unavailable', status: 503, message: '驗證服務暫時無法連線，請稍後再試。' };
  }
  if (text.includes('invalid login credentials') || text.includes('invalid_credentials') || text.includes('user not found')) {
    return { kind: 'invalid_credentials', status: 401, message: 'Email 或密碼不正確，請重新確認。' };
  }
  return { kind: 'unknown', status: 401, message: '登入失敗，請檢查 Email 與密碼。' };
}
