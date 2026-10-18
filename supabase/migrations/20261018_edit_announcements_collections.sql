-- Edit/delete announcements; finish/reopen/delete collections (v18).
-- Managers of the community only. Requires 20261014_collection_dues.sql
-- and 20261014_contribution_edit.sql.
--
-- * A finished collection (status = 'closed') keeps its contributions, history
--   and statistics, takes no new contributions and shows no debt to members.
--   It can be reopened.
-- * A collection can be deleted only while it has no contributions; otherwise
--   it should be finished instead, so money records are never lost.
-- * The four v16 collection getters gain a trailing `status` column. Changing a
--   function's result type needs DROP + CREATE; the old frontend ignores the
--   extra column, so this migration can run before the frontend deploy.

-- ---------------------------------------------------------------------------
-- Announcements
-- ---------------------------------------------------------------------------

create or replace function public.update_announcement_v18_rpc(
  p_announcement_id uuid,
  p_title text,
  p_body text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_community_id uuid;
begin
  if auth.uid() is null then raise exception 'Потрібно увійти в акаунт.'; end if;
  if nullif(trim(p_title),'') is null then raise exception 'Вкажіть заголовок.'; end if;
  if nullif(trim(p_body),'') is null then raise exception 'Вкажіть текст оголошення.'; end if;

  select a.community_id into v_community_id from public.announcements_v12 a where a.id = p_announcement_id;
  if v_community_id is null or not public.is_community_manager_v14(v_community_id) then
    raise exception 'Оголошення не знайдено.';
  end if;

  update public.announcements_v12
  set title = trim(p_title), body = trim(p_body), updated_at = now()
  where id = p_announcement_id;
  return true;
end;
$$;

create or replace function public.delete_announcement_v18_rpc(p_announcement_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_community_id uuid;
begin
  if auth.uid() is null then raise exception 'Потрібно увійти в акаунт.'; end if;
  select a.community_id into v_community_id from public.announcements_v12 a where a.id = p_announcement_id;
  if v_community_id is null or not public.is_community_manager_v14(v_community_id) then
    raise exception 'Оголошення не знайдено.';
  end if;
  delete from public.announcements_v12 where id = p_announcement_id;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Collections: status
-- ---------------------------------------------------------------------------

alter table public.collections_v10
  add column if not exists status text not null default 'active',
  add column if not exists closed_at timestamptz;

alter table public.collections_v10 drop constraint if exists collections_v10_status_check;
alter table public.collections_v10
  add constraint collections_v10_status_check check (status in ('active','closed'));

-- No new contributions into a finished collection (existing ones stay editable).
create or replace function public.collection_contribution_open_check_v18()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from public.collections_v10 c where c.id = new.collection_id and c.status = 'closed') then
    raise exception 'Збір завершено. Відновіть його, щоб додати внесок.';
  end if;
  return new;
end;
$$;

drop trigger if exists collection_contribution_open_check_v18 on public.collection_contributions_v10;
create trigger collection_contribution_open_check_v18
  before insert on public.collection_contributions_v10
  for each row execute function public.collection_contribution_open_check_v18();

create or replace function public.set_collection_status_v18_rpc(p_collection_id uuid, p_status text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_community_id uuid;
begin
  if auth.uid() is null then raise exception 'Потрібно увійти в акаунт.'; end if;
  if p_status not in ('active','closed') then raise exception 'Некоректний стан збору.'; end if;
  select c.community_id into v_community_id from public.collections_v10 c where c.id = p_collection_id;
  if v_community_id is null or not public.is_community_manager_v14(v_community_id) then
    raise exception 'Збір не знайдено.';
  end if;

  update public.collections_v10
  set status = p_status,
      closed_at = case when p_status = 'closed' then now() else null end,
      updated_at = now()
  where id = p_collection_id;
  return true;
end;
$$;

create or replace function public.delete_collection_v18_rpc(p_collection_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_community_id uuid;
begin
  if auth.uid() is null then raise exception 'Потрібно увійти в акаунт.'; end if;
  select c.community_id into v_community_id from public.collections_v10 c where c.id = p_collection_id for update;
  if v_community_id is null or not public.is_community_manager_v14(v_community_id) then
    raise exception 'Збір не знайдено.';
  end if;
  if exists (select 1 from public.collection_contributions_v10 cc where cc.collection_id = p_collection_id) then
    raise exception 'У зборі вже є внески. Його можна завершити, але не видалити.';
  end if;
  delete from public.collections_v10 where id = p_collection_id;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Collection getters: + status (same body as v16 otherwise)
-- ---------------------------------------------------------------------------

drop function if exists public.get_my_collections_v16_rpc();
create function public.get_my_collections_v16_rpc()
returns table (
  id uuid,
  community_id uuid,
  community_name text,
  name text,
  frequency text,
  amount_per_member numeric,
  school_year integer,
  payment_details text,
  total_amount numeric,
  contributors_count integer,
  contributions_count integer,
  active_members_count integer,
  created_at timestamptz,
  status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id, c.community_id, cm.name, c.name, c.frequency,
    c.amount_per_member, c.school_year, c.payment_details,
    coalesce(sum(cc.amount),0)::numeric,
    count(distinct cc.member_id)::integer,
    count(cc.id)::integer,
    (select count(*)::integer from public.community_members_v06 m
      where m.community_id = c.community_id and m.status = 'active'),
    c.created_at,
    c.status
  from public.collections_v10 c
  join public.communities_v06 cm on cm.id = c.community_id
  join public.community_managers_v14 mg
    on mg.community_id = c.community_id and mg.user_id = auth.uid()
  left join public.collection_contributions_v10 cc on cc.collection_id = c.id
  group by c.id, cm.name
  order by c.created_at desc;
$$;

drop function if exists public.get_collection_v16_rpc(uuid);
create function public.get_collection_v16_rpc(p_collection_id uuid)
returns table (
  id uuid,
  community_id uuid,
  community_name text,
  name text,
  frequency text,
  amount_per_member numeric,
  school_year integer,
  payment_details text,
  total_amount numeric,
  contributors_count integer,
  contributions_count integer,
  active_members_count integer,
  created_at timestamptz,
  status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id, c.community_id, cm.name, c.name, c.frequency,
    c.amount_per_member, c.school_year, c.payment_details,
    coalesce(sum(cc.amount),0)::numeric,
    count(distinct cc.member_id)::integer,
    count(cc.id)::integer,
    (select count(*)::integer from public.community_members_v06 m
      where m.community_id = c.community_id and m.status = 'active'),
    c.created_at,
    c.status
  from public.collections_v10 c
  join public.communities_v06 cm on cm.id = c.community_id
  left join public.collection_contributions_v10 cc on cc.collection_id = c.id
  where c.id = p_collection_id
    and public.is_community_manager_v14(c.community_id)
  group by c.id, cm.name;
$$;

drop function if exists public.get_my_participant_collections_v16_rpc();
create function public.get_my_participant_collections_v16_rpc()
returns table (
  id uuid,
  community_id uuid,
  community_name text,
  name text,
  frequency text,
  amount_per_member numeric,
  school_year integer,
  payment_details text,
  personal_amount numeric,
  personal_contributions_count integer,
  status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id, c.community_id, cm.name, c.name, c.frequency,
    c.amount_per_member, c.school_year, c.payment_details,
    coalesce(sum(cc.amount),0)::numeric,
    count(cc.id)::integer,
    c.status
  from public.collections_v10 c
  join public.communities_v06 cm on cm.id = c.community_id
  join public.community_members_v06 m
    on m.community_id = c.community_id
   and m.user_id = auth.uid()
   and m.status = 'active'
  left join public.collection_contributions_v10 cc
    on cc.collection_id = c.id
   and cc.member_id = m.id
  group by c.id, cm.name
  order by c.created_at desc;
$$;

drop function if exists public.get_my_participant_collection_v16_rpc(uuid);
create function public.get_my_participant_collection_v16_rpc(p_collection_id uuid)
returns table (
  id uuid,
  community_id uuid,
  community_name text,
  name text,
  frequency text,
  amount_per_member numeric,
  school_year integer,
  payment_details text,
  personal_amount numeric,
  personal_contributions_count integer,
  status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id, c.community_id, cm.name, c.name, c.frequency,
    c.amount_per_member, c.school_year, c.payment_details,
    coalesce(sum(cc.amount),0)::numeric,
    count(cc.id)::integer,
    c.status
  from public.collections_v10 c
  join public.communities_v06 cm on cm.id = c.community_id
  join public.community_members_v06 m
    on m.community_id = c.community_id
   and m.user_id = auth.uid()
   and m.status = 'active'
  left join public.collection_contributions_v10 cc
    on cc.collection_id = c.id
   and cc.member_id = m.id
  where c.id = p_collection_id
  group by c.id, cm.name;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.collection_contribution_open_check_v18() from public, anon, authenticated;
revoke all on function public.update_announcement_v18_rpc(uuid,text,text) from public;
revoke all on function public.delete_announcement_v18_rpc(uuid) from public;
revoke all on function public.set_collection_status_v18_rpc(uuid,text) from public;
revoke all on function public.delete_collection_v18_rpc(uuid) from public;
revoke all on function public.get_my_collections_v16_rpc() from public;
revoke all on function public.get_collection_v16_rpc(uuid) from public;
revoke all on function public.get_my_participant_collections_v16_rpc() from public;
revoke all on function public.get_my_participant_collection_v16_rpc(uuid) from public;

grant execute on function public.update_announcement_v18_rpc(uuid,text,text) to authenticated;
grant execute on function public.delete_announcement_v18_rpc(uuid) to authenticated;
grant execute on function public.set_collection_status_v18_rpc(uuid,text) to authenticated;
grant execute on function public.delete_collection_v18_rpc(uuid) to authenticated;
grant execute on function public.get_my_collections_v16_rpc() to authenticated;
grant execute on function public.get_collection_v16_rpc(uuid) to authenticated;
grant execute on function public.get_my_participant_collections_v16_rpc() to authenticated;
grant execute on function public.get_my_participant_collection_v16_rpc(uuid) to authenticated;
