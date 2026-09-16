import 'server-only';

import { JWT } from 'google-auth-library';
import { createClient } from '@supabase/supabase-js';
import { buildBackupWorkbook, type ClientRow, type ProjectRow } from '@/lib/backups/sheets-data';
import { getBackupConfig, getSupabaseConfig } from '@/lib/config/env';

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

async function sheetsRequest(spreadsheetId: string, path: string, accessToken: string, body: unknown) {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google Sheets 同步失敗（${response.status}）：${detail.slice(0, 300)}`);
  }
}

export async function syncSupabaseToGoogleSheets() {
  const backupConfig = getBackupConfig();
  const supabaseConfig = getSupabaseConfig();
  const database = createClient(supabaseConfig.url, backupConfig.supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const [projectsResult, clientsResult] = await Promise.all([
    database.from('film_projects').select('id, name, owner_id, client_id, updated_at, project_data').order('updated_at', { ascending: false }),
    database.from('clients').select('id, owner_id, name, contact_name, contact_email, contact_phone, notes, created_at, updated_at').order('name'),
  ]);
  if (projectsResult.error) throw new Error(`讀取 Supabase 專案失敗：${projectsResult.error.message}`);
  if (clientsResult.error) throw new Error(`讀取 Supabase 客戶失敗：${clientsResult.error.message}`);

  const syncedAt = new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Asia/Taipei',
  }).format(new Date());
  const workbook = buildBackupWorkbook(projectsResult.data as ProjectRow[], clientsResult.data as ClientRow[], syncedAt);
  const accessToken = await getAccessToken(backupConfig.googleServiceAccountEmail, backupConfig.googleServiceAccountPrivateKey);

  await sheetsRequest(backupConfig.googleSheetsSpreadsheetId, 'values:batchClear', accessToken, {
    ranges: ["'同步狀態'!A1:B13", "'專案'!A1:K", "'客戶'!A1:I", "'任務'!A1:W", "'月結款項'!A1:K"],
  });
  await sheetsRequest(backupConfig.googleSheetsSpreadsheetId, 'values:batchUpdate', accessToken, {
    valueInputOption: 'RAW',
    data: [
      { range: "'同步狀態'!A1:B13", majorDimension: 'ROWS', values: workbook.status },
      { range: "'專案'!A1", majorDimension: 'ROWS', values: workbook.projects },
      { range: "'客戶'!A1", majorDimension: 'ROWS', values: workbook.clients },
      { range: "'任務'!A1", majorDimension: 'ROWS', values: workbook.tasks },
      { range: "'月結款項'!A1", majorDimension: 'ROWS', values: workbook.settlements },
    ],
  });

  return {
    syncedAt,
    projects: projectsResult.data.length,
    clients: clientsResult.data.length,
    tasks: workbook.tasks.length - 1,
    settlements: workbook.settlements.length - 1,
  };
}
