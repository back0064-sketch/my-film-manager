import { NextResponse } from 'next/server';
import type { ProjectData } from '@/types/project';

export const PRIVATE_NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
  'Pragma': 'no-cache',
  'Vary': 'Cookie',
};

export class PublicApiError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = 'PublicApiError';
  }
}

export class ProjectConflictError extends PublicApiError {
  constructor(readonly remoteProject: ProjectData | null, message = '同步衝突：雲端專案已被其他裝置更新') {
    super(message, 409);
    this.name = 'ProjectConflictError';
  }
}

export async function readJson(request: Request, maxBytes = 1_000_000): Promise<unknown> {
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new PublicApiError('請求內容過大', 413);
  }
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) throw new PublicApiError('請求內容過大', 413);
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof PublicApiError) throw error;
    throw new PublicApiError('請求內容必須是有效 JSON');
  }
}

export function apiError(error: unknown) {
  if (error instanceof ProjectConflictError) {
    return NextResponse.json({
      error: error.message,
      conflict: {
        remoteProject: error.remoteProject,
        remoteUpdatedAt: error.remoteProject?.syncVersion ?? null,
      },
    }, { status: error.status, headers: PRIVATE_NO_STORE_HEADERS });
  }
  if (error instanceof PublicApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status, headers: PRIVATE_NO_STORE_HEADERS });
  }
  console.error('API request failed', error);
  return NextResponse.json({ error: '伺服器暫時無法處理請求' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
}
