import { NextResponse } from 'next/server';
import { getCronSecret } from '@/lib/config/env';
import { syncSupabaseToGoogleSheets } from '@/lib/backups/sheets-backup';
import { pingSupabase } from '@/lib/backups/supabase-heartbeat';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const cronSecret = getCronSecret();
    if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: '未授權' }, { status: 401 });
    }
    const heartbeat = await pingSupabase();
    return NextResponse.json({ ok: true, heartbeat, ...(await syncSupabaseToGoogleSheets()) });
  } catch (error) {
    console.error('Supabase Google Sheets backup failed', error);
    return NextResponse.json({ error: '備份暫時無法執行' }, { status: 500 });
  }
}
