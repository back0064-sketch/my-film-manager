import { useState } from 'react';
import { Task } from '../types/project';
import { AVAILABLE_MODULES, ModuleId } from '../constants/modules';

interface Props {
  module: ModuleId; tasks: Task[]; statusList: string[]; isCollapsed: boolean; collapsedStatuses: string[];
  onToggleCollapse: () => void; onToggleStatusCollapse: (s: string) => void; onMoveStatus: (s: string, dir: 'up' | 'down') => void;
  onAddTask: (t: string, m: ModuleId, s: string) => void; onDeleteTask: (id: string) => void; onTaskClick: (id: string) => void;
  onAddStatus: (m: ModuleId, n: string) => void; onDeleteStatus: (m: ModuleId, n: string) => void;
}

export default function KanbanBoard({ 
  module, tasks, statusList, isCollapsed, collapsedStatuses, onToggleCollapse, onToggleStatusCollapse, onMoveStatus,
  onAddTask, onDeleteTask, onTaskClick, onAddStatus, onDeleteStatus 
}: Props) {
  const moduleInfo = AVAILABLE_MODULES.find(m => m.id === module);
  
  // 【新增：記錄使用者手動點擊展開的過去月份】
  const [expandedMonths, setExpandedMonths] = useState<string[]>([]);

  if (isCollapsed) {
    return (
      <div onClick={onToggleCollapse} className="flex-shrink-0 w-14 h-full bg-slate-900 text-white rounded-3xl flex items-center justify-center cursor-pointer hover:bg-blue-600 transition-all shadow-xl">
        <div className="[writing-mode:vertical-lr] font-black tracking-widest uppercase text-xs">{moduleInfo?.name}</div>
      </div>
    );
  }

  return (
    <div className="flex-shrink-0 w-80 bg-white/60 rounded-[32px] p-5 flex flex-col h-full border border-slate-200/80 backdrop-blur-sm relative">
      {/* 模組 Header */}
      <div className="flex justify-between items-center mb-6 px-2 pt-1">
        <h3 className="text-xl font-black text-slate-800 italic tracking-tight">{moduleInfo?.name}</h3>
        <div className="flex gap-2">
          <button onClick={onToggleCollapse} className="text-[10px] font-black bg-white text-slate-500 px-3 py-1.5 rounded-xl hover:bg-slate-200 hover:text-slate-700 transition-colors border border-slate-200 shadow-sm">收起</button>
          <button onClick={() => { const n = window.prompt("新增欄位名稱："); if (n) onAddStatus(module, n); }} className="text-[10px] font-black bg-slate-800 text-white px-3 py-1.5 rounded-xl hover:bg-blue-600 transition-all shadow-sm">+ 欄位</button>
        </div>
      </div>

      {/* 欄位清單區 */}
      <div className="flex-1 overflow-x-hidden overflow-y-auto space-y-5 pr-1 no-scrollbar pb-10">
        {statusList.map((status, statusIndex) => {
          const isStatusCollapsed = collapsedStatuses?.includes(status);
          const isFinance = module === 'Finance';
          const isLastStatus = statusIndex === statusList.length - 1; // 是否為最後一欄 (完成支付)

          if (isStatusCollapsed) {
            return (
              <div key={status} onClick={() => onToggleStatusCollapse(status)} className="w-full bg-slate-100 hover:bg-slate-200 rounded-[20px] p-4 flex items-center justify-between cursor-pointer transition-all group shadow-sm">
                <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest truncate">{status}</span>
                <span className="text-[10px] font-bold text-slate-400 group-hover:text-slate-800 transition-colors bg-white px-2 py-1 rounded-md shadow-sm">展開 +</span>
              </div>
            );
          }

          return (
            <div key={status} className="bg-slate-100 rounded-[28px] p-4 space-y-4">
              {/* 欄位 Header */}
              <div className="flex justify-between items-center group/title px-1">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black text-slate-700 uppercase tracking-[0.1em]">{status}</span>
                  <div className="flex gap-[2px] bg-slate-200/80 p-[2px] rounded-md">
                    <button onClick={() => onMoveStatus(status, 'up')} className="text-[9px] font-black text-slate-500 hover:text-slate-900 hover:bg-white px-1.5 rounded transition-all">↑</button>
                    <button onClick={() => onMoveStatus(status, 'down')} className="text-[9px] font-black text-slate-500 hover:text-slate-900 hover:bg-white px-1.5 rounded transition-all">↓</button>
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                  <button onClick={() => onToggleStatusCollapse(status)} className="text-[10px] text-slate-400 hover:text-slate-800 font-bold transition-colors">收起</button>
                  <button onClick={() => onDeleteStatus(module, status)} className="text-[10px] text-slate-400 hover:text-red-500 font-bold opacity-0 group-hover/title:opacity-100 transition-opacity">✕</button>
                </div>
              </div>
              
              {/* 任務卡片區 */}
              <div className="space-y-3">
                {/* 【智慧財務分流排版引擎】 */}
                {isFinance && isLastStatus ? (
                  (() => {
                    const columnTasks = tasks.filter(t => t.status === status);
                    
                    // A. 依照月份將任務分組
                    const groups: Record<string, Task[]> = {};
                    columnTasks.forEach(t => {
                      let monthKey = "未分類";
                      const dateSource = t.paidAt || t.updatedAt;
                      if (dateSource) {
                        const d = new Date(dateSource);
                        if (!isNaN(d.getTime())) {
                          monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                        }
                      }
                      if (!groups[monthKey]) groups[monthKey] = [];
                      groups[monthKey].push(t);
                    });

                    // B. 取得當前真實月份
                    const today = new Date();
                    const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
                    const sortedMonths = Object.keys(groups).sort((a, b) => b.localeCompare(a)); // 最新月份在最上面

                    if (columnTasks.length === 0) {
                      return <div className="text-center py-2 text-[10px] font-bold text-slate-400 italic">目前無完款紀錄</div>;
                    }

                    // C. 渲染分月群組
                    return sortedMonths.map(month => {
                      const isCurrentMonth = month === currentMonthStr;
                      const isExpanded = isCurrentMonth || expandedMonths.includes(month);
                      
                      // 格式化顯示名稱 (例如: 2026年05月)
                      const [year, partMonth] = month.split('-');
                      const displayTitle = `${year}年${partMonth}月`;

                      return (
                        <div key={month} className="space-y-2 border-t border-slate-200/50 pt-2 first:border-none first:pt-0">
                          {/* 月份折疊標頭 */}
                          <div 
                            onClick={() => {
                              if (isCurrentMonth) return; // 當月禁止收起
                              setExpandedMonths(prev => prev.includes(month) ? prev.filter(m => m !== month) : [...prev, month]);
                            }}
                            className={`flex justify-between items-center px-2 py-1.5 rounded-xl text-[10px] font-black cursor-pointer transition-colors
                              ${isCurrentMonth ? 'bg-emerald-100 text-emerald-800 cursor-default' : 'bg-slate-200/60 text-slate-600 hover:bg-slate-200'}`}
                          >
                            <span>{displayTitle} {isCurrentMonth && "(當月帳款)"}</span>
                            {!isCurrentMonth && <span>{isExpanded ? "收起 ▴" : "展開 ▾"}</span>}
                          </div>

                          {/* 月份內部的卡片清單 */}
                          {isExpanded && (
                            <div className="space-y-2.5 pt-1 animate-fadeIn">
                              {groups[month].map(task => (
                                <div 
                                  key={task.id} 
                                  onClick={() => onTaskClick(task.id)} 
                                  className="group p-4 rounded-[20px] bg-emerald-50/80 border border-emerald-200 shadow-sm transition-all relative cursor-pointer hover:shadow-md"
                                >
                                  <div className="flex justify-between items-start gap-2">
                                    <div className="text-sm font-bold leading-snug text-emerald-700">{task.title}</div>
                                    {task.amount !== undefined && (
                                      <div className="text-[10px] font-black px-2 py-1 rounded-lg shrink-0 bg-emerald-200 text-emerald-800">
                                        ${task.amount.toLocaleString()}
                                      </div>
                                    )}
                                  </div>
                                  <button onClick={(e) => { e.stopPropagation(); if(confirm("確定刪除此項目？")) onDeleteTask(task.id); }} className="absolute -top-2 -right-2 w-6 h-6 bg-white border border-slate-200 shadow-md rounded-full flex items-center justify-center text-red-500 opacity-0 group-hover:opacity-100 transition-all">✕</button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()
                ) : (
                  // --- 一般模組或其他欄位：維持原樣輸出 ---
                  <>
                    {tasks.filter(t => t.status === status).map(task => (
                      <div key={task.id} onClick={() => onTaskClick(task.id)} className="group p-4 rounded-[20px] bg-white border border-slate-200 shadow-sm hover:border-blue-400 hover:shadow-md transition-all relative cursor-pointer">
                        <div className="text-sm font-bold leading-snug text-slate-800">{task.title}</div>
                        <button onClick={(e) => { e.stopPropagation(); if(confirm("確定刪除此項目？")) onDeleteTask(task.id); }} className="absolute -top-2 -right-2 w-6 h-6 bg-white border border-slate-200 shadow-md rounded-full flex items-center justify-center text-red-500 opacity-0 group-hover:opacity-100 transition-all">✕</button>
                      </div>
                    ))}
                    {tasks.filter(t => t.status === status).length === 0 && (
                      <div className="text-center py-2 text-[10px] font-bold text-slate-400 italic">目前無任務</div>
                    )}
                  </>
                )}
              </div>
              
              {/* 新增任務按鈕 */}
              <button 
                onClick={() => { const t = window.prompt(`在「${status}」新增項目：`); if (t) onAddTask(t, module, status); }} 
                className="w-full py-2.5 text-[11px] font-black text-slate-500 bg-slate-200/50 hover:bg-slate-200 rounded-[16px] transition-colors"
              >
                + 新增任務
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}