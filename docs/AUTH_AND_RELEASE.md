# 單人登入與維護流程

## 本次程式調整

- 密碼重設頁只向本站 `/api/auth/session`、`/api/auth/password` 發送請求，不直接呼叫 Supabase。保留 `connect-src 'self'`。
- 密碼更新 API 會驗證同來源、已登入及既有 MFA 狀態；不記錄密碼，回應不可快取。
- Google 登入使用 Supabase OAuth，保留原本的 RLS 與 auth.users UUID。
- `AUTH_GOOGLE_ENABLED=true` 且 `AUTH_OWNER_ID` 已設定後，才顯示 Google 入口。設定 owner 後，Email 登入與所有使用者 API 同樣限制這個 UUID。
- OAuth 回呼若 UUID 不符會登出，不重寫專案 owner、不自動搬資料。

## 一次性的 Google 設定（尚待正式環境完成）

1. 在正確的 Supabase Production 專案確認擁有專案的既有使用者 UUID 與已驗證 Email。勿把 UUID／Email 放入 Git。
2. 在 Google Cloud 設定 Web OAuth Client，僅使用登入所需的 openid、email、profile 權限。不要沿用試算表服務帳號私鑰作為 OAuth secret。
3. Google authorized redirect URI：`https://xmbpkmxrhxobqixqdyep.supabase.co/auth/v1/callback`。
4. 將 Google Client ID／Secret 直接存入 Supabase Google provider。維持既有禁止公開註冊設定，若 identity linking 被拒絕，先釐清既有帳號驗證／連結狀態，不直接開放註冊。
5. Supabase Redirect URLs 加入 `https://my-film-manager.vercel.app/auth/google/callback` 與 `https://my-film-manager.vercel.app/auth/confirm?next=/auth/reset`，保留既有重設網址。
6. Vercel Production 設定 `AUTH_OWNER_ID` 為第一步核對的 UUID，再設定 `AUTH_GOOGLE_ENABLED=true` 並重新部署。Google 登入使用與原帳號一致的已驗證 Email；Supabase 的自動 identity linking 仍需實測確認。
7. 首次 Google 登入後，確認 session UUID、專案／任務數與月結金額均與原帳號一致，並測試手機及登出。這些尚未實測前不得宣稱 Google 登入已啟用成功。

## 日常更新

推送程式會執行單元測試、Lint、建置，以及桌機／手機的登入與密碼重設瀏覽器測試。既有 Vercel Git integration 負責部署；目前 GitHub CI 與 Vercel 為平行執行，CI 不是 Production 發布閘門。啟用 Deployment Checks 後才能保證測試通過才發布。

`node scripts/run-e2e.mjs auth.spec.ts` 使用模擬 API 驗證前端，不會更改正式帳號密碼。正式 OAuth 與郵件連結仍需帳號持有人實測。

## 資料庫變更

提供 GitHub Actions「正式資料庫唯讀預檢」，需在 GitHub production environment 設定 `SUPABASE_PROJECT_REF` variable 與 `SUPABASE_ACCESS_TOKEN` secret；權杖直接輸入 GitHub，不貼入對話。預檢只核對資料表及 RLS，無法取代政策內容、資料筆數或還原測試。

目前無權讀取正式庫 migration ledger，不能確認既有 SQL 是否已被記錄，因此未啟用自動 `db push`。下一步需核對 ledger、正式 schema 及可還原備份，再以增量 migration 建立部署步驟，避免重跑已套用的歷史變更。

## 備份及可用性

既有 Google 試算表匯出維持單向備份。尚需實際取得一份備份並在隔離環境還原、核對筆數及財務加總，才算還原演練完成。Free heartbeat 不保證免於暫停；升級 Pro 涉及訂閱費用，需由持有人決定與執行。

## 回復

Google 功能有問題時先將 `AUTH_GOOGLE_ENABLED=false` 後重新部署，既有 Email 登入仍可用。不要刪除既有使用者、identity 或改寫專案 owner。程式回退不會回退已更新的密碼。
