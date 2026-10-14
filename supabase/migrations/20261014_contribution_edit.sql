-- Edit and delete contributions (v17). Managers of the collection's community only.
-- Requires 20261014_community_managers.sql.

alter table public.collection_contributions_v10
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by_user_id uuid references auth.users(id) on delete set null;

-- Shared period validation (same rules as create_collection_contribution_v10_rpc).
create or replace function public.validate_contribution_period_v17(
  p_period_type text, p_month integer, p_half_year integer, p_year integer
)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_period_type is not null and p_period_type not in ('month','half_year','year') then
    raise exception 'Некоректний період.';
  end if;
  if p_period_type = 'month' and (p_month is null or p_year is null) then raise exception 'Вкажіть місяць і рік.'; end if;
  if p_period_type = 'half_year' and (p_half_year is null or p_year is null) then raise exception 'Вкажіть півріччя і рік.'; end if;
  if p_period_type = 'year' and p_year is null then raise exception 'Вкажіть рік.'; end if;
end;
$$;

create or replace function public.update_collection_contribution_v17_rpc(
  p_contribution_id uuid,
  p_member_id uuid,
  p_amount numeric,
  p_period_type text default null,
  p_month integer default null,
  p_half_year integer default null,
  p_year integer default null,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_community_id uuid;
  v_old_member uuid;
  v_period text := nullif(trim(p_period_type), '');
begin
  if auth.uid() is null then raise exception 'Потрібно увійти в акаунт.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Сума має бути більшою за 0.'; end if;

  select c.community_id, cc.member_id
  into v_community_id, v_old_member
  from public.collection_contributions_v10 cc
  join public.collections_v10 c on c.id = cc.collection_id
  where cc.id = p_contribution_id
  for update of cc;

  if v_community_id is null or not public.is_community_manager_v14(v_community_id) then
    raise exception 'Внесок не знайдено.';
  end if;

  -- The member must belong to the same community; a new member must be active.
  if not exists (
    select 1 from public.community_members_v06 m
    where m.id = p_member_id
      and m.community_id = v_community_id
      and (m.status = 'active' or m.id = v_old_member)
  ) then
    raise exception 'Учасника цієї спільноти не знайдено.';
  end if;

  perform public.validate_contribution_period_v17(v_period, p_month, p_half_year, p_year);

  update public.collection_contributions_v10
  set member_id = p_member_id,
      amount = p_amount,
      period_type = v_period,
      month = case when v_period = 'month' then p_month else null end,
      half_year = case when v_period = 'half_year' then p_half_year else null end,
      year = case when v_period in ('month','half_year','year') then p_year else null end,
      note = nullif(trim(p_note), ''),
      updated_at = now(),
      updated_by_user_id = auth.uid()
  where id = p_contribution_id;

  return true;
end;
$$;

create or replace function public.delete_collection_contribution_v17_rpc(p_contribution_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_community_id uuid;
begin
  if auth.uid() is null then raise exception 'Потрібно увійти в акаунт.'; end if;

  select c.community_id into v_community_id
  from public.collection_contributions_v10 cc
  join public.collections_v10 c on c.id = cc.collection_id
  where cc.id = p_contribution_id;

  if v_community_id is null or not public.is_community_manager_v14(v_community_id) then
    raise exception 'Внесок не знайдено.';
  end if;

  delete from public.collection_contributions_v10 where id = p_contribution_id;
  return true;
end;
$$;

revoke all on function public.validate_contribution_period_v17(text,integer,integer,integer) from public, anon, authenticated;
revoke all on function public.update_collection_contribution_v17_rpc(uuid,uuid,numeric,text,integer,integer,integer,text) from public;
revoke all on function public.delete_collection_contribution_v17_rpc(uuid) from public;
grant execute on function public.update_collection_contribution_v17_rpc(uuid,uuid,numeric,text,integer,integer,integer,text) to authenticated;
grant execute on function public.delete_collection_contribution_v17_rpc(uuid) to authenticated;
