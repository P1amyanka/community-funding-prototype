-- Collection dues (v16): an amount per member, a school year for monthly
-- collections, and payment details shown to members.
--
-- * amount_per_member — the same for every member; for monthly collections it
--   is the amount per month. Optional: without it a collection works as before.
-- * school_year — the year the school year starts in (2026 = Sep 2026 – May 2027).
--   Required for monthly collections that have an amount.
-- * payment_details — a link or a card number shown in the member's cabinet.
--
-- Who owes what is calculated in the app (js/dues.js) from these fields and
-- the contributions; only managers record contributions, as before.
--
-- Requires 20261014_community_managers.sql.

alter table public.collections_v10
  add column if not exists amount_per_member numeric(14,2),
  add column if not exists school_year integer,
  add column if not exists payment_details text;

alter table public.collections_v10 drop constraint if exists collections_v10_amount_per_member_check;
alter table public.collections_v10
  add constraint collections_v10_amount_per_member_check
  check (amount_per_member is null or amount_per_member > 0);

alter table public.collections_v10 drop constraint if exists collections_v10_school_year_check;
alter table public.collections_v10
  add constraint collections_v10_school_year_check
  check (school_year is null or school_year between 2000 and 2100);

alter table public.collections_v10 drop constraint if exists collections_v10_monthly_year_check;
alter table public.collections_v10
  add constraint collections_v10_monthly_year_check
  check (frequency <> 'monthly' or amount_per_member is null or school_year is not null);

-- Shared validation for create/update.
create or replace function public.validate_collection_v16(
  p_name text,
  p_frequency text,
  p_amount_per_member numeric,
  p_school_year integer
)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if nullif(trim(p_name), '') is null then raise exception 'Вкажіть назву збору.'; end if;
  if p_frequency not in ('once','monthly') then raise exception 'Некоректна регулярність.'; end if;
  if p_amount_per_member is not null and p_amount_per_member <= 0 then raise exception 'Сума має бути більшою за 0.'; end if;
  if p_frequency = 'monthly' and p_school_year is null then raise exception 'Оберіть навчальний рік.'; end if;
  if p_school_year is not null and (p_school_year < 2000 or p_school_year > 2100) then raise exception 'Некоректний навчальний рік.'; end if;
end;
$$;

create or replace function public.create_collection_v16_rpc(
  p_community_id uuid,
  p_name text,
  p_frequency text default 'once',
  p_amount_per_member numeric default null,
  p_school_year integer default null,
  p_payment_details text default null
)
returns table (id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_frequency text := coalesce(nullif(trim(p_frequency), ''), 'once');
  v_year integer := case when coalesce(nullif(trim(p_frequency), ''), 'once') = 'monthly' then p_school_year else null end;
begin
  if auth.uid() is null then raise exception 'Потрібно увійти в акаунт.'; end if;
  if not public.is_community_manager_v14(p_community_id) then raise exception 'Спільноту не знайдено.'; end if;
  perform public.validate_collection_v16(p_name, v_frequency, p_amount_per_member, v_year);

  return query
  insert into public.collections_v10 (community_id, name, frequency, owner_user_id, amount_per_member, school_year, payment_details)
  values (p_community_id, trim(p_name), v_frequency, auth.uid(), p_amount_per_member, v_year, nullif(trim(p_payment_details), ''))
  returning collections_v10.id;
end;
$$;

create or replace function public.update_collection_v16_rpc(
  p_collection_id uuid,
  p_name text,
  p_frequency text,
  p_amount_per_member numeric default null,
  p_school_year integer default null,
  p_payment_details text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_community_id uuid;
  v_frequency text := coalesce(nullif(trim(p_frequency), ''), 'once');
  v_year integer := case when coalesce(nullif(trim(p_frequency), ''), 'once') = 'monthly' then p_school_year else null end;
begin
  if auth.uid() is null then raise exception 'Потрібно увійти в акаунт.'; end if;
  select c.community_id into v_community_id from public.collections_v10 c where c.id = p_collection_id;
  if v_community_id is null or not public.is_community_manager_v14(v_community_id) then
    raise exception 'Збір не знайдено.';
  end if;
  perform public.validate_collection_v16(p_name, v_frequency, p_amount_per_member, v_year);

  update public.collections_v10
  set name = trim(p_name),
      frequency = v_frequency,
      amount_per_member = p_amount_per_member,
      school_year = v_year,
      payment_details = nullif(trim(p_payment_details), ''),
      updated_at = now()
  where id = p_collection_id;

  return true;
end;
$$;

create or replace function public.get_my_collections_v16_rpc()
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
  created_at timestamptz
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
    c.created_at
  from public.collections_v10 c
  join public.communities_v06 cm on cm.id = c.community_id
  join public.community_managers_v14 mg
    on mg.community_id = c.community_id and mg.user_id = auth.uid()
  left join public.collection_contributions_v10 cc on cc.collection_id = c.id
  group by c.id, cm.name
  order by c.created_at desc;
$$;

create or replace function public.get_collection_v16_rpc(p_collection_id uuid)
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
  created_at timestamptz
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
    c.created_at
  from public.collections_v10 c
  join public.communities_v06 cm on cm.id = c.community_id
  left join public.collection_contributions_v10 cc on cc.collection_id = c.id
  where c.id = p_collection_id
    and public.is_community_manager_v14(c.community_id)
  group by c.id, cm.name;
$$;

create or replace function public.get_my_participant_collections_v16_rpc()
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
  personal_contributions_count integer
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
    count(cc.id)::integer
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

create or replace function public.get_my_participant_collection_v16_rpc(p_collection_id uuid)
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
  personal_contributions_count integer
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
    count(cc.id)::integer
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

revoke all on function public.validate_collection_v16(text,text,numeric,integer) from public, anon, authenticated;
revoke all on function public.create_collection_v16_rpc(uuid,text,text,numeric,integer,text) from public;
revoke all on function public.update_collection_v16_rpc(uuid,text,text,numeric,integer,text) from public;
revoke all on function public.get_my_collections_v16_rpc() from public;
revoke all on function public.get_collection_v16_rpc(uuid) from public;
revoke all on function public.get_my_participant_collections_v16_rpc() from public;
revoke all on function public.get_my_participant_collection_v16_rpc(uuid) from public;

grant execute on function public.create_collection_v16_rpc(uuid,text,text,numeric,integer,text) to authenticated;
grant execute on function public.update_collection_v16_rpc(uuid,text,text,numeric,integer,text) to authenticated;
grant execute on function public.get_my_collections_v16_rpc() to authenticated;
grant execute on function public.get_collection_v16_rpc(uuid) to authenticated;
grant execute on function public.get_my_participant_collections_v16_rpc() to authenticated;
grant execute on function public.get_my_participant_collection_v16_rpc(uuid) to authenticated;
