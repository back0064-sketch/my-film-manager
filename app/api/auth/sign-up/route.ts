import { NextResponse } from 'next/server';
import { readJson, apiError } from '@/lib/middlewares/api-handler';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const payload = await readJson(request);
    if (typeof payload !== 'object' || payload === null) throw new Error('註冊資料格式不正確');
    const { email, password } = payload as Record<string, unknown>;
    if (typeof email !== 'string' || !email.includes('@')) throw new Error('請輸入有效 Email');
    if (typeof password !== 'string' || password.length < 8) throw new Error('密碼至少需要 8 個字元');
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) throw new Error(error.message);
    return NextResponse.json({ needsEmailConfirmation: !data.session, email: data.user?.email });
  } catch (error) {
    return apiError(error);
  }
}
