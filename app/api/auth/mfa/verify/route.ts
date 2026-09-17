import { NextResponse } from 'next/server';
import { apiError, PublicApiError, readJson } from '@/lib/middlewares/api-handler';
import { createAuthenticatedMfaClient } from '@/lib/auth/mfa-session';

export async function POST(request: Request) {
  try {
    const payload = await readJson(request, 10_000);
    const source = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    const factorId = typeof source.factorId === 'string' ? source.factorId : '';
    const code = typeof source.code === 'string' ? source.code.replace(/\s/g, '') : '';
    if (!factorId || !/^\d{6}$/.test(code)) throw new PublicApiError('請輸入驗證器上的 6 位數代碼');
    const supabase = await createAuthenticatedMfaClient();
    const { data, error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) throw error;
    const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal.error) throw aal.error;
    return NextResponse.json({ verified: true, currentLevel: aal.data?.currentLevel ?? null, nextLevel: aal.data?.nextLevel ?? null, session: Boolean(data) });
  } catch (error) {
    return apiError(error);
  }
}
