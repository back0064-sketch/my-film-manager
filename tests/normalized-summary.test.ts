import { describe, expect, it } from 'vitest';
import { buildNormalizedProjectList, NormalizedBatchSummaryRow, NormalizedTaskSummaryRow, ProjectListMetadataRow } from '@/lib/projects/normalized-summary';

const metadata: ProjectListMetadataRow[] = [{ id: 'p1', name: '正規化專案', client_id: null, updated_at: '2026-09-17T00:00:00.000Z', clients: null }];
const tasks: NormalizedTaskSummaryRow[] = ([
  { project_id: 'p1', task_id: 't1', module_id: 'Scripting', title: '待剪輯', status: '修改中', is_completed: false, due_date: '2026-09-18', transaction_type: null, amount: 0, is_paid: false, ready_for_collection: false, invoice_number: null, transaction_date: null, updated_at: '2026-09-17T00:00:00.000Z', unit_price: null, delivered_at: null, settlement_batch_id: null, archived_at: null },
  { project_id: 'p1', task_id: 't2', module_id: 'Finance', title: '攝影師費用', status: '待付', is_completed: false, due_date: null, transaction_type: 'expense', amount: '2500', is_paid: false, ready_for_collection: false, invoice_number: null, transaction_date: null, updated_at: null, unit_price: null, delivered_at: null, settlement_batch_id: null, archived_at: null },
  { project_id: 'p1', task_id: 't3', module_id: 'Finance', title: '本月影片款', status: '待收', is_completed: false, due_date: '2026-09-20', transaction_type: 'income', amount: 8000, is_paid: false, ready_for_collection: true, invoice_number: 'INV-1', transaction_date: null, updated_at: null, unit_price: null, delivered_at: null, settlement_batch_id: null, archived_at: null },
] satisfies Omit<NormalizedTaskSummaryRow, 'source_project_updated_at'>[]).map((task) => ({ ...task, source_project_updated_at: metadata[0].updated_at }));
const batches: NormalizedBatchSummaryRow[] = [{ project_id: 'p1', batch_id: 'b1', month: '2026-09', total: 12000, status: 'invoiced', created_at_source: '2026-09-17', invoice_date: '2026-09-17', invoice_number: 'INV-2', due_date: '2026-09-30', updated_at: '2026-09-17T00:00:00.000Z', source_project_updated_at: metadata[0].updated_at }];

describe('正規化大廳摘要', () => {
  it('只用摘要列計算任務、待收與待付', () => {
    const [project] = buildNormalizedProjectList(metadata, tasks, batches);
    expect(project.taskCount).toBe(3);
    expect(project.outstandingPayable).toBe(2500);
    expect(project.outstandingReceivable).toBe(20000);
    expect(project.workCommandItems?.[0].title).toBe('待剪輯');
    expect(project.receivableItems?.map((item) => item.amount)).toEqual([8000, 12000]);
  });

  it('正規化摘要可標示等回覆和預計結案日，歸檔案保留待請款', () => {
    const project = { ...metadata[0], waiting_task_ids: ['t1'], planned_close_date: '2026-09-24' };
    const productionAndIncome = [...tasks, {
      ...tasks[2], task_id: 'ready', invoice_number: null, status: '待請款', linked_task_id: 't1',
    }];
    const [active] = buildNormalizedProjectList([project], productionAndIncome, batches, '2026-09-18');
    expect(active.plannedCloseDate).toBe('2026-09-24');
    expect(active.workCommandItems?.[0]).toMatchObject({ taskId: 't1', waitingForClient: true });
    expect(active.commandCounts?.tasks).toMatchObject({ today: 1, waiting: 1 });
    const [archived] = buildNormalizedProjectList([{ ...project, archived_at: metadata[0].updated_at }], productionAndIncome, batches, '2026-09-18');
    expect(archived.workCommandItems).toEqual([]);
    expect(archived.commandCounts?.receivables).toMatchObject({ all: 3, invoiced: 2, pending: 1 });
  });
});
