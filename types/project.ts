import { ModuleId } from '../constants/modules';

export interface AssetLink {
  id: string;
  title: string;
  url: string;
}

export interface SubTask {
  id: string;
  title: string;
  isCompleted: boolean;
  subTasks: SubTask[];
}

export interface Task {
  id: string;
  moduleId: ModuleId;
  title: string;
  status: string;
  previousStatus?: string;
  note: string;
  subTasks: SubTask[];
  assets: AssetLink[];
  amount?: number;
  isTaxInclusive?: boolean;
  taxRate?: number;
  isPaid?: boolean;
  paidAt?: string;
  linkedTaskId?: string; // 互相綁定的任務 ID
  updatedAt: Date;
}

export interface ModuleConfig {
  moduleId: ModuleId;
  customStatuses: string[];
  collapsedStatuses: string[];
}

export interface FilmProject {
  id: string;
  clientName: string;
  projectName: string;
  enabledModules: ModuleId[];
  collapsedModules: ModuleId[];
  moduleConfigs: ModuleConfig[];
  tasks: Task[];
  isFlatRate?: boolean; // 【新增】是否為全包計費專案
  createdAt: Date;
}