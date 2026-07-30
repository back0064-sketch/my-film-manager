-- Execute this file once in the Supabase SQL Editor for this project.
create table if not exists public.film_projects (
  id uuid primary key,
  name text not null check (char_length(trim(name)) > 0),
  owner_id uuid references auth.users(id) on delete cascade,
  project_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Needed when upgrading an existing installation created before authentication.
alter table public.film_projects
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

create index if not exists film_projects_updated_at_idx
  on public.film_projects (updated_at desc);
create index if not exists film_projects_owner_id_idx
  on public.film_projects (owner_id);

-- Client-first organisation. Existing projects keep a null client_id and appear as "未分類客戶" in the app.
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  contact_name text,
  contact_email text,
  contact_phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.film_projects
  add column if not exists client_id uuid references public.clients(id) on delete set null;

create index if not exists film_projects_client_id_idx on public.film_projects (client_id);
create index if not exists clients_owner_id_idx on public.clients (owner_id);

alter table public.clients enable row level security;
drop policy if exists "Users manage own clients" on public.clients;
create policy "Users manage own clients"
  on public.clients for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

alter table public.film_projects enable row level security;

drop policy if exists "Anonymous project access" on public.film_projects;
drop policy if exists "Users manage own projects" on public.film_projects;

create policy "Users manage own projects"
  on public.film_projects
  for all
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- Prevent a project owned by one user from referencing another user's client.
create or replace function public.validate_project_client_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.client_id is not null and not exists (
    select 1 from public.clients
    where id = new.client_id and owner_id = new.owner_id
  ) then
    raise exception 'Project and client must have the same owner';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_project_client_owner_trigger on public.film_projects;
create trigger validate_project_client_owner_trigger
before insert or update of client_id, owner_id on public.film_projects
for each row execute function public.validate_project_client_owner();

-- Move projects and remove the source client in one database transaction.
create or replace function public.merge_owned_clients(source_client_id uuid, target_client_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if source_client_id = target_client_id
    or not exists (select 1 from public.clients where id = source_client_id and owner_id = auth.uid())
    or not exists (select 1 from public.clients where id = target_client_id and owner_id = auth.uid())
  then
    raise exception 'Invalid client merge';
  end if;

  update public.film_projects
  set client_id = target_client_id, updated_at = now()
  where client_id = source_client_id and owner_id = auth.uid();

  delete from public.clients
  where id = source_client_id and owner_id = auth.uid();
end;
$$;

revoke all on function public.merge_owned_clients(uuid, uuid) from public;
grant execute on function public.merge_owned_clients(uuid, uuid) to authenticated;
