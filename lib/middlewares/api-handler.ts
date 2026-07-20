import { NextResponse } from 'next/server';

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error('請求內容必須是有效 JSON');
  }
}

export function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : '伺服器發生未預期錯誤';
  const status = message.includes('請先登入') ? 401 : message.includes('無效') || message.includes('格式') || message.includes('缺少') ? 400 : 500;
  return NextResponse.json({ error: message }, { status });
}
