import { NextResponse } from 'next/server';
import { apiError, PublicApiError, readJson } from '@/lib/middlewares/api-handler';
import { createAuthenticatedMfaClient } from '@/lib/auth/mfa-session';

function factorView(factor: Record<string, unknown>) {
  return {
    id: String(factor.id ?? ''),
    type: String(factor.factor_type ?? factor.type ?? 'totp'),
    friendlyName: typeof factor.friendly_name === 'string' ? factor.friendly_name : undefined,
    status: String(factor.status ?? 'unverified'),
    createdAt: typeof factor.created_at === 'string' ? factor.created_at : undefined,
    updatedAt: typeof factor.updated_at === 'string' ? factor.updated_at : undefined,
  };
}

export async function GET() {
  try {
    const supabase = await createAuthenticatedMfaClient();
    const [{ data: factors, error: factorsError }, { data: aal, error: aalError }] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    if (factorsError) throw factorsError;
    if (aalError) throw aalError;
    const all = [...(factors?.totp ?? []), ...(factors?.phone ?? [])] as unknown as Record<string, unknown>[];
    return NextResponse.json({
      factors: all.map(factorView),
      currentLevel: aal?.currentLevel ?? null,
      nextLevel: aal?.nextLevel ?? null,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const payload = await readJson(request, 10_000);
    const factorId = payload && typeof payload === 'object' && typeof (payload as Record<string, unknown>).factorId === 'string'
      ? (payload as Record<string, unknown>).factorId as string : '';
    if (!factorId) throw new PublicApiError('缺少 MFA 驗證器 ID');
    const supabase = await createAuthenticatedMfaClient();
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) throw error;
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
