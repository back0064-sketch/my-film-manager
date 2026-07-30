import { NextResponse } from 'next/server';
import { apiError, PublicApiError, readJson } from '@/lib/middlewares/api-handler';
import { mergeClients } from '@/lib/services/project-service';

export async function POST(request: Request) {
  try {
    const body = await readJson(request, 10_000);
    if (!body || typeof body !== 'object') throw new PublicApiError('客戶合併資料格式不正確');
    const { sourceId, targetId } = body as Record<string, unknown>;
    if (typeof sourceId !== 'string' || typeof targetId !== 'string') throw new PublicApiError('客戶合併資料格式不正確');
    await mergeClients(sourceId, targetId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
