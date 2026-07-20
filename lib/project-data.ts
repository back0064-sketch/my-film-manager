import { ExpenseCategory, EXPENSE_CATEGORIES, ModuleConfig, ModuleId, MonthlySettlement, ProjectData, ProjectType, Task } from '@/types/project';

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
    transactionType: value.transactionType === 'income' ? 'income' : value.moduleId === 'Finance' ? 'expense' : undefined,
    counterparty: typeof value.counterparty === 'string' ? value.counterparty : undefined,
    invoiceNumber: typeof value.invoiceNumber === 'string' ? value.invoiceNumber : undefined,
    paymentMethod: typeof value.paymentMethod === 'string' ? value.paymentMethod : undefined,
    receiptUrl: typeof value.receiptUrl === 'string' ? value.receiptUrl : undefined,
    transactionDate: typeof value.transactionDate === 'string' ? value.transactionDate : undefined,
    readyForCollection: value.readyForCollection === true,
    amount: typeof value.amount === 'number' ? value.amount : 0,
    isPaid: value.isPaid === true,
    linkedTaskId: typeof value.linkedTaskId === 'string' ? value.linkedTaskId : undefined,
    previousStatus: typeof value.previousStatus === 'string' ? value.previousStatus : undefined,
    paidAt: typeof value.paidAt === 'string' ? value.paidAt : undefined,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
  };
}

function cleanMonthlySettlement(value: unknown, fallbackId: string): MonthlySettlement | null {
  if (!isRecord(value)) return null;
  const month = typeof value.month === 'string' ? value.month : '';
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  return {
    id: typeof value.id === 'string' ? value.id : fallbackId,
    month,
    deliveredCount: typeof value.deliveredCount === 'number' ? Math.max(0, value.deliveredCount) : 0,
    unitPrice: typeof value.unitPrice === 'number' ? Math.max(0, value.unitPrice) : 0,
    status: value.status === 'invoiced' || value.status === 'paid' ? value.status : 'pending',
    invoiceDate: typeof value.invoiceDate === 'string' ? value.invoiceDate : undefined,
    paidAt: typeof value.paidAt === 'string' ? value.paidAt : undefined,
    notes: typeof value.notes === 'string' ? value.notes : undefined,
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
  return { id, name, projectType, isFlatRate, monthlySettlements: [], budgetByCategory: emptyBudgetByCategory(), tasks: [], moduleConfigs: PROJECT_TYPE_TEMPLATES[projectType] };
}

export function switchProjectTemplate(project: ProjectData, projectType: ProjectType): ProjectData {
  const moduleConfigs = PROJECT_TYPE_TEMPLATES[projectType].map((config) => ({ ...config, customStatuses: [...config.customStatuses] }));
  const statusesByModule = new Map(moduleConfigs.map((config) => [config.moduleId, config.customStatuses]));
  const isFlatRate = projectType === 'shortVideoEditing';
  return {
    ...project,
    projectType,
    isFlatRate,
    monthlySettlements: project.monthlySettlements,
    monthlySettlement: project.monthlySettlement,
    moduleConfigs,
    tasks: project.tasks.map((task) => {
      const moduleId = task.moduleId === 'Finance' ? 'Finance' : 'Scripting';
      const statuses = statusesByModule.get(moduleId) ?? [];
      return { ...task, moduleId, status: statuses.includes(task.status) ? task.status : statuses[0] ?? task.status, updatedAt: new Date().toISOString() };
    }),
  };
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

  const projectType = Object.hasOwn(PROJECT_TYPE_TEMPLATES, source.projectType as string) ? source.projectType as ProjectType : 'general';
  const moduleConfigs = cleanModuleConfigs(source.moduleConfigs);
  const primaryStatuses = moduleConfigs.find((config) => config.moduleId === 'Scripting')?.customStatuses ?? [];
  const consolidatedTasks = tasks.map((task) => {
    if (task.moduleId === 'Finance') return task;
    return { ...task, moduleId: 'Scripting' as ModuleId, status: primaryStatuses.includes(task.status) ? task.status : primaryStatuses[0] ?? task.status };
  });
  const monthlySettlements = Array.isArray(source.monthlySettlements)
    ? source.monthlySettlements.flatMap((item, index) => { const settlement = cleanMonthlySettlement(item, `${fallbackId}-monthly-${index}`); return settlement ? [settlement] : []; })
    : [];
  const legacySettlement = cleanMonthlySettlement(source.monthlySettlement, `${fallbackId}-monthly-legacy`);
  if (legacySettlement && !monthlySettlements.some((settlement) => settlement.month === legacySettlement.month)) monthlySettlements.push(legacySettlement);
  const settlementIncomeTasks = monthlySettlements.filter((settlement) => !tasks.some((task) => task.id === `monthly-income-${settlement.id}`)).map((settlement) => ({
    id: `monthly-income-${settlement.id}`,
    moduleId: 'Finance' as ModuleId,
    title: `${settlement.month} 短影音月結（舊資料）`,
    status: settlement.status === 'paid' ? '已收款' : settlement.status === 'invoiced' ? '已請款' : '待請款',
    amount: settlement.deliveredCount * settlement.unitPrice,
    isPaid: settlement.status === 'paid',
    transactionType: 'income' as const,
    transactionDate: `${settlement.month}-01`,
    paidAt: settlement.paidAt,
    description: settlement.notes,
    updatedAt: `${settlement.month}-01T00:00:00.000Z`,
  }));

  return {
    id: fallbackId || (typeof source.id === 'string' ? source.id : ''),
    name: name ?? '未命名影視專案',
    projectType,
    isFlatRate: source.isFlatRate === true || source.projectType === 'shortVideoEditing',
    budgetByCategory: cleanBudgetByCategory(source.budgetByCategory),
    tasks: [...consolidatedTasks, ...settlementIncomeTasks],
    monthlySettlements: [],
    moduleConfigs,
  };
}
