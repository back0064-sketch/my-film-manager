import { NextResponse } from 'next/server';
import { readJson, apiError, PublicApiError } from '@/lib/middlewares/api-handler';
import { createServerSupabaseClient } from '@/lib/supabase/server';

function credentials(payload: unknown) {
  if (typeof payload !== 'object' || payload === null) throw new PublicApiError('登入資料格式不正確');
  const { email, password } = payload as Record<string, unknown>;
  if (typeof email !== 'string' || typeof password !== 'string') throw new PublicApiError('請輸入 Email 與密碼');
  if (email.length > 254 || password.length > 1024) throw new PublicApiError('登入資料格式不正確');
  return { email: email.trim(), password };
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { email, password } = credentials(await readJson(request, 10_000));
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) throw new PublicApiError('登入失敗，請檢查 Email 與密碼', 401);
    return NextResponse.json({ id: data.user.id, email: data.user.email });
  } catch (error) {
    return apiError(error);
  }
}
