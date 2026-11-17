import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/middlewares/api-handler';

function safeNext(value: string | null) {
  return value === '/' ? '/' : '/auth/reset';
}

function redirectWithoutCaching(url: URL) {
  return NextResponse.redirect(url, { headers: PRIVATE_NO_STORE_HEADERS });
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const code = requestUrl.searchParams.get('code');
  const type = requestUrl.searchParams.get('type');
  const next = safeNext(requestUrl.searchParams.get('next'));
  const redirectTo = new URL(next, request.url);

  try {
    const supabase = await createServerSupabaseClient();
    if (tokenHash && type === 'recovery') {
      const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (!error) return redirectWithoutCaching(redirectTo);
    }
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return redirectWithoutCaching(redirectTo);
    }
  } catch (error) {
    console.error('Auth confirmation failed', error);
  }

  return redirectWithoutCaching(new URL('/auth/auth-code-error', request.url));
}
