export const MODULES = [
  { id: 'Scripting', name: '✍️ 腳本階段' },
  { id: 'OnSite', name: '🎥 拍攝現場' },
  { id: 'PostProduction', name: '✂️ 後期剪輯' },
  { id: 'Finance', name: '💰 財務帳目' },
] as const;

export type ModuleId = (typeof MODULES)[number]['id'];

export interface ModuleConfig {
  moduleId: ModuleId;
  customStatuses: string[];
}

export interface Task {
  id: string;
  moduleId: ModuleId;
  title: string;
  status: string;
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
  tasks: Task[];
  moduleConfigs: ModuleConfig[];
}

export interface ProjectListItem {
  id: string;
  name: string;
  updated_at: string;
}

export interface FilmProjectRow extends ProjectListItem {
  project_data: ProjectData;
}
