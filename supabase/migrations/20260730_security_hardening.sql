-- Run in Supabase SQL Editor before relying on atomic client merges.

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
