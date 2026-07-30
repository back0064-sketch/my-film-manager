import { Task } from '@/types/project';

export type MonthlyFinanceReport = {
  month: string;
  received: number;
  paid: number;
  netCashFlow: number;
  outstandingReceivable: number;
  outstandingPayable: number;
  completed: Task[];
  outstanding: Task[];
  undatedCompleted: Task[];
};

const taskMonth = (task: Task) => (task.transactionDate ?? task.dueDate ?? task.updatedAt).slice(0, 7);

export function currentMonth(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split('-').map(Number);
  const shifted = new Date(year, monthNumber - 1 + offset, 1);
  return currentMonth(shifted);
}

export function buildMonthlyFinanceReport(tasks: Task[], month: string): MonthlyFinanceReport {
  const transactions = tasks.filter((task) => task.moduleId === 'Finance');
  const completed = transactions.filter((task) => task.isPaid && task.paidAt?.slice(0, 7) === month);
  const undatedCompleted = transactions.filter((task) => task.isPaid && !task.paidAt);
  const outstanding = transactions.filter((task) => !task.isPaid && taskMonth(task) <= month);
  const received = completed
    .filter((task) => task.transactionType === 'income')
    .reduce((sum, task) => sum + task.amount, 0);
  const paid = completed
    .filter((task) => task.transactionType !== 'income')
    .reduce((sum, task) => sum + task.amount, 0);
  const outstandingReceivable = outstanding
    .filter((task) => task.transactionType === 'income')
    .reduce((sum, task) => sum + task.amount, 0);
  const outstandingPayable = outstanding
    .filter((task) => task.transactionType !== 'income')
    .reduce((sum, task) => sum + task.amount, 0);

  return {
    month,
    received,
    paid,
    netCashFlow: received - paid,
    outstandingReceivable,
    outstandingPayable,
    completed,
    outstanding,
    undatedCompleted,
  };
}
