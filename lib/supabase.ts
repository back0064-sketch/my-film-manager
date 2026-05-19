import { createClient } from '@supabase/supabase-js';

// 🧼 全自動刮除可能誤貼的前後雙引號、單引號與空白
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabaseUrl = rawUrl.trim().replace(/^["']|["']$/g, '');
const supabaseAnonKey = rawKey.trim().replace(/^["']|["']$/g, '');

// 🛡️ 終極打包防禦：如果 Vercel 打包機器猴急搶跑拿不到網址，先給它一組合法格式的假網址，防止噴出 Invalid supabaseUrl 錯誤！
const finalUrl = supabaseUrl.startsWith('http') 
  ? supabaseUrl 
  : 'https://placeholder-for-vercel-build.supabase.co';

const finalKey = supabaseAnonKey || 'placeholder-anon-key';

// 🔌 正式建立雲端連線客戶端
export const supabase = createClient(finalUrl, finalKey);