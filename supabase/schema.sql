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
