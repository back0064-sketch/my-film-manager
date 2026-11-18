import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('google-auth-library', () => ({ JWT: class { async getAccessToken() { return { token: 'test-token' }; } } }));
vi.mock('@/lib/supabase/service', () => ({ createSupabaseServiceClient: () => createClient('https://supabase.test', 'test-key') }));

import { syncSupabaseToGoogleSheets } from '@/lib/backups/sheets-backup';
import { GET as backupHealth } from '@/app/api/backups/health/route';

const ownerId = '00000000-0000-4000-8000-000000000001';
const foreignId = '00000000-0000-4000-8000-000000000002';
const titles = ['同步狀態', '專案', '客戶', '任務', '月結款項'];

function mockServices({ wrongOwner = false, staleTail = false } = {}) {
  const updates: string[] = [];
  const tabs = new Map<number, unknown[][]>();
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(input);
    if (url.host === 'supabase.test') {
      if (url.pathname.endsWith('/backup_runs')) {
        if (init?.method === 'POST') return Response.json({ id: 'run-id' });
        updates.push(JSON.parse(String(init?.body)).status);
        return new Response(null, { status: 204 });
      }
      expect(url.searchParams.get('owner_id')).toBe(`eq.${ownerId}`);
      if (url.pathname.endsWith('/film_projects')) expect(url.searchParams.get('select')).not.toContain('created_at');
      if (url.searchParams.has('id') || url.pathname.endsWith('/clients')) return Response.json([]);
      return Response.json([{ id: 'project-1', name: '=原文', owner_id: wrongOwner ? foreignId : ownerId, client_id: null, project_data: null, updated_at: '2026-11-18' }]);
    }
    if (url.pathname.endsWith(':batchUpdate')) {
      for (const { updateCells } of JSON.parse(String(init?.body)).requests) {
        expect(updateCells.range).not.toHaveProperty('endRowIndex');
        expect(updateCells.fields).toBe('userEnteredValue');
        tabs.set(updateCells.range.sheetId, updateCells.rows.map((row: { values: { userEnteredValue: { stringValue?: string; numberValue?: number } }[] }) =>
          row.values.map(({ userEnteredValue }) => userEnteredValue.stringValue ?? userEnteredValue.numberValue),
        ));
      }
      return Response.json({});
    }
    if (url.pathname.endsWith('/values:batchGet')) {
      if (staleTail) tabs.get(1)?.push([foreignId, 'stale-project']);
      return Response.json({ valueRanges: titles.map((_, index) => ({ values: tabs.get(index) })) });
    }
    expect(url.searchParams.get('fields')).toBe('sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))');
    return Response.json({ sheets: titles.map((title, sheetId) => ({ properties: { title, sheetId, gridProperties: { rowCount: 1000, columnCount: 26 } } })) });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { updates, tabs, fetchMock };
}

beforeEach(() => {
  vi.stubEnv('AUTH_OWNER_ID', ownerId);
  for (const name of ['SUPABASE_SECRET_KEY', 'GOOGLE_SHEETS_SPREADSHEET_ID', 'GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY', 'CRON_SECRET']) vi.stubEnv(name, 'test-only');
});

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

it('缺帳號設定就停止，未讀資料或寫入試算表', async () => {
  vi.stubEnv('AUTH_OWNER_ID', '');
  const { fetchMock } = mockServices();
  await expect(syncSupabaseToGoogleSheets()).rejects.toThrow('AUTH_OWNER_ID');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('匯出本人資料，回讀五個分頁才記為成功', async () => {
  const { updates, tabs } = mockServices();
  expect(await syncSupabaseToGoogleSheets()).toMatchObject({ projects: 1, clients: 0, tasks: 0, settlements: 0 });
  expect(tabs.get(1)?.[1].slice(0, 3)).toEqual([ownerId, 'project-1', '=原文']);
  expect(updates).toEqual(['succeeded']);
});

it('資料來源誤帶其他帳號時拒絕寫入', async () => {
  const { updates, tabs } = mockServices({ wrongOwner: true });
  await expect(syncSupabaseToGoogleSheets()).rejects.toThrow('其他帳號');
  expect(tabs.size).toBe(0);
  expect(updates).toEqual(['failed']);
});

it('目的端若殘留舊列，拒絕記為成功', async () => {
  const { updates } = mockServices({ staleTail: true });
  await expect(syncSupabaseToGoogleSheets()).rejects.toThrow('回讀');
  expect(updates).toEqual(['failed']);
});

it('備份監測在台北中午後只接受當天成功的紀錄', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-18T04:37:00Z'));
  vi.stubEnv('BACKUP_MONITOR_SECRET', 'monitor-test');
  const fetchMock = vi.fn(async (input: string | URL) => {
    const params = new URL(input).searchParams;
    expect(params.get('kind')).toBe('eq.owner_google_sheets');
    expect(params.get('status')).toBe('eq.succeeded');
    expect(params.get('started_at')).toBe('gte.2026-11-18T02:00:00.000Z');
    return Response.json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
  expect((await backupHealth(new Request('https://site.test/api/backups/health'))).status).toBe(401);
  expect(fetchMock).not.toHaveBeenCalled();
  const request = new Request('https://site.test/api/backups/health', { headers: { authorization: 'Bearer monitor-test' } });
  expect((await backupHealth(request)).status).toBe(503);
  fetchMock.mockResolvedValueOnce(Response.json([{ id: 'run-id' }]));
  expect((await backupHealth(request)).status).toBe(204);
});
