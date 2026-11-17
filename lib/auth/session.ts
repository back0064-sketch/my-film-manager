import 'server-only';

import { User } from '@supabase/supabase-js';
import { PublicApiError } from '@/lib/middlewares/api-handler';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isAllowedOwner } from '@/lib/auth/login-config';

export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user && isAllowedOwner(user.id) ? user : null;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new PublicApiError('請先登入', 401);
  const supabase = await createServerSupabaseClient();
  const { data: aal, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !aal) {
    console.error('MFA assurance check failed', error);
    throw new PublicApiError('無法確認帳號安全狀態，請稍後再試', 503);
  }
  if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
    throw new PublicApiError('請先完成 MFA 驗證', 403);
  }
  return user;
}
