import 'server-only';

import { PublicApiError } from '@/lib/middlewares/api-handler';
import { getCurrentUser } from '@/lib/auth/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function createAuthenticatedMfaClient() {
  if (!(await getCurrentUser())) throw new PublicApiError('請先登入', 401);
  return createServerSupabaseClient();
}
