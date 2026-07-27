export const MODULES = [
  { id: 'Scripting', name: '🎬 專案主流程' },
  { id: 'OnSite', name: '🎥 拍攝／執行' },
  { id: 'PostProduction', name: '✂️ 後期／交付' },
  { id: 'Finance', name: '💰 財務帳目' },
] as const;

export const WORKSPACE_MODULES = [MODULES[0], MODULES[3]] as const;

export type ModuleId = (typeof MODULES)[number]['id'];

export const PROJECT_TYPES = [
  { id: 'general', name: '一般製片', description: '使用標準製片流程' },
  { id: 'shortVideoEditing', name: '短影音剪輯', description: '大量、純剪輯、月結案件' },
  { id: 'longVideoEditing', name: '長影音剪輯', description: '剪輯進度與修改審帶' },
  { id: 'programPlanning', name: '節目企劃', description: '田調、場勘、腳本、拍攝與 RD' },
  { id: 'director', name: '導演', description: '腳本、分鏡與播出結款' },
] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number]['id'];
export type TransactionType = 'income' | 'expense';

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
  transactionType?: TransactionType;
  counterparty?: string;
  invoiceNumber?: string;
  paymentMethod?: string;
  receiptUrl?: string;
  transactionDate?: string;
  readyForCollection?: boolean;
  amount: number;
  isPaid: boolean;
  linkedTaskId?: string;
  previousStatus?: string;
  paidAt?: string;
  updatedAt: string;
}

export type MonthlySettlementStatus = 'pending' | 'invoiced' | 'paid';

export interface MonthlySettlement {
  id: string;
  month: string;
  deliveredCount: number;
  unitPrice: number;
  status: MonthlySettlementStatus;
  invoiceDate?: string;
  paidAt?: string;
  notes?: string;
}

export interface ProjectData {
  id: string;
  name: string;
  projectType: ProjectType;
  isFlatRate: boolean;
  monthlySettlements: MonthlySettlement[];
  /** Kept only to migrate projects saved before monthly settlement history was added. */
  monthlySettlement?: MonthlySettlement;
  budgetAmount: number;
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
  outstandingReceivable: number;
  outstandingPayable: number;
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
