export const MODULES = [
  { id: 'Scripting', name: '✍️ 腳本階段' },
  { id: 'OnSite', name: '🎥 拍攝現場' },
  { id: 'PostProduction', name: '✂️ 後期剪輯' },
  { id: 'Finance', name: '💰 財務帳目' },
] as const;

export type ModuleId = (typeof MODULES)[number]['id'];
export const EXPENSE_CATEGORIES = ['Scripting', 'OnSite', 'PostProduction'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  Scripting: '腳本',
  OnSite: '拍攝',
  PostProduction: '後期',
};

export interface ModuleConfig {
  moduleId: ModuleId;
  customStatuses: string[];
}

export interface Task {
  id: string;
  moduleId: ModuleId;
  title: string;
  status: string;
  description?: string;
  assignee?: string;
  dueDate?: string;
  expenseCategory?: ExpenseCategory;
  amount: number;
  isPaid: boolean;
  linkedTaskId?: string;
  previousStatus?: string;
  paidAt?: string;
  updatedAt: string;
}

export interface ProjectData {
  id: string;
  name: string;
  isFlatRate: boolean;
  budgetByCategory: Record<ExpenseCategory, number>;
  tasks: Task[];
  moduleConfigs: ModuleConfig[];
}

export interface ProjectListItem {
  id: string;
  name: string;
  clientId: string | null;
  clientName: string | null;
  updated_at: string;
  taskCount: number;
  outstandingAmount: number;
}

export interface Client {
  id: string;
  name: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface FilmProjectRow {
  id: string;
  name: string;
  updated_at: string;
  project_data: ProjectData;
}
