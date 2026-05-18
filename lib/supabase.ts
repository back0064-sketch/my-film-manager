import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('❌ 找不到 Supabase 連線鑰匙，請檢查 .env.local 檔案！');
}

// 建立並匯出雲端資料庫連線客戶端
export const supabase = createClient(supabaseUrl, supabaseAnonKey);