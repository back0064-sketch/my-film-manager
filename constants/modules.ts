export const AVAILABLE_MODULES = [
  { id: 'PreProduction', name: '前期製作', defaultStatuses: [] },
  { id: 'Scripting', name: '企劃腳本', defaultStatuses: [] },
  { id: 'OnSite', name: '現場拍攝', defaultStatuses: [] },
  { id: 'PostProduction', name: '後期剪輯', defaultStatuses: [] },
  { id: 'Finance', name: '款項紀錄', defaultStatuses: [] },
] as const;

export type ModuleId = typeof AVAILABLE_MODULES[number]['id'];