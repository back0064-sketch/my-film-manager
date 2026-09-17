import { NextResponse } from 'next/server';
import { classifyAuthError } from '@/lib/auth/auth-errors';
import { readJson, apiError, PublicApiError } from '@/lib/middlewares/api-handler';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const payload = await readJson(request, 10_000);
    if (!payload || typeof payload !== 'object' || typeof (payload as Record<string, unknown>).email !== 'string') {
      throw new PublicApiError('請輸入有效 Email');
    }
    const email = ((payload as Record<string, unknown>).email as string).trim();
    if (!email || email.length > 254 || !email.includes('@')) throw new PublicApiError('請輸入有效 Email');
    const supabase = await createServerSupabaseClient();
    const redirectTo = new URL('/auth/reset', request.url).toString();
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      const classified = classifyAuthError(error);
      throw new PublicApiError(classified.message, classified.status);
    }
    // Do not reveal whether an account exists at this address.
    return NextResponse.json({ sent: true });
  } catch (error) {
    return apiError(error);
  }
}
