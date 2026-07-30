import { NextResponse } from 'next/server';

export class PublicApiError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = 'PublicApiError';
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
  if (error instanceof PublicApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error('API request failed', error);
  return NextResponse.json({ error: '伺服器暫時無法處理請求' }, { status: 500 });
}
