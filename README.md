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

每日備份排程會先執行一次最小 Supabase heartbeat，再匯出資料；因此同一支排程同時負責資料庫活動訊號與備份。這只能降低 Free Plan 因長時間無活動而暫停的機率，不能取代付費方案的可用性保證。若網站是正式營運工具，建議升級 Supabase Pro，並把 Google 試算表當第二份可讀備份，不要把它當成回寫來源。

## JSONB 拆分與正式 Migration

目前 `film_projects.project_data` 仍保留為原始資料來源。`supabase/migrations/20260917023844_normalize_project_data.sql` 會以增量方式建立：

- `project_tasks`：任務、截止日、收支與付款狀態欄位。
- `project_settlement_batches`：每個專案、每個月份的獨立請款批次。
- `project_settlement_items`：批次內每支影片與單價。
- `backup_runs`、`overdue_notification_deliveries`：自動化的稽核與去重紀錄。

Migration 會回填既有 JSONB，但不刪除或改寫 `project_data`；儲存專案後，網站也會嘗試同步正規化投影，若正式庫尚未套用 migration 則自動保留舊流程。因正式庫目前沒有可靠的 migration 歷史，請先在 staging／分支驗證，再用 Supabase CLI 的 `db push` 或 SQL Editor 套用，並在套用後核對各表筆數與 RLS Advisors。

套用後可在 SQL Editor 做唯讀核對：

```sql
select 'projects' as source, count(*) from public.film_projects
union all select 'tasks', count(*) from public.project_tasks
union all select 'settlement_batches', count(*) from public.project_settlement_batches
union all select 'settlement_items', count(*) from public.project_settlement_items;

select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('project_tasks', 'project_settlement_batches', 'project_settlement_items', 'backup_runs', 'overdue_notification_deliveries');
```

## 逾期通知自動化

Vercel 每日約台北時間 10:53 呼叫 `/api/cron/overdue-notifications`。它會優先讀正規化任務／月結表，未套用 migration 時才退回讀 JSONB；同一位 owner、同一天、同一組逾期項目只寄一次，避免重複轟炸。

要啟用 Email，Production 需另外設定：

`RESEND_API_KEY`、`RESEND_FROM`（已驗證的寄件網域）、`OVERDUE_NOTIFICATION_TO`（可用逗號分隔多個收件人）、`OVERDUE_NOTIFICATION_OWNER_ID`（要通知的 owner UUID）。最後一個變數是刻意保留的資料隔離閘門；多帳號環境不可省略，避免把不同使用者的逾期資料混寄。未設定完整時，排程會回報 `missing_configuration`，不會嘗試寄信。

## 每日工作指揮與跨專案追款

登入後的大廳會先顯示每日工作指揮：將各專案尚未完成的任務依逾期、今天、近期與未排期限排序；同一區塊也會彙整各專案及各月份月結的待收款，並標示到期與逾期狀態。指揮台只顯示摘要，實際編輯仍回到專案看板或財務頁，Supabase 仍是唯一正式資料來源。

大廳會保存一份小型摘要快取，讓最近使用的專案與指揮清單先出現，再於背景向雲端更新；快取不取代 Supabase，也不會把 Google 試算表的手動修改寫回資料庫。
