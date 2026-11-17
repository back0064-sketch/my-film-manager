import { NextResponse } from 'next/server';
import { getLoginConfig } from '@/lib/auth/login-config';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/middlewares/api-handler';

export async function GET() {
  return NextResponse.json({ googleEnabled: getLoginConfig().googleEnabled }, { headers: PRIVATE_NO_STORE_HEADERS });
}
