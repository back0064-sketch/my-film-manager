import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// 💡 夥伴貼心優化：如果編譯期找不到鑰匙，先給它預設字串，防止 Vercel 打包機器鬧脾氣
// 網頁真正執行時，會自動換上你剛剛在 Vercel 後台配好的真實鑰匙！
export const supabase = createClient(
  supabaseUrl || 'https://placeholder-for-vercel-build.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);