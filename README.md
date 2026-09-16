# 影視製片控制台

以 Next.js 與 Supabase 建立的影視專案、製作進度與款項管理工具。

## 本機開發

```bash
npm ci
npm run dev
```

開啟 [http://localhost:3000](http://localhost:3000)。請先複製 `.env.example` 為 `.env.local`，並填入 Supabase 專案設定。

## 驗證

```bash
npm run test
npm run lint
npm run build
```

GitHub Actions 會在推送到 `main` 或建立以 `main` 為目標的 Pull Request 時，自動執行以上檢查。

## 部署至 Vercel

1. 前往 [Vercel](https://vercel.com/new)，以 GitHub 登入後匯入 `back0064-sketch/my-film-manager`。
2. 在 **Environment Variables** 新增 `.env.example` 所列的兩個變數，分別填入 Supabase 專案 URL 與匿名金鑰。
3. 按下 **Deploy**。之後推送到 `main` 會自動部署，Pull Request 則會建立預覽部署。

部署完成後，請在 Supabase 的 Authentication URL 設定中加入 Vercel 網址，讓登入 Cookie 與重新導向可正常運作。

## Supabase 每日備份到 Google 試算表

網站仍以 Supabase 作為正式資料來源。Vercel 每天約在台北時間 10:23 呼叫 `/api/cron/backup-to-sheets`，把專案、客戶、任務與月結款項單向匯出到 Google 試算表；試算表的手動修改不會回寫 Supabase。

除原本的 Supabase 公開設定外，Production 需設定 `.env.example` 所列的五個伺服器端變數。Google 試算表必須共用給該服務帳號的 Email，權限設為「編輯者」。所有私密金鑰只能放在 Vercel Environment Variables 或未追蹤的 `.env.local`，不可提交 Git。
