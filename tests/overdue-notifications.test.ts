import { describe, expect, it } from 'vitest';
import {
  buildOverdueFingerprint,
  buildOverdueItemsFromNormalized,
  buildOverdueItemsFromProjects,
  formatOverdueDigest,
  renderOverdueHtml,
} from '@/lib/notifications/overdue';

describe('逾期通知資料', () => {
  it('從正規化資料列出逾期工作與月結，且排除已完成／已付款', () => {
    const items = buildOverdueItemsFromNormalized([
      { id: 'p1', name: '品牌影片', owner_id: 'owner-1', client_id: 'c1' },
    ], [
      { project_id: 'p1', task_id: 'late-work', module_id: 'Scripting', title: '補拍旁白', status: '剪輯中', is_completed: false, due_date: '2026-09-15', transaction_type: null, amount: 0, is_paid: false, settlement_batch_id: null, invoice_number: null, archived_at: null },
      { project_id: 'p1', task_id: 'paid', module_id: 'Finance', title: '已付款', status: '已入帳', is_completed: true, due_date: '2026-09-10', transaction_type: 'income', amount: 5000, is_paid: true, settlement_batch_id: null, invoice_number: null, archived_at: null },
      { project_id: 'p1', task_id: 'late-income', module_id: 'Finance', title: '尾款', status: '待請款', is_completed: false, due_date: '2026-09-12', transaction_type: 'income', amount: 8000, is_paid: false, settlement_batch_id: null, invoice_number: 'INV-09', archived_at: null },
      { project_id: 'p1', task_id: 'batched-income', module_id: 'Finance', title: '月結收入', status: '已請款', is_completed: false, due_date: '2026-09-12', transaction_type: 'income', amount: 8000, is_paid: false, settlement_batch_id: 'b1', invoice_number: null, archived_at: null },
    ], [
      { project_id: 'p1', batch_id: 'b1', month: '2026-09', total: 12000, status: 'invoiced', due_date: '2026-09-14', invoice_number: 'INV-B1' },
    ], new Map([['c1', '測試客戶']]), '2026-09-17');

    expect(items.map((item) => item.id)).toEqual(['task:p1:late-income', 'batch:p1:b1', 'task:p1:late-work']);
    expect(items[0]).toMatchObject({ category: '收款', amount: 8000, invoiceNumber: 'INV-09', clientName: '測試客戶' });
  });

  it('舊 JSONB 專案仍能產生逾期摘要', () => {
    const items = buildOverdueItemsFromProjects([
      {
        id: 'p1', name: '舊專案', owner_id: 'owner-1', client_id: 'c1', project_data: {
          id: 'p1', name: '舊專案', projectType: 'general', isFlatRate: false, budgetAmount: 0, defaultUnitPrice: 0,
          moduleConfigs: [{ moduleId: 'Scripting', customStatuses: ['待處理', '已完成'] }], monthlySettlements: [], settlementBatches: [],
          tasks: [{ id: 'late', moduleId: 'Scripting', title: '逾期腳本', status: '待處理', dueDate: '2026-09-01', amount: 0, isPaid: false, updatedAt: '2026-09-01' }],
        },
      },
    ], new Map([['c1', '舊客戶']]), '2026-09-17');

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ projectName: '舊專案', clientName: '舊客戶', category: '工作' });
  });

  it('指紋會隨逾期項目改變，郵件內容會跳脫 HTML', () => {
    const items = [{ id: 'task:p1:t1', projectId: 'p1', projectName: '<測試>', category: '工作' as const, title: '<script>', dueDate: '2026-09-15' }];
    expect(buildOverdueFingerprint('owner-1', '2026-09-17', items)).toBe(buildOverdueFingerprint('owner-1', '2026-09-17', items));
    expect(buildOverdueFingerprint('owner-1', '2026-09-17', items)).not.toBe(buildOverdueFingerprint('owner-1', '2026-09-17', [...items, { ...items[0], id: 'task:p1:t2' }]));
    expect(formatOverdueDigest(items, '2026-09-17')).toContain('逾期提醒');
    expect(renderOverdueHtml(items, '2026-09-17')).toContain('&lt;script&gt;');
  });
});
