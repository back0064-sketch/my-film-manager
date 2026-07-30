import { describe, expect, it } from 'vitest';
import { buildMonthlyFinanceReport, shiftMonth } from '@/lib/projects/finance-report';
import { Task } from '@/types/project';

const task = (values: Partial<Task> & Pick<Task, 'id' | 'amount'>): Task => ({
  moduleId: 'Finance',
  title: values.id,
  status: '待處理',
  isPaid: false,
  updatedAt: '2026-07-01T00:00:00.000Z',
  ...values,
});

describe('月份財務報表', () => {
  it('以實際收付月份計算現金流，並統計月底未結清', () => {
    const tasks = [
      task({ id: 'received', amount: 12000, transactionType: 'income', isPaid: true, transactionDate: '2026-06-20', paidAt: '2026-07-03T10:00:00.000Z' }),
      task({ id: 'paid', amount: 3000, transactionType: 'expense', isPaid: true, paidAt: '2026-07-08T10:00:00.000Z' }),
      task({ id: 'old-receivable', amount: 5000, transactionType: 'income', transactionDate: '2026-06-15' }),
      task({ id: 'current-payable', amount: 1000, transactionType: 'expense', dueDate: '2026-07-31' }),
      task({ id: 'future-payable', amount: 9000, transactionType: 'expense', dueDate: '2026-08-01' }),
      task({ id: 'legacy-paid', amount: 2000, transactionType: 'income', isPaid: true }),
    ];

    const report = buildMonthlyFinanceReport(tasks, '2026-07');

    expect(report).toMatchObject({
      received: 12000,
      paid: 3000,
      netCashFlow: 9000,
      outstandingReceivable: 5000,
      outstandingPayable: 1000,
    });
    expect(report.completed.map((item) => item.id)).toEqual(['received', 'paid']);
    expect(report.outstanding.map((item) => item.id)).toEqual(['old-receivable', 'current-payable']);
    expect(report.undatedCompleted.map((item) => item.id)).toEqual(['legacy-paid']);
  });

  it('可跨年度切換月份', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
});
