import { ProjectListItem } from '@/types/project';

export const DASHBOARD_CACHE_KEY = 'film-manager-dashboard-cache-v1';
export const dashboardCacheKey = (userId?: string) => userId ? `${DASHBOARD_CACHE_KEY}:${userId}` : DASHBOARD_CACHE_KEY;
export const DASHBOARD_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type DashboardCache = {
  version: 1;
  savedAt: string;
  projects: ProjectListItem[];
};

function isProjectListItem(value: unknown): value is ProjectListItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<ProjectListItem>;
  return typeof item.id === 'string'
    && typeof item.name === 'string'
    && typeof item.updated_at === 'string'
    && (item.workCommandItems === undefined || Array.isArray(item.workCommandItems))
    && (item.receivableItems === undefined || Array.isArray(item.receivableItems));
}

export function readDashboardCache(storage: Pick<Storage, 'getItem'>, key = DASHBOARD_CACHE_KEY, now = Date.now()): ProjectListItem[] {
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<DashboardCache>;
    if (parsed.version !== 1 || !Array.isArray(parsed.projects)) return [];
    const savedAt = typeof parsed.savedAt === 'string' ? Date.parse(parsed.savedAt) : Number.NaN;
    if (!Number.isFinite(savedAt) || now - savedAt > DASHBOARD_CACHE_MAX_AGE_MS || savedAt - now > 60_000) return [];
    return parsed.projects.filter(isProjectListItem);
  } catch {
    return [];
  }
}

export function writeDashboardCache(storage: Pick<Storage, 'setItem'>, projects: ProjectListItem[], key = DASHBOARD_CACHE_KEY) {
  const payload: DashboardCache = { version: 1, savedAt: new Date().toISOString(), projects };
  try {
    storage.setItem(key, JSON.stringify(payload));
  } catch {
    // A full localStorage must not prevent the dashboard from rendering.
  }
}

export function clearDashboardCache(storage: Pick<Storage, 'removeItem'>, userId?: string) {
  try {
    storage.removeItem(DASHBOARD_CACHE_KEY);
    if (userId) storage.removeItem(dashboardCacheKey(userId));
  } catch {
    // Sign-out should remain best-effort if storage is unavailable.
  }
}
