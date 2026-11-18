import { timingSafeEqual } from 'node:crypto';
import { OWNER_SHEETS_BACKUP_KIND } from '@/lib/backups/owner-data';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/middlewares/api-handler';
import { taipeiToday } from '@/lib/projects/work-command';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export async function GET(request: Request) {
  const secret = process.env.BACKUP_MONITOR_SECRET?.trim();
  const authorization = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  const response = (status: number) => new Response(null, { status, headers: PRIVATE_NO_STORE_HEADERS });
  if (!secret || authorization.length !== expected.length || !timingSafeEqual(authorization, expected)) return response(401);

  try {
    const now = new Date();
    const date = taipeiToday(now);
    const deadline = Date.parse(`${date}T12:00:00+08:00`);
    const todayStart = Date.parse(`${date}T10:00:00+08:00`);
    const start = new Date(now.getTime() < deadline ? todayStart - 86_400_000 : todayStart);
    const { data, error } = await createSupabaseServiceClient().from('backup_runs')
      .select('id').eq('kind', OWNER_SHEETS_BACKUP_KIND).eq('status', 'succeeded')
      .gte('started_at', start.toISOString()).limit(1);
    return response(!error && data.length > 0 ? 204 : 503);
  } catch {
    return response(503);
  }
}
