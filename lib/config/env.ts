import 'server-only';

function required(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY') {
  const value = process.env[name]?.trim().replace(/^['"]|['"]$/g, '');
  if (!value) throw new Error(`缺少環境變數 ${name}`);
  return value;
}

export function getSupabaseConfig() {
  return {
    url: required('NEXT_PUBLIC_SUPABASE_URL'),
    anonKey: required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  };
}
