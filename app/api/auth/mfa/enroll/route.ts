import { NextResponse } from 'next/server';
import { apiError, PublicApiError, readJson } from '@/lib/middlewares/api-handler';
import { createAuthenticatedMfaClient } from '@/lib/auth/mfa-session';

export async function POST(request: Request) {
  try {
    const payload = await readJson(request, 10_000);
    const friendlyName = payload && typeof payload === 'object' && typeof (payload as Record<string, unknown>).friendlyName === 'string'
      ? ((payload as Record<string, unknown>).friendlyName as string).trim() : '影視製片控制台';
    if (friendlyName.length > 80) throw new PublicApiError('驗證器名稱不可超過 80 個字元');
    const supabase = await createAuthenticatedMfaClient();
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName });
    if (error || !data) throw error ?? new PublicApiError('MFA 啟用失敗');
    return NextResponse.json({
      factorId: data.id,
      friendlyName: data.friendly_name,
      qrCode: data.totp?.qr_code,
      secret: data.totp?.secret,
      uri: data.totp?.uri,
    });
  } catch (error) {
    return apiError(error);
  }
}
