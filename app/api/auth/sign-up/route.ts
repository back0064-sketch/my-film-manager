import { NextResponse } from 'next/server';
import { readJson, apiError, PublicApiError } from '@/lib/middlewares/api-handler';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const payload = await readJson(request, 10_000);
    if (typeof payload !== 'object' || payload === null) throw new PublicApiError('註冊資料格式不正確');
    const { email, password } = payload as Record<string, unknown>;
    if (typeof email !== 'string' || email.length > 254 || !email.includes('@')) throw new PublicApiError('請輸入有效 Email');
    if (typeof password !== 'string' || password.length < 8 || password.length > 1024) throw new PublicApiError('密碼長度必須介於 8 到 1024 個字元');
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) throw new PublicApiError('註冊失敗，請確認資料或稍後再試');
    return NextResponse.json({ needsEmailConfirmation: !data.session, email: data.user?.email });
  } catch (error) {
    return apiError(error);
  }
}
