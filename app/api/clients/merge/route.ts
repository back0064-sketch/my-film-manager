import { NextResponse } from 'next/server';
import { apiError, readJson } from '@/lib/middlewares/api-handler';
import { mergeClients } from '@/lib/services/project-service';

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    if (!body || typeof body !== 'object') throw new Error('客戶合併資料格式不正確');
    const { sourceId, targetId } = body as Record<string, unknown>;
    if (typeof sourceId !== 'string' || typeof targetId !== 'string') throw new Error('客戶合併資料格式不正確');
    await mergeClients(sourceId, targetId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
