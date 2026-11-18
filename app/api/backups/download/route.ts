import { requireUser } from '@/lib/auth/session';
import { readOwnerBackup, requireBackupOwner } from '@/lib/backups/owner-data';
import { buildRestoreSql } from '@/lib/backups/restore-sql';
import { apiError, PRIVATE_NO_STORE_HEADERS, PublicApiError } from '@/lib/middlewares/api-handler';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const owner = await requireUser();
    if (owner.id !== requireBackupOwner()) throw new PublicApiError('無權下載此備份', 403);
    const snapshot = await readOwnerBackup(await createServerSupabaseClient(), owner.id);
    const timestamp = new Date().toISOString().replaceAll(':', '-');
    return new Response(buildRestoreSql(snapshot), {
      headers: {
        ...PRIVATE_NO_STORE_HEADERS,
        'Content-Type': 'application/sql; charset=utf-8',
        'Content-Disposition': `attachment; filename="film-manager-${timestamp}.sql"`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
