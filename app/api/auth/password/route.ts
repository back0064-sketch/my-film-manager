import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { apiError, PRIVATE_NO_STORE_HEADERS, PublicApiError, readJson } from '@/lib/middlewares/api-handler';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    // Only a same-origin browser form may change the password using session cookies.
    if (request.headers.get('origin') !== new URL(request.url).origin) throw new PublicApiError('請從本站重新操作。', 403);
    await requireUser();
    const payload = await readJson(request, 10_000);
    const password = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).password : null;
    if (typeof password !== 'string' || password.length < 8 || password.length > 1024) throw new PublicApiError('密碼長度需為 8 至 1024 個字元。');
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      if (error.code === 'same_password') throw new PublicApiError('新密碼不能與原密碼相同。');
      if (error.code === 'weak_password') throw new PublicApiError('新密碼不符合安全規則，請避免使用常見密碼。');
      if (error.status === 429) throw new PublicApiError('嘗試次數過多，請稍後再試。', 429);
      throw new PublicApiError('密碼未能更新，請重新申請重設連結後再試。', 400);
    }
    // A sign-out failure must not make a successful password update appear to fail.
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
    return NextResponse.json({ updated: true, signedOut: !signOutError }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    return apiError(error);
  }
}
