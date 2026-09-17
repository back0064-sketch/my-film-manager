import { NextResponse } from 'next/server';
import { getOverdueNotificationConfig } from '@/lib/config/env';
import { sendOverdueNotifications } from '@/lib/notifications/overdue-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const config = getOverdueNotificationConfig();
    if (request.headers.get('authorization') !== `Bearer ${config.cronSecret}`) {
      return NextResponse.json({ error: '未授權' }, { status: 401 });
    }
    return NextResponse.json(await sendOverdueNotifications());
  } catch (error) {
    console.error('Overdue notification cron failed', error);
    return NextResponse.json({ error: '逾期通知暫時無法執行' }, { status: 500 });
  }
}
