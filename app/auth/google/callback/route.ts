import { NextResponse } from 'next/server';
import { authOrigin, getLoginConfig } from '@/lib/auth/login-config';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/middlewares/api-handler';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const origin = authOrigin(request.url);
  const redirect = (path: string) => NextResponse.redirect(new URL(path, origin), { headers: PRIVATE_NO_STORE_HEADERS });
  const { ownerId, googleEnabled } = getLoginConfig();
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (!googleEnabled || !ownerId || !code || url.searchParams.has('error')) return redirect('/auth/login-error');
  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return redirect('/auth/login-error');
    const { data, error: userError } = await supabase.auth.getUser();
    // Linking must preserve the existing auth.users UUID; never rewrite project ownership.
    if (userError || data.user?.id !== ownerId) {
      await supabase.auth.signOut({ scope: 'local' });
      return redirect('/auth/login-error');
    }
    return redirect('/');
  } catch {
    return redirect('/auth/login-error');
  }
}
