import { expect, Page, test } from '@playwright/test';

const projectId = '11111111-1111-4111-8111-111111111111';
const clientId = '22222222-2222-4222-8222-222222222222';
const now = '2026-07-27T00:00:00.000Z';
const project = {
  id: projectId,
  name: '手機測試專案',
  syncVersion: now,
  projectType: 'shortVideoEditing',
  isFlatRate: true,
  monthlySettlements: [],
  settlementBatches: [],
  budgetAmount: 0,
  defaultUnitPrice: 1000,
  tasks: [
    { id: 'task-1', moduleId: 'Scripting', title: '第一支影片', status: '待收素材', amount: 0, isPaid: false, updatedAt: now },
    { id: 'task-2', moduleId: 'Scripting', title: '修改影片', status: '修改中', amount: 0, isPaid: false, updatedAt: now },
    { id: 'task-3', moduleId: 'Scripting', title: '九月已交付', status: '已交付', amount: 0, unitPrice: 1500, deliveredAt: '2026-09-10T00:00:00.000Z', isPaid: false, updatedAt: now },
    { id: 'income-1', moduleId: 'Finance', title: '七月收入', status: '💰 已入帳', transactionType: 'income', amount: 12000, isPaid: true, paidAt: '2026-07-05T00:00:00.000Z', updatedAt: now },
    { id: 'expense-1', moduleId: 'Finance', title: '七月支出', status: '💰 已入帳', transactionType: 'expense', amount: 3000, isPaid: true, paidAt: '2026-07-08T00:00:00.000Z', updatedAt: now },
    { id: 'receivable-1', moduleId: 'Finance', title: '六月未收', status: '📝 待請款', transactionType: 'income', transactionDate: '2026-06-20', amount: 5000, isPaid: false, updatedAt: now },
  ],
  moduleConfigs: [
    { moduleId: 'Scripting', customStatuses: ['待收素材', '剪輯中', '待確認', '修改中', '已交付'] },
    { moduleId: 'OnSite', customStatuses: ['準備中', '完成'] },
    { moduleId: 'PostProduction', customStatuses: ['初剪', '完成'] },
    { moduleId: 'Finance', customStatuses: ['待請款', '審核中', '已入帳'] },
  ],
};

async function mockApi(page: Page) {
  await page.addInitScript(({ projectFixture, projectList, clientList, fixtureProjectId, fixtureClientId, version }) => {
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
    const originalFetch = window.fetch.bind(window);
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin);
      const method = input instanceof Request ? input.method : init?.method ?? 'GET';
      if (url.pathname === '/api/auth/session') return json({ id: 'user-1', email: 'tester@example.com' });
      if (url.pathname === '/api/clients' && method === 'GET') return json(clientList);
      if (url.pathname === `/api/clients/${fixtureClientId}` && method === 'DELETE') {
        (window as typeof window & { __deletedClient?: boolean }).__deletedClient = true;
        return new Response(null, { status: 204 });
      }
      if (url.pathname === '/api/projects' && method === 'GET') return json(projectList);
      if (url.pathname === `/api/projects/${fixtureProjectId}` && method === 'GET') return json(projectFixture);
      if (url.pathname === `/api/projects/${fixtureProjectId}` && method === 'PUT') {
        const body = input instanceof Request ? await input.clone().json() : JSON.parse(String(init?.body ?? '{}'));
        return json({ ...body, syncVersion: version });
      }
      return originalFetch(input, init);
    }) as typeof window.fetch;
  }, {
    projectFixture: project,
    projectList: [{ id: projectId, name: project.name, clientId, clientName: '測試客戶', updated_at: now, taskCount: 2, outstandingAmount: 7890, outstandingReceivable: 123456, outstandingPayable: 7890, workCommandItems: [{ taskId: 'task-2', projectId, projectName: project.name, clientName: '測試客戶', title: '修改影片', status: '修改中', moduleId: 'Scripting', dueDate: '2026-09-16', updatedAt: now }], receivableItems: [{ id: 'batch:1', projectId, projectName: project.name, clientName: '測試客戶', title: '2026-09 月結（3 支）', amount: 123456, dueDate: '2026-09-15', invoiceNumber: 'INV-09', source: 'batch', status: 'invoiced', updatedAt: now }] }],
    clientList: [{ id: clientId, name: '測試客戶', created_at: now, updated_at: now }],
    fixtureProjectId: projectId,
    fixtureClientId: clientId,
    version: now,
  });
}

test('手機以狀態選單切換單欄任務，不需要水平滑動', async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('heading', { name: project.name }).click();

  const selector = page.getByLabel('目前流程階段');
  await expect(selector).toBeVisible();
  await selector.selectOption('修改中');

  await expect(page.getByLabel('任務名稱：修改影片')).toBeVisible();
  await expect(page.getByLabel('任務名稱：第一支影片')).toBeHidden();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test('刪除客戶會呼叫 API 並從大廳移除客戶', async ({ page }) => {
  await mockApi(page);
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/');
  await page.getByRole('button', { name: '刪除客戶 測試客戶' }).click();

  await expect.poll(() => page.evaluate(() => (window as typeof window & { __deletedClient?: boolean }).__deletedClient)).toBe(true);
  await expect(page.getByRole('heading', { name: '測試客戶' })).toBeHidden();
});

test('大廳財務金額預設隱藏並可手動顯示', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  const financeSummary = page.getByRole('region', { name: '財務隱私控制' });
  await expect(financeSummary.getByLabel('財務金額已隱藏')).toBeVisible();
  await expect(financeSummary.getByText('NT$ 123,456')).toBeHidden();
  await expect(page.getByText('財務金額已隱藏')).toBeVisible();

  await financeSummary.getByRole('button', { name: '顯示金額' }).click();
  await expect(financeSummary.getByText('NT$ 123,456')).toBeVisible();
  await expect(page.getByText('待收 NT$ 123,456 · 待付 NT$ 7,890')).toBeVisible();
});

test('每日工作指揮台會優先顯示逾期工作與追款', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  const command = page.getByRole('region', { name: '每日工作指揮' });
  await expect(command).toBeVisible();
  await expect(command.getByText('已逾期').first()).toBeVisible();
  await expect(command.getByText('修改影片').first()).toBeVisible();
  await expect(command.getByText('INV-09')).toBeVisible();
  await command.getByRole('button', { name: /已逾期 修改影片/ }).click();
  await expect(page.getByRole('heading', { name: '專案摘要' })).toBeVisible();
});

test('財務頁可依實際收付月份顯示月報', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await page.getByRole('heading', { name: project.name }).click();
  await page.getByRole('button', { name: '💰 財務帳目' }).click();
  await page.getByLabel('報表月份').fill('2026-07');

  const report = page.getByRole('region', { name: '月份財務報表' });
  await expect(report.getByText('NT$ 12,000', { exact: true })).toBeVisible();
  await expect(report.getByText('NT$ 3,000', { exact: true })).toBeVisible();
  await expect(report.getByText('+NT$ 9,000', { exact: true })).toBeVisible();
  await expect(report.getByText('六月未收')).toBeVisible();
});

test('長期專案可將當月已交付影片結案並從看板封存', async ({ page }) => {
  await mockApi(page);
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/');
  await page.getByRole('heading', { name: project.name }).click();

  const settlement = page.getByRole('region', { name: '專案月結' });
  await settlement.getByLabel('結算月份').fill('2026-09');
  await expect(settlement.getByText('1 支待結案')).toBeVisible();
  await settlement.getByRole('button', { name: '完成本月結案' }).click();

  await expect(settlement.getByText('2026-09 · 1 支')).toBeVisible();
  await expect(page.getByLabel('任務名稱：九月已交付')).toBeHidden();
});

test('雲端較慢時仍會先顯示本機專案與快取內容', async ({ page }) => {
  await page.addInitScript(({ projectFixture, fixtureProjectId }) => {
    localStorage.setItem(fixtureProjectId, JSON.stringify(projectFixture));
    const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
    window.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin);
      if (url.pathname === '/api/auth/session') return json({ id: 'user-1', email: 'tester@example.com' });
      await new Promise((resolve) => setTimeout(resolve, 2000));
      if (url.pathname === '/api/projects') return json([]);
      if (url.pathname === '/api/clients') return json([]);
      if (url.pathname === `/api/projects/${fixtureProjectId}`) return json(projectFixture);
      return json({ error: 'not mocked' });
    }) as typeof window.fetch;
  }, { projectFixture: project, fixtureProjectId: projectId });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: project.name })).toBeVisible({ timeout: 1000 });
  await page.getByRole('heading', { name: project.name }).click();
  await expect(page.getByRole('heading', { name: '專案摘要' })).toBeVisible({ timeout: 1000 });
});
