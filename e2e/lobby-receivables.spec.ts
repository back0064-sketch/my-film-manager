import { expect, test } from '@playwright/test';
import type { ProjectListItem } from '../types/project';

test('大廳金額與追款一致，讀取失敗時標示暫存資料', async ({ page }) => {
  const updated_at = '2026-11-18T02:00:00Z';
  const customer = { clientId: 'client-1', clientName: '測試客戶', updated_at, taskCount: 1, outstandingAmount: 0, outstandingPayable: 0 };
  const projects: ProjectListItem[] = [
    { ...customer, id: 'paid-project', name: '已入帳專案', outstandingReceivable: 0, receivableItems: [] },
    { ...customer, id: 'overdue-project', name: '逾期專案', outstandingReceivable: 2400, receivableItems: [{
      id: 'batch:b', projectId: 'overdue-project', projectName: '逾期專案', title: '10 月月結', amount: 2400,
      invoiceNumber: 'TEST-02', dueDate: '2026-11-10', source: 'batch', status: 'invoiced', updatedAt: updated_at,
    }] },
  ];
  await page.clock.setFixedTime(new Date(updated_at));
  await page.route('**/api/auth/session', (route) => route.fulfill({ json: { id: 'test-owner' } }));
  await page.route('**/api/auth/mfa', (route) => route.fulfill({ json: { currentLevel: 'aal1', nextLevel: 'aal1', factors: [] } }));
  await page.route('**/api/clients', (route) => route.fulfill({ json: [{ id: 'client-1', name: '測試客戶' }] }));
  let fail = false;
  await page.route('**/api/projects', (route) => fail ? route.fulfill({ status: 503, json: { error: '暫時無法讀取' } }) : route.fulfill({ json: projects }));

  const chase = page.getByRole('region', { name: '跨專案追款' });
  const finances = page.getByRole('region', { name: '財務隱私控制' });
  await page.goto('/');
  await expect(chase.getByText('逾期 1', { exact: true })).toBeVisible();
  await expect(chase.getByRole('button')).toHaveCount(1);
  await expect(chase.getByRole('button')).toContainText('TEST-02');
  await finances.getByRole('button', { name: '顯示金額' }).click();
  await expect(chase.getByText('NT$ 2,400').first()).toBeVisible();
  await expect(finances.getByText(/2,400/)).toBeVisible();

  fail = true;
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: '大廳目前無法取得雲端資料' })).toBeVisible();
  await expect(chase.getByRole('button')).toContainText('TEST-02');
});
