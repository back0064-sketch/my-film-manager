import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isInvalidRefreshTokenError } from '@/lib/auth/auth-errors';

export async function proxy(request: NextRequest) {
  // Callback handlers establish a new session themselves. Refreshing an old
  // session here can race with PKCE exchange and overwrite response cookies.
  if (['/auth/confirm', '/auth/google/callback', '/api/auth/google'].includes(request.nextUrl.pathname)) {
    return NextResponse.next({ request });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { error } = await supabase.auth.getUser();
  if (isInvalidRefreshTokenError(error)) {
    const sessionName = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
    const expired = request.cookies.getAll().filter(({ name }) => name === sessionName || (name.startsWith(`${sessionName}.`) && /^\d+$/.test(name.slice(sessionName.length + 1))));
    expired.forEach(({ name }) => request.cookies.delete(name));
    const previous = response.cookies.getAll();
    response = NextResponse.next({ request });
    previous.forEach(cookie => response.cookies.set(cookie));
    for (const { name } of expired) {
      response.cookies.set(name, '', { expires: new Date(0), maxAge: 0, path: '/' });
    }
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
