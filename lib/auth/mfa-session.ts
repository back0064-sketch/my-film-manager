import 'server-only';

import { PublicApiError } from '@/lib/middlewares/api-handler';
import { getCurrentUser } from '@/lib/auth/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function createAuthenticatedMfaClient() {
  if (!(await getCurrentUser())) throw new PublicApiError('請先登入', 401);
  return createServerSupabaseClient();
}

export async function requireAal2MfaClient() {
  const supabase = await createAuthenticatedMfaClient();
  const { data: aal, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !aal) {
    console.error('MFA assurance check failed', error);
    throw new PublicApiError('無法確認帳號安全狀態，請稍後再試', 503);
  }
  if (aal.currentLevel !== 'aal2') throw new PublicApiError('請先完成 MFA 驗證', 403);
  return supabase;
}
