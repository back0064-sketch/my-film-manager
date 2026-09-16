import { NextResponse } from 'next/server';
import { getBackupConfig } from '@/lib/config/env';
import { syncSupabaseToGoogleSheets } from '@/lib/backups/sheets-backup';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const config = getBackupConfig();
    if (request.headers.get('authorization') !== `Bearer ${config.cronSecret}`) {
      return NextResponse.json({ error: '未授權' }, { status: 401 });
    }
    return NextResponse.json({ ok: true, ...(await syncSupabaseToGoogleSheets()) });
  } catch (error) {
    console.error('Supabase Google Sheets backup failed', error);
    return NextResponse.json({ error: '備份暫時無法執行' }, { status: 500 });
  }
}
