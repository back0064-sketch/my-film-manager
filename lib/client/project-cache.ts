import { clearDashboardCache, DASHBOARD_CACHE_KEY } from '@/lib/client/dashboard-cache';

const projectIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PROJECT_CACHE_PREFIX = 'film-manager-project-v1:';
export const projectCachePrefix = (userId: string) => `${PROJECT_CACHE_PREFIX}${userId}:`;
export const projectCacheKey = (userId: string, projectId: string) => `${projectCachePrefix(userId)}${projectId}`;

export function clearLocalProjectCache(storage: Pick<Storage, 'length' | 'key' | 'removeItem'>, userId?: string) {
  const keysToRemove: string[] = [];
  const scopedPrefix = userId ? projectCachePrefix(userId) : PROJECT_CACHE_PREFIX;
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && (projectIdPattern.test(key) || key.startsWith(scopedPrefix) || key.startsWith(`${DASHBOARD_CACHE_KEY}:`))) keysToRemove.push(key);
  }
  keysToRemove.forEach((key) => storage.removeItem(key));
  clearDashboardCache(storage, userId);
}
