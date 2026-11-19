'use client';

import { useState } from 'react';
import type { Task } from '@/types/project';
import { taipeiToday } from '@/lib/projects/work-command';

type Props = {
  compact: boolean;
  statuses: string[];
  tasks: Task[];
  waiting: Set<string>;
  onOpen: (id: string) => void;
  onMove: (id: string, status: string) => void;
  onAdd: (status: string, title: string) => void;
};

function stageTone(status: string, statuses: string[]) {
  if (status === statuses.at(-1)) return 'stage-done';
  if (/等|待收|待回|待確認/.test(status)) return 'stage-waiting';
  return status === statuses[0] ? 'stage-idle' : 'stage-active';
}

export function ProductionTasks({ compact, statuses, tasks, waiting, onOpen, onMove, onAdd }: Props) {
  const [view, setView] = useState<'list' | 'board'>('list');
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);
  const final = statuses.at(-1);
  const today = taipeiToday();
  const done = tasks.filter((task) => task.status === final);
  const active = tasks.filter((task) => task.status !== final).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  const startAdd = (status: string) => { setTitle(''); setAdding(status); };
  const addForm = adding !== null && <form className="task-compose" onSubmit={(event) => {
    event.preventDefault();
    if (!title.trim()) return;
    onAdd(adding, title.trim());
    setAdding(null);
  }}>
    <input autoFocus required aria-label="新任務名稱" placeholder="任務名稱" value={title} onChange={(event) => setTitle(event.target.value)} />
    <select aria-label="新增至階段" value={adding} onChange={(event) => setAdding(event.target.value)}>{statuses.map((s) => <option key={s}>{s}</option>)}</select>
    <button className="workspace-button workspace-button--primary px-3">新增</button>
    <button type="button" className="workspace-button px-3" onClick={() => setAdding(null)}>取消</button>
  </form>;
  function taskRow(task: Task) {
    const overdue = Boolean(task.dueDate && task.dueDate < today && task.status !== final);
    return <article key={task.id} className="production-row" draggable={view === 'board'} onDragStart={(event) => {
      event.dataTransfer.setData('text/plain', task.id);
      setDragging(task.id);
    }} onDragEnd={() => setDragging(null)}>
      <div className="min-w-0">
        <button className="task-name" onClick={() => onOpen(task.id)}>{task.title}</button>
        {(waiting.has(task.id) || task.assignee) && <p className="task-note">{[waiting.has(task.id) && '等客戶回覆', task.assignee].filter(Boolean).join(' · ')}</p>}
      </div>
      <select className={`task-stage ${stageTone(task.status, statuses)}`} aria-label={`${task.title}的任務狀態`} value={task.status} onChange={(event) => onMove(task.id, event.target.value)}>
        {statuses.map((s) => <option key={s}>{s}</option>)}
      </select>
      <span className={`task-date ${overdue ? 'text-work-danger' : 'text-work-muted'}`}>{overdue && '逾期 · '}{task.dueDate === today && task.status !== final && '今天 · '}{task.dueDate || '未排期限'}</span>
    </article>;
  }
  return <section className="project-task-board" aria-label="製作任務">
    <header className="tasks-toolbar">
      <h2>{view === 'list' ? '任務清單' : '製作看板'}</h2>
      <div role="group" aria-label="任務視圖" className="view-switch">{(['list','board'] as const).map((v) => <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>{v === 'list' ? '清單' : '看板'}</button>)}</div>
      <button disabled={!statuses.length} onClick={() => startAdd(statuses[0])} className="workspace-button workspace-button--primary px-4 py-2 text-sm font-semibold">＋ 新增任務</button>
    </header>
    {addForm}
    {view === 'list' ? <div className={compact ? "task-list compact" : "task-list"}>
      <div className="list-legend" aria-hidden="true"><span>任務名稱</span><span>製作階段</span><span>截止日期</span></div>
      {active.map(taskRow)}
      {!active.length && <p className="task-empty">目前沒有進行中的任務</p>}
      {done.length > 0 && <><button aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="completed-toggle">{expanded ? '▾' : '▸'} {final} · {done.length} 項</button>{expanded && done.map(taskRow)}</>}
    </div> : <div className="project-status-columns" tabIndex={0} aria-label="橫向製作看板">{statuses.map((status) => {
      const items = tasks.filter((t) => t.status === status);
      return <section key={status} className={`stage-column ${dragging ? 'accepts-drop' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
        event.preventDefault(); if (dragging) onMove(dragging, status); setDragging(null);
      }}>
        <header><strong>{status}</strong><span>{items.length}</span><button className="workspace-button" aria-label={`新增至${status}`} onClick={() => startAdd(status)}>＋</button></header>
        {items.length ? items.map(taskRow) : <p className="task-empty">尚無任務</p>}
      </section>;
    })}</div>}
  </section>;
}
