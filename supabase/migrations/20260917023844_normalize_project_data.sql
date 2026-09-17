-- JSONB 正規化第一階段（可回退、保留原始 project_data）
--
-- 設計原則：
-- 1. film_projects.project_data 仍是目前正式寫入來源，不刪除、不改型別。
-- 2. 任務、月結批次與月結項目建立可查詢的投影表，供追款、通知與後續 UI 分頁使用。
-- 3. 所有新表都啟用 RLS；系統自動化只用 service_role，前端尚未直接讀寫這些表。
-- 4. 回填採 upsert，不會覆蓋 project_data，也不會刪除既有資料。

begin;

create table if not exists public.project_tasks (
  project_id text not null,
  task_id text not null,
  owner_id uuid not null,
  module_id text not null,
  title text not null,
  status text not null,
  is_completed boolean not null default false,
  description text,
  assignee text,
  due_date text,
  transaction_type text,
  counterparty text,
  invoice_number text,
  payment_method text,
  receipt_url text,
  transaction_date text,
  ready_for_collection boolean not null default false,
  amount numeric not null default 0,
  is_paid boolean not null default false,
  linked_task_id text,
  previous_status text,
  paid_at text,
  unit_price numeric,
  delivered_at text,
  settlement_batch_id text,
  archived_at text,
  source_updated_at text,
  source_project_updated_at timestamptz,
  normalized_at timestamptz not null default now(),
  primary key (project_id, task_id),
  check (transaction_type is null or transaction_type in ('income', 'expense'))
);

create table if not exists public.project_settlement_batches (
  project_id text not null,
  batch_id text not null,
  owner_id uuid not null,
  month text not null,
  subtotal numeric not null default 0,
  adjustment numeric not null default 0,
  total numeric not null default 0,
  status text not null default 'draft',
  created_at_source text,
  invoice_date text,
  invoice_number text,
  due_date text,
  paid_at text,
  notes text,
  source_project_updated_at timestamptz,
  normalized_at timestamptz not null default now(),
  primary key (project_id, batch_id),
  check (status in ('draft', 'invoiced', 'paid'))
);

create table if not exists public.project_settlement_items (
  project_id text not null,
  batch_id text not null,
  task_id text not null,
  owner_id uuid not null,
  title text not null,
  unit_price numeric not null default 0,
  delivered_at text,
  normalized_at timestamptz not null default now(),
  primary key (project_id, batch_id, task_id)
);

-- 系統表不提供前端資料 API；只讓自動化使用 service_role。
create table if not exists public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  status text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  row_counts jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  check (status in ('started', 'succeeded', 'failed'))
);

create table if not exists public.overdue_notification_deliveries (
  fingerprint text primary key,
  owner_id uuid not null,
  channel text not null default 'email',
  recipient text not null,
  sent_at timestamptz not null default now(),
  item_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists project_tasks_owner_project_idx
  on public.project_tasks (owner_id, project_id);
create index if not exists project_tasks_owner_due_date_idx
  on public.project_tasks (owner_id, due_date)
  where module_id <> 'Finance' and is_completed = false and archived_at is null;
create index if not exists project_tasks_owner_receivable_idx
  on public.project_tasks (owner_id, is_paid, due_date)
  where module_id = 'Finance' and transaction_type = 'income';
create index if not exists project_settlement_batches_owner_due_date_idx
  on public.project_settlement_batches (owner_id, status, due_date);
create index if not exists project_settlement_items_owner_project_idx
  on public.project_settlement_items (owner_id, project_id, batch_id);
create index if not exists backup_runs_kind_started_at_idx
  on public.backup_runs (kind, started_at desc);
create index if not exists overdue_notification_deliveries_owner_sent_at_idx
  on public.overdue_notification_deliveries (owner_id, sent_at desc);

alter table public.project_tasks enable row level security;
alter table public.project_settlement_batches enable row level security;
alter table public.project_settlement_items enable row level security;
alter table public.backup_runs enable row level security;
alter table public.overdue_notification_deliveries enable row level security;

drop policy if exists "Users manage own normalized tasks" on public.project_tasks;
create policy "Users manage own normalized tasks"
  on public.project_tasks for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "Users manage own normalized settlement batches" on public.project_settlement_batches;
create policy "Users manage own normalized settlement batches"
  on public.project_settlement_batches for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "Users manage own normalized settlement items" on public.project_settlement_items;
create policy "Users manage own normalized settlement items"
  on public.project_settlement_items for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- 系統紀錄不開放 authenticated／anon；RLS 開啟且沒有使用者 policy 時會拒絕前端查詢。
revoke all on table public.project_tasks from public, anon, authenticated;
revoke all on table public.project_settlement_batches from public, anon, authenticated;
revoke all on table public.project_settlement_items from public, anon, authenticated;
revoke all on table public.backup_runs from public, anon, authenticated;
revoke all on table public.overdue_notification_deliveries from public, anon, authenticated;
grant select, insert, update, delete on table public.project_tasks to authenticated, service_role;
grant select, insert, update, delete on table public.project_settlement_batches to authenticated, service_role;
grant select, insert, update, delete on table public.project_settlement_items to authenticated, service_role;
grant select, insert, update, delete on table public.backup_runs to service_role;
grant select, insert, update, delete on table public.overdue_notification_deliveries to service_role;

-- 由已登入使用者在儲存 project_data 後呼叫；缺少 migration 時，應用程式會安全略過。
create or replace function public.normalize_project_data(p_project_id text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  project_owner uuid;
  project_payload jsonb;
  project_updated_at timestamptz;
begin
  select owner_id, coalesce(project_data, '{}'::jsonb), updated_at
    into project_owner, project_payload, project_updated_at
  from public.film_projects
  where id::text = p_project_id
    and owner_id = (select auth.uid());

  if project_owner is null then
    raise exception 'Project not found or not owned by current user';
  end if;

  delete from public.project_settlement_items where project_id = p_project_id and owner_id = project_owner;
  delete from public.project_settlement_batches where project_id = p_project_id and owner_id = project_owner;
  delete from public.project_tasks where project_id = p_project_id and owner_id = project_owner;

  insert into public.project_tasks (
    project_id, task_id, owner_id, module_id, title, status, is_completed, description, assignee, due_date,
    transaction_type, counterparty, invoice_number, payment_method, receipt_url, transaction_date,
    ready_for_collection, amount, is_paid, linked_task_id, previous_status, paid_at, unit_price,
    delivered_at, settlement_batch_id, archived_at, source_updated_at, source_project_updated_at
  )
  select
    p_project_id, task->>'id', project_owner, coalesce(task->>'moduleId', 'Scripting'), coalesce(task->>'title', '未命名任務'),
    coalesce(task->>'status', '未分類'), coalesce((
      select (config->'customStatuses'->>(jsonb_array_length(config->'customStatuses') - 1)) = task->>'status'
      from jsonb_array_elements(case when jsonb_typeof(project_payload->'moduleConfigs') = 'array' then project_payload->'moduleConfigs' else '[]'::jsonb end) as config
      where config->>'moduleId' = task->>'moduleId'
      limit 1
    ), false), task->>'description', task->>'assignee', task->>'dueDate',
    case when task->>'transactionType' in ('income', 'expense') then task->>'transactionType' else null end, task->>'counterparty', task->>'invoiceNumber',
    task->>'paymentMethod', task->>'receiptUrl', task->>'transactionDate',
    lower(coalesce(task->>'readyForCollection', 'false')) in ('true', 't', '1', 'yes', '是'),
    case when jsonb_typeof(task->'amount') = 'number' then (task->>'amount')::numeric else 0 end,
    lower(coalesce(task->>'isPaid', 'false')) in ('true', 't', '1', 'yes', '是'),
    task->>'linkedTaskId', task->>'previousStatus', task->>'paidAt',
    case when jsonb_typeof(task->'unitPrice') = 'number' then (task->>'unitPrice')::numeric else null end,
    task->>'deliveredAt', task->>'settlementBatchId', task->>'archivedAt', task->>'updatedAt', project_updated_at
  from jsonb_array_elements(case when jsonb_typeof(project_payload->'tasks') = 'array' then project_payload->'tasks' else '[]'::jsonb end) as task
  where nullif(task->>'id', '') is not null;

  insert into public.project_settlement_batches (
    project_id, batch_id, owner_id, month, subtotal, adjustment, total, status, created_at_source,
    invoice_date, invoice_number, due_date, paid_at, notes, source_project_updated_at
  )
  select
    p_project_id, batch->>'id', project_owner, batch->>'month',
    case when jsonb_typeof(batch->'subtotal') = 'number' then (batch->>'subtotal')::numeric else 0 end,
    case when jsonb_typeof(batch->'adjustment') = 'number' then (batch->>'adjustment')::numeric else 0 end,
    case when jsonb_typeof(batch->'total') = 'number' then (batch->>'total')::numeric else 0 end,
    case when batch->>'status' in ('invoiced', 'paid') then batch->>'status' else 'draft' end,
    batch->>'createdAt', batch->>'invoiceDate', batch->>'invoiceNumber', batch->>'dueDate', batch->>'paidAt',
    batch->>'notes', project_updated_at
  from jsonb_array_elements(case when jsonb_typeof(project_payload->'settlementBatches') = 'array' then project_payload->'settlementBatches' else '[]'::jsonb end) as batch
  where nullif(batch->>'id', '') is not null and nullif(batch->>'month', '') is not null;

  -- 舊版月結沒有 items，仍以 synthetic batch 保留統計與付款狀態。
  insert into public.project_settlement_batches (
    project_id, batch_id, owner_id, month, subtotal, adjustment, total, status, created_at_source,
    invoice_date, paid_at, notes, source_project_updated_at
  )
  select
    p_project_id, 'legacy:' || (settlement->>'id'), project_owner, settlement->>'month',
    case when jsonb_typeof(settlement->'deliveredCount') = 'number' and jsonb_typeof(settlement->'unitPrice') = 'number'
      then (settlement->>'deliveredCount')::numeric * (settlement->>'unitPrice')::numeric else 0 end,
    0,
    case when jsonb_typeof(settlement->'deliveredCount') = 'number' and jsonb_typeof(settlement->'unitPrice') = 'number'
      then (settlement->>'deliveredCount')::numeric * (settlement->>'unitPrice')::numeric else 0 end,
    case when settlement->>'status' = 'paid' then 'paid' when settlement->>'status' = 'invoiced' then 'invoiced' else 'draft' end,
    settlement->>'month', settlement->>'invoiceDate', settlement->>'paidAt', settlement->>'notes', project_updated_at
  from jsonb_array_elements(
    (case when jsonb_typeof(project_payload->'monthlySettlements') = 'array' then project_payload->'monthlySettlements' else '[]'::jsonb end)
    || (case when jsonb_typeof(project_payload->'monthlySettlement') = 'object' then jsonb_build_array(project_payload->'monthlySettlement') else '[]'::jsonb end)
  ) as settlement
  where nullif(settlement->>'id', '') is not null and nullif(settlement->>'month', '') is not null
  on conflict (project_id, batch_id) do nothing;

  insert into public.project_settlement_items (
    project_id, batch_id, task_id, owner_id, title, unit_price, delivered_at
  )
  select
    p_project_id, batch->>'id', item->>'taskId', project_owner, coalesce(item->>'title', '未命名影片'),
    case when jsonb_typeof(item->'unitPrice') = 'number' then (item->>'unitPrice')::numeric else 0 end,
    item->>'deliveredAt'
  from jsonb_array_elements(case when jsonb_typeof(project_payload->'settlementBatches') = 'array' then project_payload->'settlementBatches' else '[]'::jsonb end) as batch
  cross join lateral jsonb_array_elements(case when jsonb_typeof(batch->'items') = 'array' then batch->'items' else '[]'::jsonb end) as item
  where nullif(batch->>'id', '') is not null and nullif(item->>'taskId', '') is not null;
end;
$$;

revoke all on function public.normalize_project_data(text) from public;
grant execute on function public.normalize_project_data(text) to authenticated;

-- 初次回填：只在正式表存在時執行，方便先在 staging／分支驗證。
do $$
declare
  project_record record;
begin
  if to_regclass('public.film_projects') is not null then
    for project_record in
      select id::text as project_id, owner_id
      from public.film_projects
      where owner_id is not null
    loop
      -- 直接以 owner scope 回填，避免依賴 auth.uid()；不把此區塊暴露成 API。
      delete from public.project_settlement_items where project_id = project_record.project_id and owner_id = project_record.owner_id;
      delete from public.project_settlement_batches where project_id = project_record.project_id and owner_id = project_record.owner_id;
      delete from public.project_tasks where project_id = project_record.project_id and owner_id = project_record.owner_id;

      insert into public.project_tasks (
        project_id, task_id, owner_id, module_id, title, status, is_completed, description, assignee, due_date,
        transaction_type, counterparty, invoice_number, payment_method, receipt_url, transaction_date,
        ready_for_collection, amount, is_paid, linked_task_id, previous_status, paid_at, unit_price,
        delivered_at, settlement_batch_id, archived_at, source_updated_at, source_project_updated_at
      )
      select
        project_record.project_id, task->>'id', project_record.owner_id, coalesce(task->>'moduleId', 'Scripting'), coalesce(task->>'title', '未命名任務'),
        coalesce(task->>'status', '未分類'), coalesce((
          select (config->'customStatuses'->>(jsonb_array_length(config->'customStatuses') - 1)) = task->>'status'
          from jsonb_array_elements(case when jsonb_typeof(p.project_data->'moduleConfigs') = 'array' then p.project_data->'moduleConfigs' else '[]'::jsonb end) as config
          where config->>'moduleId' = task->>'moduleId'
          limit 1
        ), false), task->>'description', task->>'assignee', task->>'dueDate',
        case when task->>'transactionType' in ('income', 'expense') then task->>'transactionType' else null end, task->>'counterparty', task->>'invoiceNumber', task->>'paymentMethod',
        task->>'receiptUrl', task->>'transactionDate',
        lower(coalesce(task->>'readyForCollection', 'false')) in ('true', 't', '1', 'yes', '是'),
        case when jsonb_typeof(task->'amount') = 'number' then (task->>'amount')::numeric else 0 end,
        lower(coalesce(task->>'isPaid', 'false')) in ('true', 't', '1', 'yes', '是'),
        task->>'linkedTaskId', task->>'previousStatus', task->>'paidAt',
        case when jsonb_typeof(task->'unitPrice') = 'number' then (task->>'unitPrice')::numeric else null end,
        task->>'deliveredAt', task->>'settlementBatchId', task->>'archivedAt', task->>'updatedAt', p.updated_at
      from public.film_projects p
      cross join lateral jsonb_array_elements(case when jsonb_typeof(p.project_data->'tasks') = 'array' then p.project_data->'tasks' else '[]'::jsonb end) as task
      where p.id::text = project_record.project_id and nullif(task->>'id', '') is not null;

      insert into public.project_settlement_batches (
        project_id, batch_id, owner_id, month, subtotal, adjustment, total, status, created_at_source,
        invoice_date, invoice_number, due_date, paid_at, notes, source_project_updated_at
      )
      select
        project_record.project_id, batch->>'id', project_record.owner_id, batch->>'month',
        case when jsonb_typeof(batch->'subtotal') = 'number' then (batch->>'subtotal')::numeric else 0 end,
        case when jsonb_typeof(batch->'adjustment') = 'number' then (batch->>'adjustment')::numeric else 0 end,
        case when jsonb_typeof(batch->'total') = 'number' then (batch->>'total')::numeric else 0 end,
        case when batch->>'status' in ('invoiced', 'paid') then batch->>'status' else 'draft' end,
        batch->>'createdAt', batch->>'invoiceDate', batch->>'invoiceNumber', batch->>'dueDate', batch->>'paidAt', batch->>'notes', p.updated_at
      from public.film_projects p
      cross join lateral jsonb_array_elements(case when jsonb_typeof(p.project_data->'settlementBatches') = 'array' then p.project_data->'settlementBatches' else '[]'::jsonb end) as batch
      where p.id::text = project_record.project_id and nullif(batch->>'id', '') is not null and nullif(batch->>'month', '') is not null;

      insert into public.project_settlement_batches (
        project_id, batch_id, owner_id, month, subtotal, adjustment, total, status, created_at_source,
        invoice_date, paid_at, notes, source_project_updated_at
      )
      select
        project_record.project_id, 'legacy:' || (settlement->>'id'), project_record.owner_id, settlement->>'month',
        case when jsonb_typeof(settlement->'deliveredCount') = 'number' and jsonb_typeof(settlement->'unitPrice') = 'number'
          then (settlement->>'deliveredCount')::numeric * (settlement->>'unitPrice')::numeric else 0 end,
        0,
        case when jsonb_typeof(settlement->'deliveredCount') = 'number' and jsonb_typeof(settlement->'unitPrice') = 'number'
          then (settlement->>'deliveredCount')::numeric * (settlement->>'unitPrice')::numeric else 0 end,
        case when settlement->>'status' = 'paid' then 'paid' when settlement->>'status' = 'invoiced' then 'invoiced' else 'draft' end,
        settlement->>'month', settlement->>'invoiceDate', settlement->>'paidAt', settlement->>'notes', p.updated_at
      from public.film_projects p
      cross join lateral jsonb_array_elements(
        (case when jsonb_typeof(p.project_data->'monthlySettlements') = 'array' then p.project_data->'monthlySettlements' else '[]'::jsonb end)
        || (case when jsonb_typeof(p.project_data->'monthlySettlement') = 'object' then jsonb_build_array(p.project_data->'monthlySettlement') else '[]'::jsonb end)
      ) as settlement
      where p.id::text = project_record.project_id and nullif(settlement->>'id', '') is not null and nullif(settlement->>'month', '') is not null
      on conflict (project_id, batch_id) do nothing;

      insert into public.project_settlement_items (
        project_id, batch_id, task_id, owner_id, title, unit_price, delivered_at
      )
      select
        project_record.project_id, batch->>'id', item->>'taskId', project_record.owner_id, coalesce(item->>'title', '未命名影片'),
        case when jsonb_typeof(item->'unitPrice') = 'number' then (item->>'unitPrice')::numeric else 0 end,
        item->>'deliveredAt'
      from public.film_projects p
      cross join lateral jsonb_array_elements(case when jsonb_typeof(p.project_data->'settlementBatches') = 'array' then p.project_data->'settlementBatches' else '[]'::jsonb end) as batch
      cross join lateral jsonb_array_elements(case when jsonb_typeof(batch->'items') = 'array' then batch->'items' else '[]'::jsonb end) as item
      where p.id::text = project_record.project_id and nullif(batch->>'id', '') is not null and nullif(item->>'taskId', '') is not null;
    end loop;
  end if;
end;
$$;

commit;
