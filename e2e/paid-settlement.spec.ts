import { expect, test } from '@playwright/test';

test('修正交付日期並補登已收款影片，保留原月結金額', async ({ page }) => {
  const projectId = '11111111-1111-4111-8111-111111111111';
  const now = '2026-11-18T02:00:00Z';
  const project = {
    id: projectId, name: '補登測試', projectType: 'shortVideoEditing', defaultUnitPrice: 1000, syncVersion: now,
    tasks: [{ id: 'late', title: '漏登影片', moduleId: 'Scripting', status: '已交付', deliveredAt: '2026-11-18', updatedAt: now }],
    moduleConfigs: [{ moduleId: 'Scripting', customStatuses: ['待交付', '已交付'] }],
    settlementBatches: [{ id: 'aug', month: '2026-08', status: 'paid', paidAt: '2026-08-25T02:00:00Z', createdAt: '2026-08-25T02:00:00Z', adjustment: 0, subtotal: 5000, total: 5000, items: [{ taskId: 'original', title: '原批影片', deliveredAt: '2026-08-18', unitPrice: 5000 }] }],
  };
  await page.clock.setFixedTime(new Date(now));
  await page.route('**/api/auth/session', (route) => route.fulfill({ json: { id: 'test-owner' } }));
  await page.route('**/api/auth/mfa', (route) => route.fulfill({ json: { factors: [], currentLevel: 'aal1', nextLevel: 'aal1' } }));
  await page.route('**/api/clients', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/projects', (route) => route.fulfill({ json: [{ id: projectId, name: project.name, clientId: null, updated_at: now, taskCount: 1, outstandingAmount: 0, outstandingPayable: 0, outstandingReceivable: 0 }] }));
  await page.route(`**/api/projects/${projectId}`, (route) => route.fulfill({ json: route.request().method() === 'PUT' ? route.request().postDataJSON() : project }));

  await page.goto('/');
  await page.getByRole('navigation', { name: '工作區導覽' }).getByRole('button', { name: '專案', exact: true }).click();
  await page.getByRole('heading', { name: project.name }).click();
  await page.getByRole('button', { name: '財務帳目', exact: true }).click();
  await page.getByRole('button', { name: '顯示金額' }).click();
  const settlement = page.getByRole('region', { name: '專案月結' });
  await settlement.getByText('修正交付日期', { exact: true }).click();
  await settlement.getByLabel('漏登影片的交付日期').fill('2026-08-19');
  await settlement.getByRole('button', { name: '儲存日期' }).click();
  await expect(settlement.getByLabel('結算月份')).toHaveValue('2026-08');
  const saving = page.waitForRequest((request) => request.method() === 'PUT' && request.postDataJSON().settlementBatches[0].includedDeliveries?.length === 1);
  await settlement.getByRole('button', { name: '補登至已收款月結' }).click();
  await settlement.getByRole('button', { name: '確認補登', exact: true }).click();
  await expect(settlement.getByText('漏登影片 · 2026-08-19')).toBeVisible();
  await expect(settlement.getByRole('paragraph').filter({ hasText: /^NT\$ 5,000$/ })).toBeVisible();
  await expect(settlement.getByRole('button', { name: '補登至已收款月結' })).toHaveCount(0);
  const saved = (await saving).postDataJSON();
  expect(saved.settlementBatches[0]).toMatchObject({ total: 5000, status: 'paid', items: [{ taskId: 'original' }] });
});
