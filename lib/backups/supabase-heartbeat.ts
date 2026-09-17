import 'server-only';

import { createSupabaseServiceClient } from '@/lib/supabase/service';

/**
 * 每日備份前先做一次最小讀取。它同時驗證資料庫可達性，並提供
 * Free Plan 專案持續有活動的訊號；不讀取或回傳任何實際資料。
 */
export async function pingSupabase() {
  const database = createSupabaseServiceClient();
  const { error } = await database.from('film_projects').select('id').limit(1);
  if (error) throw new Error(`Supabase heartbeat 失敗：${error.message}`);
  return { checkedAt: new Date().toISOString(), ok: true };
}
