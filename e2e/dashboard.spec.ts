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
  budgetAmount: 0,
  tasks: [
    { id: 'task-1', moduleId: 'Scripting', title: '第一支影片', status: '待收素材', amount: 0, isPaid: false, updatedAt: now },
    { id: 'task-2', moduleId: 'Scripting', title: '修改影片', status: '修改中', amount: 0, isPaid: false, updatedAt: now },
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
    projectList: [{ id: projectId, name: project.name, clientId, clientName: '測試客戶', updated_at: now, taskCount: 2, outstandingAmount: 0, outstandingReceivable: 0, outstandingPayable: 0 }],
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
  await page.getByText(project.name).click();

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
