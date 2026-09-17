import 'server-only';

function required(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY') {
  const value = process.env[name]?.trim().replace(/^['"]|['"]$/g, '');
  if (!value) throw new Error(`缺少環境變數 ${name}`);
  return value;
}

type ServerEnvName =
  | 'SUPABASE_SECRET_KEY'
  | 'GOOGLE_SHEETS_SPREADSHEET_ID'
  | 'GOOGLE_SERVICE_ACCOUNT_EMAIL'
  | 'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY'
  | 'CRON_SECRET'
  | 'RESEND_API_KEY'
  | 'RESEND_FROM'
  | 'OVERDUE_NOTIFICATION_TO'
  | 'OVERDUE_NOTIFICATION_OWNER_ID';

function readServer(name: ServerEnvName) {
  const value = process.env[name]?.trim().replace(/^['"]|['"]$/g, '');
  return value;
}

function requiredServer(name: Exclude<ServerEnvName, 'RESEND_API_KEY' | 'RESEND_FROM' | 'OVERDUE_NOTIFICATION_TO' | 'OVERDUE_NOTIFICATION_OWNER_ID'>) {
  const value = readServer(name);
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

export function getServerSupabaseConfig() {
  return {
    supabaseSecretKey: requiredServer('SUPABASE_SECRET_KEY'),
  };
}

export function getCronSecret() {
  return requiredServer('CRON_SECRET');
}

export function getOverdueNotificationConfig() {
  return {
    ...getServerSupabaseConfig(),
    cronSecret: getCronSecret(),
    resendApiKey: readServer('RESEND_API_KEY'),
    resendFrom: readServer('RESEND_FROM'),
    notificationTo: readServer('OVERDUE_NOTIFICATION_TO'),
    ownerId: readServer('OVERDUE_NOTIFICATION_OWNER_ID'),
  };
}
