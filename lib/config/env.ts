import 'server-only';

function required(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY') {
  const value = process.env[name]?.trim().replace(/^['"]|['"]$/g, '');
  if (!value) throw new Error(`缺少環境變數 ${name}`);
  return value;
}

function requiredServer(name: 'SUPABASE_SECRET_KEY' | 'GOOGLE_SHEETS_SPREADSHEET_ID' | 'GOOGLE_SERVICE_ACCOUNT_EMAIL' | 'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY' | 'CRON_SECRET') {
  const value = process.env[name]?.trim().replace(/^['"]|['"]$/g, '');
  if (!value) throw new Error(`缺少環境變數 ${name}`);
  return value;
}

export function getSupabaseConfig() {
  return {
    url: required('NEXT_PUBLIC_SUPABASE_URL'),
    anonKey: required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  };
}

export function getBackupConfig() {
  return {
    supabaseSecretKey: requiredServer('SUPABASE_SECRET_KEY'),
    googleSheetsSpreadsheetId: requiredServer('GOOGLE_SHEETS_SPREADSHEET_ID'),
    googleServiceAccountEmail: requiredServer('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
    googleServiceAccountPrivateKey: requiredServer('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY'),
    cronSecret: requiredServer('CRON_SECRET'),
  };
}
