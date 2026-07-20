import { ModuleConfig, ModuleId, ProjectData, Task } from '@/types/project';

export const DEFAULT_MODULE_CONFIGS: ModuleConfig[] = [
  { moduleId: 'Scripting', customStatuses: ['💡 構想中', '✍️ 撰寫中', '✅ 已定稿'] },
  { moduleId: 'OnSite', customStatuses: ['🎥 準備中', '🎬 拍攝中', '📦 已殺青'] },
  { moduleId: 'PostProduction', customStatuses: ['✂️ 初剪中', '🎨 調色/特效', '🎉 完稿審核'] },
  { moduleId: 'Finance', customStatuses: ['📝 待請款', '⏳ 審核中', '💰 已入帳'] },
];

const moduleIds = new Set<ModuleId>(['Scripting', 'OnSite', 'PostProduction', 'Finance']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function cleanTask(value: unknown): Task | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !moduleIds.has(value.moduleId as ModuleId)) return null;

  return {
    id: value.id,
    moduleId: value.moduleId as ModuleId,
    title: typeof value.title === 'string' ? value.title : '未命名任務',
    status: typeof value.status === 'string' ? value.status : '未分類',
    amount: typeof value.amount === 'number' ? value.amount : 0,
    isPaid: value.isPaid === true,
    linkedTaskId: typeof value.linkedTaskId === 'string' ? value.linkedTaskId : undefined,
    previousStatus: typeof value.previousStatus === 'string' ? value.previousStatus : undefined,
    paidAt: typeof value.paidAt === 'string' ? value.paidAt : undefined,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
  };
}

function cleanModuleConfigs(value: unknown): ModuleConfig[] {
  if (!Array.isArray(value)) return DEFAULT_MODULE_CONFIGS;
  const configs = value.flatMap((config) => {
    if (!isRecord(config) || !moduleIds.has(config.moduleId as ModuleId) || !Array.isArray(config.customStatuses)) return [];
    const customStatuses = config.customStatuses.filter((status): status is string => typeof status === 'string');
    return customStatuses.length ? [{ moduleId: config.moduleId as ModuleId, customStatuses }] : [];
  });
  return configs.length ? configs : DEFAULT_MODULE_CONFIGS;
}

export function createProjectData(id: string, name = '未命名影視專案'): ProjectData {
  return { id, name, isFlatRate: false, tasks: [], moduleConfigs: DEFAULT_MODULE_CONFIGS };
}

export function cleanProjectData(raw: unknown, fallbackId: string): ProjectData | null {
  if (!isRecord(raw)) return null;
  const source = isRecord(raw.project_data) ? raw.project_data : raw;
  const name = [source.name, source.title, source.projectName, source.project_name, raw.name]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const tasks = Array.isArray(source.tasks) ? source.tasks.flatMap((task) => {
    const cleaned = cleanTask(task);
    return cleaned ? [cleaned] : [];
  }) : [];

  return {
    id: fallbackId || (typeof source.id === 'string' ? source.id : ''),
    name: name ?? '未命名影視專案',
    isFlatRate: source.isFlatRate === true,
    tasks,
    moduleConfigs: cleanModuleConfigs(source.moduleConfigs),
  };
}
