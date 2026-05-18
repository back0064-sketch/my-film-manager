import { useState } from 'react';
import { Task } from '../types/project';

interface Props {
  task: Task | null;
  allTasks: Task[];
  statusList: string[];
  onClose: () => void;
  onUpdateTask: (id: string, updates: Partial<Task>) => void;
}

export default function TaskDetailSidebar({ task, allTasks, statusList, onClose, onUpdateTask }: Props) {
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [tempNote, setTempNote] = useState("");

  if (!task) return null;
  const isFinance = task.moduleId === 'Finance';
  const rawAmount = task.amount || 0;
  const totalAmount = task.isTaxInclusive ? rawAmount : Math.round(rawAmount * 1.05);

  const saveNote = () => { onUpdateTask(task.id, { note: tempNote }); setIsEditingNote(false); };

  // 【新增：將 ISO 時間字串轉換為本地 HTML 日期格式 YYYY-MM-DD】
  const getLocalDateValue = (isoString?: string) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const date = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${date}`;
  };

  return (
    <div className="fixed top-0 right-0 w-[420px] h-full bg-white shadow-[-20px_0_50px_rgba(0,0,0,0.1)] z-50 p-8 overflow-y-auto border-l border-slate-100">
      {/* 側邊欄 Header */}
      <div className="flex justify-between items-start mb-8 text-slate-900">
        <div className="flex-1">
          <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{isFinance ? '財務紀錄' : '任務詳情'}</span>
          <h2 onClick={() => { const n = window.prompt("修改名稱：", task.title); if(n) onUpdateTask(task.id, {title: n}); }} className="text-3xl font-black mt-1 leading-tight cursor-pointer hover:text-blue-600 transition-colors">{task.title}</h2>
        </div>
        <button onClick={onClose} className="p-2 text-slate-300 hover:text-slate-900 transition-colors">✕</button>
      </div>

      <div className="space-y-10">
        {/* 進度狀態調整 */}
        <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 text-slate-900">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">當前進度狀態</label>
          <select value={task.status} onChange={(e) => onUpdateTask(task.id, { status: e.target.value })} className="mt-3 w-full bg-white border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-900 outline-none">
            {statusList.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* 財務專屬模組區塊 */}
        {isFinance && (
          <div className="space-y-4">
            <div className="bg-slate-900 rounded-[32px] p-8 text-white shadow-xl">
               <div className="flex justify-between items-center mb-4">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">金額 (TWD)</label>
                  <button onClick={() => onUpdateTask(task.id, { isTaxInclusive: !task.isTaxInclusive })} className="text-[10px] font-bold text-blue-400">{task.isTaxInclusive ? '含稅' : '未稅'}</button>
               </div>
               <div className="flex items-center gap-4">
                  <span className="text-4xl font-black text-blue-500">$</span>
                  <input type="number" value={task.amount || ''} onChange={(e) => onUpdateTask(task.id, { amount: Number(e.target.value) })} className="bg-transparent text-5xl font-black focus:outline-none w-full text-white" />
               </div>
               <div className="mt-4 flex justify-between items-center text-sm font-bold text-slate-400"><span>總計應付額</span><span className="text-xl text-white">${totalAmount.toLocaleString()}</span></div>
            </div>
            
            {/* 支付開關按鈕 */}
            <button onClick={() => onUpdateTask(task.id, { isPaid: !task.isPaid })} className={`w-full py-4 rounded-2xl font-black transition-all ${task.isPaid ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
              {task.isPaid ? '✓ 已完成支付' : '待支付'}
            </button>

            {/* 【新增功能：如果已支付，顯示付款日期選擇器，允許補登過去月份】 */}
            {task.isPaid && (
              <div className="bg-slate-50 p-5 rounded-[24px] border border-slate-100 text-slate-900 mt-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">實際付款日期 (可調整回溯月份)</label>
                <input 
                  type="date" 
                  value={getLocalDateValue(task.paidAt)} 
                  onChange={(e) => {
                    if (e.target.value) {
                      // 建立所選日期的物件並儲存為 ISO 字串
                      const selectedDate = new Date(e.target.value);
                      onUpdateTask(task.id, { paidAt: selectedDate.toISOString() });
                    }
                  }} 
                  className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-800 outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
            )}
          </div>
        )}

        {/* 詳細備註欄 */}
        <div className="space-y-4">
           <div className="flex justify-between items-center">
             <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-slate-900">詳細備註 / 摘要</label>
             {!isEditingNote ? (
               <button onClick={() => { setTempNote(task.note || ""); setIsEditingNote(true); }} className="text-[10px] font-black text-blue-600">編輯內容</button>
             ) : (
               <div className="flex gap-2">
                 <button onClick={() => setIsEditingNote(false)} className="text-[10px] font-black text-slate-400 font-sans">取消</button>
                 <button onClick={saveNote} className="text-[10px] font-black text-white bg-blue-600 px-3 py-1 rounded-full font-sans">儲存</button>
               </div>
             )}
           </div>
           {isEditingNote ? (
             <textarea autoFocus value={tempNote} onChange={(e) => setTempNote(e.target.value)} className="w-full min-h-[200px] p-5 bg-slate-50 border border-blue-200 rounded-2xl text-sm font-medium text-slate-900 outline-none resize-none font-sans" />
           ) : (
             <div onClick={() => { setTempNote(task.note || ""); setIsEditingNote(true); }} className="text-sm text-slate-600 bg-slate-50 p-6 rounded-[24px] border border-slate-100 cursor-pointer whitespace-pre-wrap font-sans">{task.note || "點擊以新增內容..."}</div>
           )}
        </div>

        {/* 檔案連結 */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-slate-900">檔案連結</label>
            <button onClick={() => {
              const t = window.prompt("連結名稱："); const u = window.prompt("URL：", "https://");
              if (t && u) onUpdateTask(task.id, { assets: [...(task.assets || []), { id: crypto.randomUUID(), title: t, url: u }] });
            }} className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-md">+ 新增連結</button>
          </div>
          <div className="space-y-2">
            {task.assets?.map(l => (
              <div key={l.id} className="flex items-center justify-between group p-3 bg-white border border-slate-100 rounded-xl hover:border-blue-200">
                <a href={l.url} target="_blank" rel="noreferrer" className="text-sm font-bold text-slate-700 truncate hover:text-blue-600 underline">🔗 {l.title}</a>
                <button onClick={() => onUpdateTask(task.id, { assets: task.assets.filter(x => x.id !== l.id) })} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500">✕</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}