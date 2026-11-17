import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearLocalProjectCache, projectCacheKey } from '@/lib/client/project-cache';
import { dashboardCacheKey, readDashboardCache, writeDashboardCache } from '@/lib/client/dashboard-cache';
import { apiError, PublicApiError, readJson } from '@/lib/middlewares/api-handler';

describe('API 安全防護', () => {
  afterEach(() => vi.restoreAllMocks());

  it('拒絕超過限制的 JSON 請求', async () => {
    const request = new Request('https://example.test/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: '內容過長' }),
    });

    await expect(readJson(request, 5)).rejects.toMatchObject({ status: 413 });
  });

  it('只向前端公開允許的錯誤訊息', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const publicResponse = apiError(new PublicApiError('請求內容過大', 413));
    const privateResponse = apiError(new Error('relation film_projects_internal does not exist'));

    expect(publicResponse.status).toBe(413);
    await expect(publicResponse.json()).resolves.toEqual({ error: '請求內容過大' });
    expect(publicResponse.headers.get('cache-control')).toContain('no-store');
    expect(privateResponse.status).toBe(500);
    await expect(privateResponse.json()).resolves.toEqual({ error: '伺服器暫時無法處理請求' });
  });
});

describe('本機專案快取隱私', () => {
  it('登出時只移除 UUID 專案，不影響其他網站設定', () => {
    const values = new Map([
      ['11111111-1111-4111-8111-111111111111', 'project'],
      ['theme', 'dark'],
    ]);
    const storage = {
      get length() { return values.size; },
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => { values.delete(key); },
    };

    clearLocalProjectCache(storage);

    expect(values.has('11111111-1111-4111-8111-111111111111')).toBe(false);
    expect(values.get('theme')).toBe('dark');
  });

  it('以使用者 ID 隔離摘要與專案快取', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      get length() { return values.size; },
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => { values.delete(key); },
    };
    const project = {
      id: '11111111-1111-4111-8111-111111111111',
      name: '私人專案',
      clientId: null,
      clientName: null,
      updated_at: new Date().toISOString(),
      taskCount: 0,
      outstandingAmount: 0,
      outstandingReceivable: 0,
      outstandingPayable: 0,
    };
    writeDashboardCache(storage, [project], dashboardCacheKey('user-a'));
    values.set(projectCacheKey('user-a', project.id), JSON.stringify({ id: project.id }));

    expect(readDashboardCache(storage, dashboardCacheKey('user-a'))).toHaveLength(1);
    expect(readDashboardCache(storage, dashboardCacheKey('user-b'))).toHaveLength(0);
    clearLocalProjectCache(storage, 'user-a');
    expect(values.has(projectCacheKey('user-a', project.id))).toBe(false);
    expect(values.has(dashboardCacheKey('user-a'))).toBe(false);
  });

  it('拒絕超過 24 小時的摘要快取', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const project = {
      id: '11111111-1111-4111-8111-111111111111',
      name: '過期專案',
      clientId: null,
      clientName: null,
      updated_at: new Date(0).toISOString(),
      taskCount: 0,
      outstandingAmount: 0,
      outstandingReceivable: 0,
      outstandingPayable: 0,
    };
    const savedAt = new Date('2026-01-01T00:00:00.000Z').toISOString();
    values.set('cache', JSON.stringify({ version: 1, savedAt, projects: [project] }));
    expect(readDashboardCache(storage, 'cache', Date.parse('2026-01-03T00:00:00.000Z'))).toEqual([]);
  });
});
