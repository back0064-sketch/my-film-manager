import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getServerSupabaseConfig, getSupabaseConfig } from '@/lib/config/env';

/**
 * 建立只在伺服器端使用的 Supabase service-role client。
 * 絕對不要從 client component 或 NEXT_PUBLIC_ 變數匯入這個模組。
 */
export function createSupabaseServiceClient(): SupabaseClient {
  const { url } = getSupabaseConfig();
  const { supabaseSecretKey } = getServerSupabaseConfig();
  return createClient(url, supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
