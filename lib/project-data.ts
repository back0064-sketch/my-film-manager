import { ExpenseCategory, EXPENSE_CATEGORIES, ModuleConfig, ModuleId, ProjectData, ProjectType, Task } from '@/types/project';

export const DEFAULT_MODULE_CONFIGS: ModuleConfig[] = [
  { moduleId: 'Scripting', customStatuses: ['💡 構想中', '✍️ 撰寫中', '✅ 已定稿'] },
  { moduleId: 'OnSite', customStatuses: ['🎥 準備中', '🎬 拍攝中', '📦 已殺青'] },
  { moduleId: 'PostProduction', customStatuses: ['✂️ 初剪中', '🎨 調色/特效', '🎉 完稿審核'] },
  { moduleId: 'Finance', customStatuses: ['📝 待請款', '⏳ 審核中', '💰 已入帳'] },
];

const productionConfigs = (scripting: string[], onSite: string[], postProduction: string[]): ModuleConfig[] => [
  { moduleId: 'Scripting', customStatuses: scripting },
  { moduleId: 'OnSite', customStatuses: onSite },
  { moduleId: 'PostProduction', customStatuses: postProduction },
  { moduleId: 'Finance', customStatuses: ['📝 待請款', '⏳ 審核中', '💰 已入帳'] },
];

export const PROJECT_TYPE_TEMPLATES: Record<ProjectType, ModuleConfig[]> = {
  general: DEFAULT_MODULE_CONFIGS,
  shortVideoEditing: productionConfigs(['待收素材', '剪輯中', '待確認', '修改中', '已交付'], DEFAULT_MODULE_CONFIGS[1].customStatuses, DEFAULT_MODULE_CONFIGS[2].customStatuses),
  longVideoEditing: productionConfigs(['素材整理', '粗剪中', '初剪審帶', '客戶修改', '定稿交付'], DEFAULT_MODULE_CONFIGS[1].customStatuses, DEFAULT_MODULE_CONFIGS[2].customStatuses),
  programPlanning: productionConfigs(['田調中', '場勘完成', '腳本撰寫', '製作準備', 'RD', '拍攝執行', '結案交付'], DEFAULT_MODULE_CONFIGS[1].customStatuses, DEFAULT_MODULE_CONFIGS[2].customStatuses),
  director: productionConfigs(['腳本開發', '分鏡確認', '現場拍攝', '後期確認', '已播出', '結案'], DEFAULT_MODULE_CONFIGS[1].customStatuses, DEFAULT_MODULE_CONFIGS[2].customStatuses),
};

const moduleIds = new Set<ModuleId>(['Scripting', 'OnSite', 'PostProduction', 'Finance']);
const expenseCategories = new Set<ExpenseCategory>(EXPENSE_CATEGORIES);

function emptyBudgetByCategory(): Record<ExpenseCategory, number> {
  return { Scripting: 0, OnSite: 0, PostProduction: 0 };
}

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
    description: typeof value.description === 'string' ? value.description : undefined,
    assignee: typeof value.assignee === 'string' ? value.assignee : undefined,
    dueDate: typeof value.dueDate === 'string' ? value.dueDate : undefined,
    expenseCategory: expenseCategories.has(value.expenseCategory as ExpenseCategory) ? value.expenseCategory as ExpenseCategory : undefined,
    amount: typeof value.amount === 'number' ? value.amount : 0,
    isPaid: value.isPaid === true,
    linkedTaskId: typeof value.linkedTaskId === 'string' ? value.linkedTaskId : undefined,
    previousStatus: typeof value.previousStatus === 'string' ? value.previousStatus : undefined,
    paidAt: typeof value.paidAt === 'string' ? value.paidAt : undefined,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
  };
}

function cleanBudgetByCategory(value: unknown): Record<ExpenseCategory, number> {
  const budget = emptyBudgetByCategory();
  if (!isRecord(value)) return budget;
  EXPENSE_CATEGORIES.forEach((category) => {
    if (typeof value[category] === 'number' && Number.isFinite(value[category])) budget[category] = Math.max(0, value[category]);
  });
  return budget;
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

export function createProjectData(id: string, name = '未命名影視專案', projectType: ProjectType = 'general'): ProjectData {
  const isFlatRate = projectType === 'shortVideoEditing';
  return { id, name, projectType, isFlatRate, monthlySettlement: isFlatRate ? { month: new Date().toISOString().slice(0, 7), deliveredCount: 0, unitPrice: 0, status: 'pending' } : undefined, budgetByCategory: emptyBudgetByCategory(), tasks: [], moduleConfigs: PROJECT_TYPE_TEMPLATES[projectType] };
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
    projectType: Object.hasOwn(PROJECT_TYPE_TEMPLATES, source.projectType as string) ? source.projectType as ProjectType : 'general',
    isFlatRate: source.isFlatRate === true || source.projectType === 'shortVideoEditing',
    monthlySettlement: isRecord(source.monthlySettlement) ? {
      month: typeof source.monthlySettlement.month === 'string' ? source.monthlySettlement.month : new Date().toISOString().slice(0, 7),
      deliveredCount: typeof source.monthlySettlement.deliveredCount === 'number' ? Math.max(0, source.monthlySettlement.deliveredCount) : 0,
      unitPrice: typeof source.monthlySettlement.unitPrice === 'number' ? Math.max(0, source.monthlySettlement.unitPrice) : 0,
      status: source.monthlySettlement.status === 'invoiced' || source.monthlySettlement.status === 'paid' ? source.monthlySettlement.status : 'pending',
    } : source.projectType === 'shortVideoEditing' ? { month: new Date().toISOString().slice(0, 7), deliveredCount: 0, unitPrice: 0, status: 'pending' } : undefined,
    budgetByCategory: cleanBudgetByCategory(source.budgetByCategory),
    tasks,
    moduleConfigs: cleanModuleConfigs(source.moduleConfigs),
  };
}
