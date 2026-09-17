import 'server-only';

import { User } from '@supabase/supabase-js';
import { PublicApiError } from '@/lib/middlewares/api-handler';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new PublicApiError('請先登入', 401);
  const supabase = await createServerSupabaseClient();
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
    throw new PublicApiError('請先完成 MFA 驗證', 403);
  }
  return user;
}
