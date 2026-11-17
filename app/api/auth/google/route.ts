import { NextResponse } from 'next/server';
import { authOrigin, getLoginConfig } from '@/lib/auth/login-config';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/middlewares/api-handler';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const origin = authOrigin(request.url);
  const failure = () => NextResponse.redirect(new URL('/auth/login-error', origin), { headers: PRIVATE_NO_STORE_HEADERS });
  if (!getLoginConfig().googleEnabled) return failure();
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: new URL('/auth/google/callback', origin).toString(),
        skipBrowserRedirect: true,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error || !data.url) return failure();
    return NextResponse.redirect(data.url, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch {
    return failure();
  }
}
