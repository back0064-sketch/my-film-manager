import type { EmailOtpType } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

function safeNext(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/auth/reset';
  return value;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const code = requestUrl.searchParams.get('code');
  const type = requestUrl.searchParams.get('type') as EmailOtpType | null;
  const next = safeNext(requestUrl.searchParams.get('next'));
  const redirectTo = new URL(next, request.url);

  try {
    const supabase = await createServerSupabaseClient();
    if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (!error) return NextResponse.redirect(redirectTo);
    }
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(redirectTo);
    }
  } catch (error) {
    console.error('Auth confirmation failed', error);
  }

  return NextResponse.redirect(new URL('/auth/auth-code-error', request.url));
}
