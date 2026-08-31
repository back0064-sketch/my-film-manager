<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## 網站接管與跨裝置交接紀錄

> 最後核對：2026-08-31（Asia/Taipei）
>
> 本節是目前這個網站的接管與轉移基準。它記錄已確認的現況、已完成的修復、尚未處理的風險，以及新裝置重建步驟。不要把密碼、OTP、API 金鑰、Supabase secret/service-role key、`.env.local` 內容或任何環境變數值寫入本檔或 Git。

### 1. 唯一採用的專案來源

- 目前正式網站的工作副本：`C:\專案城市\my-film-manager-main`
- GitHub：`https://github.com/back0064-sketch/my-film-manager`
- Git remote：`origin` 指向上述 GitHub 儲存庫
- Production 分支：`main`
- 最後確認的 HEAD：`ac0497c406bc47e4ee561dab2132e585064b682a`
- 最後確認的 commit：`新增月份財務報表並強化安全性`
- Production：`https://my-film-manager.vercel.app/`
- Vercel 專案：`my-film-manager`，由 GitHub `main` 自動部署
- Supabase Production 專案：`back0064-sketch's Project`
- Supabase project ref：`xmbpkmxrhxobqixqdyep`
- Supabase 專案網址：`https://xmbpkmxrhxobqixqdyep.supabase.co`
- GitHub、Vercel、Supabase 的管理者身分均是 `back0064-sketch`；登入信箱不記錄在公開專案文件中。
- Vercel 需要的環境變數名稱只有：`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`。值只放在 Vercel 與新裝置自己的未追蹤 `.env.local`。

### 2. 已完成的接管健檢（已驗證）

- 本機 `main` 與 GitHub 遠端 `main` 一致；健檢當下沒有未提交程式修改。
- Vercel 最新 Production deployment 為 `READY`，來源是 GitHub `main` 與 commit `ac0497c`。
- GitHub Actions「測試、檢查與建置」最近一次成功。
- 本機驗證結果：5 個測試檔、23 項測試通過；ESLint 通過；Next.js Production Build 成功。
- 正式網站未登入時，`/api/projects` 與 `/api/clients` 都回傳 `401 請先登入`。
- 正式網站登入後可以讀取專案與客戶資料；Vercel runtime logs 曾確認 `/api/auth/session`、`/api/projects`、`/api/clients` 成功回傳 `200`。
- Supabase 專案目前狀態為 `Healthy`，region 為 `ap-northeast-1`，compute 為 `nano`。
- Supabase 正式資料表目前有 `clients`、`film_projects`；兩者均已啟用 RLS，且保留使用者擁有權規則：`Users manage own clients`、`Users manage own projects`。
- Supabase Auth 目前有 2 位使用者；Email provider 已啟用，註冊與 Email confirmation 已啟用。
- Auth Site URL 與 Redirect URLs 已指向 `https://my-film-manager.vercel.app`，並保留本機 `http://localhost:3000/**`。
- Production 回應包含 CSP、HSTS、`X-Frame-Options: DENY`、`X-Content-Type-Options: nosniff` 等安全標頭。

### 3. 已完成的 P0 修復（2026-08-31）

- Supabase `public.film_projects` 原本存在公開 Policy：`Allow public access for now`。
- 該 Policy 的設定是 `ALL`、Target role `public`、`USING (true)`；它會與使用者擁有權 Policy 形成過度寬鬆的 permissive 規則。
- 已依明確授權在 Supabase Dashboard 正式刪除這條 Policy。這是權限設定變更，不是資料列刪除；沒有刪除任何使用者、資料表或專案資料。
- 修復後驗證：Security Advisor 的 `RLS Policy Always True` 消失；Security Advisor 從 2 個 warnings 降為 1 個，Performance Advisor warnings 降為 0。
- 剩餘的 Security Advisor warning 是 `Leaked Password Protection Disabled`，尚未處理。
- GitHub 目前沒有對應的正式 Migration 歷史；這次修復已在 Production 生效，但之後應建立可重建的 Migration／部署流程，避免資料庫設定再次漂移。

### 4. 尚未完成的風險與待辦（依優先順序）

#### P1：備份與可用性

- Supabase 組織仍是 Free Plan；Dashboard 顯示 `No backups`，Free Plan 不含可下載的專案備份。
- 專案曾因低活動被暫停，這次已恢復；若維持 Free，未來仍可能再次因低活動暫停。正式營運應評估 Pro 或另外建立可驗證的備份方案。

#### P1：帳號復原

- Supabase 組織目前只有 1 位 Owner。
- 該 Owner 的 MFA 在健檢時顯示 `Disabled`；應由帳號持有人自行啟用 MFA 並安全保存復原方式。
- 不要將密碼、復原碼、OTP 或 API key 寫入本檔、GitHub issue、commit、聊天訊息或交接包。

#### P1：資料庫規格漂移

- Supabase Dashboard 顯示正式資料庫沒有 Migration 紀錄。
- GitHub 的 `supabase/schema.sql` 與正式資料庫不完全一致：正式 `film_projects.id` 為 `text`，並有 `is_archived` 欄位；GitHub schema 的歷史定義不同。
- 正式資料庫目前沒有程式碼預期的 `merge_owned_clients` function 與 `validate_project_client_owner` trigger；客戶合併會走 `lib/services/project-service.ts` 的非原子備援路徑。
- 不要直接在新裝置重新建立或覆蓋 Production schema。先盤點正式 schema，再建立可審查的 Migration，並在 staging／備份策略確定後才套用。

#### P1：同步衝突

- 健檢時 `MENSGAME` 曾顯示「雲端資料已在其他裝置更新」，Vercel logs 也出現多次 `409`。
- 沒有完成版本比對前，不要選「保留本機版本並覆寫」；這可能覆蓋較新的雲端資料。
- 程式目前有 `syncVersion` 樂觀鎖，可阻止舊版本直接覆蓋，但衝突處理仍需產品決策。

#### P2：Auth 與錯誤處理

- `app/api/auth/sign-in/route.ts` 目前把 Supabase 暫停、網路失敗與真正帳密錯誤都顯示成同一個 401「請檢查 Email 與密碼」訊息。
- App 尚未提供忘記密碼／重設密碼流程。
- Auth 目前允許新使用者註冊；若這是私人營運工具，應另行決定是否關閉公開註冊。
- Supabase 的 `Leaked Password Protection` 尚未啟用。

#### P2：公開原始碼

- GitHub 儲存庫目前為 Public。健檢沒有發現 `service_role` 或其他高權限金鑰被寫入原始碼，但若這是內部工具，應評估是否改為 Private。

### 5. 新裝置重建流程（建議順序）

1. 使用正確的 GitHub 帳號取得儲存庫：
   ```powershell
   git clone https://github.com/back0064-sketch/my-film-manager.git my-film-manager-main
   Set-Location .\my-film-manager-main
   git switch main
   git rev-parse HEAD
   ```
2. 安裝與 CI 相同主版本的 Node.js 24，再執行：
   ```powershell
   npm ci
   ```
3. 複製環境變數範本：
   ```powershell
   Copy-Item .env.example .env.local
   ```
   由帳號持有人自行從 Vercel 的 `my-film-manager` 專案填入兩個環境變數值；不要把 `.env.local` 加入 Git，也不要把值貼到聊天或文件。
4. 在新裝置先做本機驗證：
   ```powershell
   npm run test
   npm run lint
   npm run build
   ```
5. 如需本機開發，再執行 `npm run dev`，開啟 `http://localhost:3000`；確認登入、登出、專案讀取與客戶讀取，不要用真實資料做破壞性測試。
6. 用 Git 檢查分支與版本：
   ```powershell
   git status --short --branch
   git log -1 --oneline
   git ls-remote origin refs/heads/main
   ```
   新裝置的 `HEAD`、遠端 `main` 與本文件記錄的 commit 必須一致或由使用者明確確認有更新。
7. 登入 Supabase 時進入 `back0064-sketch's Org` 的 `back0064-sketch's Project`，不要進入同一帳號下的其他組織（例如「剪輯」）。先確認專案為 `Healthy`，再查看 Advisors、Policies、Backups 與 Auth。
8. 登入 Vercel 時確認專案是 `my-film-manager`，Git 來源為 `back0064-sketch/my-film-manager`，Production branch 是 `main`，並確認 Production／Preview 環境變數存在但不公開其值。
9. 轉移完成後做一次正式站唯讀驗證：首頁可開啟、登入可用、未登入 API 仍回 401、已登入使用者可讀取自己的資料；不要在未確認同步版本前覆寫 `MENSGAME`。

### 6. 交接時的檔案與狀態規則

- 這份 `AGENTS.md` 是接管紀錄的唯一入口之一；正式程式碼仍以原始碼目錄為準。
- `C:\專案城市\my-film-manager` 是另一份較舊副本，當時 HEAD 為 `ac05be4` 且 `next-env.d.ts` 有未提交修改；不要把它當作 Production 主線，也不要用它覆蓋 `my-film-manager-main`。
- 任何新修改先在分支或乾淨工作樹完成，通過 test／lint／build，再決定是否 commit、push 與部署。
- 本次 P0 Policy 修復是在 Supabase Production Dashboard 直接完成，沒有同步改動 GitHub 程式碼；未來若要建立 Migration，必須單獨記錄 SQL、套用環境、驗證結果與回復方案。
- 本文件若要推送到 Public GitHub，先檢查 diff 與秘密掃描；禁止加入 `.env.local`、金鑰、密碼、OTP、復原碼、完整帳號資料或資料庫匯出檔。
