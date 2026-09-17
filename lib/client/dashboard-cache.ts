import { ProjectListItem } from '@/types/project';

export const DASHBOARD_CACHE_KEY = 'film-manager-dashboard-cache-v1';

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

export function readDashboardCache(storage: Pick<Storage, 'getItem'>): ProjectListItem[] {
  try {
    const raw = storage.getItem(DASHBOARD_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<DashboardCache>;
    if (parsed.version !== 1 || !Array.isArray(parsed.projects)) return [];
    return parsed.projects.filter(isProjectListItem);
  } catch {
    return [];
  }
}

export function writeDashboardCache(storage: Pick<Storage, 'setItem'>, projects: ProjectListItem[]) {
  const payload: DashboardCache = { version: 1, savedAt: new Date().toISOString(), projects };
  try {
    storage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // A full localStorage must not prevent the dashboard from rendering.
  }
}

export function clearDashboardCache(storage: Pick<Storage, 'removeItem'>) {
  try {
    storage.removeItem(DASHBOARD_CACHE_KEY);
  } catch {
    // Sign-out should remain best-effort if storage is unavailable.
  }
}
