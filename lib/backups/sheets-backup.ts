import 'server-only';

import { JWT } from 'google-auth-library';
import { buildBackupWorkbook, type BackupWorkbook } from '@/lib/backups/sheets-data';
import { OWNER_SHEETS_BACKUP_KIND, readOwnerBackup, requireBackupOwner } from '@/lib/backups/owner-data';
import { getBackupConfig } from '@/lib/config/env';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

async function getAccessToken(email: string, privateKey: string) {
  const client = new JWT({
    email,
    key: privateKey.replace(/\\n/g, '\n'),
    scopes: [SHEETS_SCOPE],
  });
  const result = await client.getAccessToken();
  if (!result.token) throw new Error('Google 服務帳號無法取得存取權杖');
  return result.token;
}

async function sheetsRequest<Result>(spreadsheetId: string, path: string, accessToken: string, body?: unknown): Promise<Result> {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Google Sheets 同步失敗（${response.status}）`);
  return response.json();
}

type GridSheet = { properties: { sheetId: number; title: string; gridProperties?: { rowCount: number; columnCount: number } } };

async function writeAndVerifyWorkbook(spreadsheetId: string, token: string, workbook: BackupWorkbook) {
  const tabs = [
    { title: '同步狀態', lastColumn: 'B', rows: workbook.status },
    { title: '專案', lastColumn: 'K', rows: workbook.projects },
    { title: '客戶', lastColumn: 'I', rows: workbook.clients },
    { title: '任務', lastColumn: 'W', rows: workbook.tasks },
    { title: '月結款項', lastColumn: 'P', rows: workbook.settlements },
  ];
  const { sheets } = await sheetsRequest<{ sheets: GridSheet[] }>(spreadsheetId, '?fields=sheets(properties(sheetId,title,gridProperties(rowCount,columnCount))', token);
  const requests = tabs.flatMap(({ title, rows }) => {
    const sheet = sheets.find(({ properties }) => properties.title === title)?.properties;
    const grid = sheet?.gridProperties;
    const columnCount = rows[0].length;
    if (!sheet || !grid || grid.columnCount < columnCount) throw new Error(`Google 試算表分頁規格不符：${title}`);

    const grow = rows.length > grid.rowCount
      ? [{ appendDimension: { sheetId: sheet.sheetId, dimension: 'ROWS', length: rows.length - grid.rowCount } }]
      : [];
    return [...grow, { updateCells: {
      range: { sheetId: sheet.sheetId, startColumnIndex: 0, endColumnIndex: columnCount },
      fields: 'userEnteredValue',
      rows: rows.map((row) => ({ values: row.map((value) => ({ userEnteredValue:
        typeof value === 'number' ? { numberValue: value } : { stringValue: String(value ?? '') },
      })) })),
    } }];
  });
  // Google 會以同一批次替換五個分頁的值，並清除寫入範圍剩餘的舊值。
  await sheetsRequest(spreadsheetId, ':batchUpdate', token, { requests });

  const query = new URLSearchParams({ valueRenderOption: 'UNFORMATTED_VALUE' });
  for (const tab of tabs) query.append('ranges', `'${tab.title}'!A:${tab.lastColumn}`);
  const { valueRanges } = await sheetsRequest<{ valueRanges: { values?: unknown[][] }[] }>(spreadsheetId, `/values:batchGet?${query}`, token);
  const trim = (rows: unknown[][]) => rows.map((row) => {
    const populated = row.findLastIndex((value) => value !== '' && value != null);
    return row.slice(0, populated + 1);
  });
  if (tabs.some((tab, index) => JSON.stringify(trim(valueRanges[index]?.values ?? [])) !== JSON.stringify(trim(tab.rows)))) {
    throw new Error('Google 試算表回讀與匯出內容不符');
  }
}

export async function syncSupabaseToGoogleSheets() {
  const ownerId = requireBackupOwner();
  const backupConfig = getBackupConfig();
  const database = createSupabaseServiceClient();
  let runId: string | undefined;
  const startedAt = new Date().toISOString();

  const started = await database.from('backup_runs').insert({ kind: OWNER_SHEETS_BACKUP_KIND, status: 'started', started_at: startedAt }).select('id').maybeSingle();
  if (!started.error) runId = started.data?.id;
  else if (!isMissingTableError(started.error)) console.warn('無法記錄備份開始狀態', started.error.message);

  try {
    const { projects, clients } = await readOwnerBackup(database, ownerId);
    projects.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    clients.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));

    const syncedAt = new Intl.DateTimeFormat('zh-TW', {
      dateStyle: 'medium',
      timeStyle: 'medium',
      timeZone: 'Asia/Taipei',
    }).format(new Date());
    const workbook = buildBackupWorkbook(projects, clients, syncedAt);
    const accessToken = await getAccessToken(backupConfig.googleServiceAccountEmail, backupConfig.googleServiceAccountPrivateKey);

    await writeAndVerifyWorkbook(backupConfig.googleSheetsSpreadsheetId, accessToken, workbook);

    const result = {
      syncedAt,
      projects: projects.length,
      clients: clients.length,
      tasks: workbook.tasks.length - 1,
      settlements: workbook.settlements.length - 1,
    };
    if (runId) {
      const completed = await database.from('backup_runs').update({ status: 'succeeded', completed_at: new Date().toISOString(), row_counts: result }).eq('id', runId);
      if (completed.error) throw new Error('無法記錄已驗證的備份結果');
    }
    return result;
  } catch (error) {
    if (runId) await database.from('backup_runs').update({ status: 'failed', completed_at: new Date().toISOString(), error_message: error instanceof Error ? error.message.slice(0, 500) : '未知錯誤' }).eq('id', runId);
    throw error;
  }
}

function isMissingTableError(error: { code?: string; message?: string }) {
  return error.code === '42P01' || error.code === 'PGRST205' || error.message?.includes('backup_runs');
}
