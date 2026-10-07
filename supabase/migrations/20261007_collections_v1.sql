-- Collections v1.
-- Each collection belongs to exactly one community. Contributions belong to a member of that same community.

create table if not exists public.collections_v10 (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities_v06(id) on delete cascade,
  name text not null,
  frequency text not null default 'once' check (frequency in ('once','monthly')),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(name)) > 0)
);

create index if not exists collections_v10_owner_user_id_idx on public.collections_v10(owner_user_id);
create index if not exists collections_v10_community_id_idx on public.collections_v10(community_id);

create table if not exists public.collection_contributions_v10 (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections_v10(id) on delete cascade,
  member_id uuid not null references public.community_members_v06(id) on delete restrict,
  amount numeric not null check (amount > 0),
  period_type text check (period_type in ('month','half_year','year')),
  month integer check (month between 1 and 12),
  half_year integer check (half_year in (1,2)),
  year integer check (year between 2000 and 2100),
  note text,
  created_at timestamptz not null default now(),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  check (
    (period_type is null and month is null and half_year is null and year is null)
    or (period_type = 'month' and month is not null and half_year is null and year is not null)
    or (period_type = 'half_year' and month is null and half_year is not null and year is not null)
    or (period_type = 'year' and month is null and half_year is null and year is not null)
  )
);

create index if not exists collection_contributions_v10_collection_id_idx on public.collection_contributions_v10(collection_id);
create index if not exists collection_contributions_v10_member_id_idx on public.collection_contributions_v10(member_id);
create index if not exists collection_contributions_v10_created_at_idx on public.collection_contributions_v10(created_at desc);

alter table public.collections_v10 enable row level security;
alter table public.collection_contributions_v10 enable row level security;
revoke all on public.collections_v10 from anon, authenticated;
revoke all on public.collection_contributions_v10 from anon, authenticated;

create or replace function public.create_collection_v10_rpc(
  p_community_id uuid,
  p_name text,
  p_frequency text default 'once'
)
returns table (id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_frequency text := coalesce(nullif(trim(p_frequency), ''), 'once');
begin
  if v_user_id is null then raise exception 'Потрібно увійти в акаунт.'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Вкажіть назву збору.'; end if;
  if v_frequency not in ('once','monthly') then raise exception 'Некоректна регулярність.'; end if;

  if not exists (
    select 1 from public.communities_v06 c
    where c.id = p_community_id and c.owner_user_id = v_user_id
  ) then raise exception 'Спільноту не знайдено.'; end if;

  return query
  insert into public.collections_v10 (community_id, name, frequency, owner_user_id)
  values (p_community_id, trim(p_name), v_frequency, v_user_id)
  returning collections_v10.id;
end;
$$;

create or replace function public.get_my_collections_v10_rpc()
returns table (
  id uuid,
  community_id uuid,
  community_name text,
  name text,
  frequency text,
  total_amount numeric,
  contributors_count integer,
  contributions_count integer,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.community_id,
    cm.name as community_name,
    c.name,
    c.frequency,
    coalesce(sum(cc.amount),0)::numeric as total_amount,
    count(distinct cc.member_id)::integer as contributors_count,
    count(cc.id)::integer as contributions_count,
    c.created_at
  from public.collections_v10 c
  join public.communities_v06 cm on cm.id = c.community_id
  left join public.collection_contributions_v10 cc on cc.collection_id = c.id
  where c.owner_user_id = auth.uid()
  group by c.id, c.community_id, cm.name, c.name, c.frequency, c.created_at
  order by c.created_at desc;
$$;

create or replace function public.get_collection_v10_rpc(p_collection_id uuid)
returns table (
  id uuid,
  community_id uuid,
  community_name text,
  name text,
  frequency text,
  total_amount numeric,
  contributors_count integer,
  contributions_count integer,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.community_id,
    cm.name as community_name,
    c.name,
    c.frequency,
    coalesce(sum(cc.amount),0)::numeric as total_amount,
    count(distinct cc.member_id)::integer as contributors_count,
    count(cc.id)::integer as contributions_count,
    c.created_at
  from public.collections_v10 c
  join public.communities_v06 cm on cm.id = c.community_id
  left join public.collection_contributions_v10 cc on cc.collection_id = c.id
  where c.id = p_collection_id and c.owner_user_id = auth.uid()
  group by c.id, c.community_id, cm.name, c.name, c.frequency, c.created_at;
$$;

create or replace function public.create_collection_contribution_v10_rpc(
  p_collection_id uuid,
  p_member_id uuid,
  p_amount numeric,
  p_period_type text default null,
  p_month integer default null,
  p_half_year integer default null,
  p_year integer default null,
  p_note text default null
)
returns table (id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_community_id uuid;
  v_period text := nullif(trim(p_period_type), '');
begin
  if v_user_id is null then raise exception 'Потрібно увійти в акаунт.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Сума має бути більшою за 0.'; end if;

  select c.community_id into v_community_id
  from public.collections_v10 c
  where c.id = p_collection_id and c.owner_user_id = v_user_id;

  if v_community_id is null then raise exception 'Збір не знайдено.'; end if;

  if not exists (
    select 1 from public.community_members_v06 m
    where m.id = p_member_id
      and m.community_id = v_community_id
      and m.status = 'active'
  ) then raise exception 'Учасника цієї спільноти не знайдено.'; end if;

  if v_period is not null and v_period not in ('month','half_year','year') then
    raise exception 'Некоректний період.';
  end if;
  if v_period = 'month' and (p_month is null or p_year is null) then
    raise exception 'Вкажіть місяць і рік.';
  end if;
  if v_period = 'half_year' and (p_half_year is null or p_year is null) then
    raise exception 'Вкажіть півріччя і рік.';
  end if;
  if v_period = 'year' and p_year is null then
    raise exception 'Вкажіть рік.';
  end if;

  return query
  insert into public.collection_contributions_v10 (
    collection_id, member_id, amount, period_type, month, half_year, year, note, created_by_user_id
  )
  values (
    p_collection_id,
    p_member_id,
    p_amount,
    v_period,
    case when v_period = 'month' then p_month else null end,
    case when v_period = 'half_year' then p_half_year else null end,
    case when v_period in ('month','half_year','year') then p_year else null end,
    nullif(trim(p_note), ''),
    v_user_id
  )
  returning collection_contributions_v10.id;
end;
$$;

create or replace function public.get_collection_contributions_v10_rpc(p_collection_id uuid)
returns table (
  id uuid,
  member_id uuid,
  member_name text,
  amount numeric,
  period_type text,
  month integer,
  half_year integer,
  year integer,
  note text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cc.id,
    cc.member_id,
    m.full_name as member_name,
    cc.amount,
    cc.period_type,
    cc.month,
    cc.half_year,
    cc.year,
    cc.note,
    cc.created_at
  from public.collection_contributions_v10 cc
  join public.collections_v10 c on c.id = cc.collection_id
  join public.community_members_v06 m on m.id = cc.member_id
  where cc.collection_id = p_collection_id
    and c.owner_user_id = auth.uid()
  order by cc.created_at desc;
$$;

create or replace function public.get_manager_collection_stats_v10_rpc()
returns table (
  total_amount numeric,
  contributions_count integer,
  contributors_count integer,
  collections_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(sum(cc.amount),0)::numeric as total_amount,
    count(cc.id)::integer as contributions_count,
    count(distinct cc.member_id)::integer as contributors_count,
    count(distinct c.id)::integer as collections_count
  from public.collections_v10 c
  left join public.collection_contributions_v10 cc on cc.collection_id = c.id
  where c.owner_user_id = auth.uid();
$$;

create or replace function public.get_manager_collection_member_stats_v10_rpc()
returns table (
  member_id uuid,
  member_name text,
  community_name text,
  total_amount numeric,
  contributions_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.full_name,
    cm.name,
    coalesce(sum(cc.amount),0)::numeric,
    count(cc.id)::integer
  from public.community_members_v06 m
  join public.communities_v06 cm on cm.id = m.community_id
  join public.collections_v10 c on c.community_id = m.community_id and c.owner_user_id = auth.uid()
  left join public.collection_contributions_v10 cc on cc.collection_id = c.id and cc.member_id = m.id
  where cm.owner_user_id = auth.uid()
  group by m.id, m.full_name, cm.name
  having count(cc.id) > 0
  order by coalesce(sum(cc.amount),0) desc, m.full_name;
$$;

revoke all on function public.create_collection_v10_rpc(uuid,text,text) from public;
revoke all on function public.get_my_collections_v10_rpc() from public;
revoke all on function public.get_collection_v10_rpc(uuid) from public;
revoke all on function public.create_collection_contribution_v10_rpc(uuid,uuid,numeric,text,integer,integer,integer,text) from public;
revoke all on function public.get_collection_contributions_v10_rpc(uuid) from public;
revoke all on function public.get_manager_collection_stats_v10_rpc() from public;
revoke all on function public.get_manager_collection_member_stats_v10_rpc() from public;

grant execute on function public.create_collection_v10_rpc(uuid,text,text) to authenticated;
grant execute on function public.get_my_collections_v10_rpc() to authenticated;
grant execute on function public.get_collection_v10_rpc(uuid) to authenticated;
grant execute on function public.create_collection_contribution_v10_rpc(uuid,uuid,numeric,text,integer,integer,integer,text) to authenticated;
grant execute on function public.get_collection_contributions_v10_rpc(uuid) to authenticated;
grant execute on function public.get_manager_collection_stats_v10_rpc() to authenticated;
grant execute on function public.get_manager_collection_member_stats_v10_rpc() to authenticated;
