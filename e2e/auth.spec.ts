import { expect, test } from '@playwright/test';

test('重設密碼只連本站 API，網路失敗後可重新提交', async ({ page }) => {
  await page.route('**/api/auth/session', route => route.fulfill({ json: { id: 'test-owner' } }));
  let attempts = 0;
  await page.route('**/api/auth/password', async route => {
    attempts += 1;
    if (attempts === 1) return route.abort('failed');
    return route.fulfill({ json: { updated: true, signedOut: true } });
  });
  const externalAuth: string[] = [];
  page.on('request', request => { if (request.url().includes('.supabase.co')) externalAuth.push(request.url()); });
  await page.goto('/auth/reset');
  await page.getByPlaceholder('新密碼（至少 8 個字元）').fill('test-password-123');
  await page.getByPlaceholder('再次輸入新密碼').fill('test-password-123');
  const button = page.getByRole('button', { name: '更新密碼', exact: true });
  await button.click();
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByText('密碼已更新，請回到登入頁使用新密碼登入。')).toBeVisible();
  expect(externalAuth).toEqual([]);
});

test('Google 登入依伺服器設定顯示', async ({ page }) => {
  await page.route('**/api/auth/session', route => route.fulfill({ json: null }));
  await page.route('**/api/auth/options', route => route.fulfill({ json: { googleEnabled: true } }));
  await page.goto('/');
  await expect(page.getByRole('link', { name: '使用 Google 帳號登入' })).toHaveAttribute('href', '/api/auth/google');
});
