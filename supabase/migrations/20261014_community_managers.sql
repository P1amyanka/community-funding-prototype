-- Multiple managers per community (v14).
--
-- Access to a community is now decided by community_managers_v14, not by
-- communities_v06.owner_user_id. owner_user_id stays as "who created it".
-- Collections are shared by all managers of their community (previously only
-- the manager who created a collection could see it).
--
-- A manager is invited by email. The invite is linked to the account the next
-- time that email signs in (claim_my_memberships_v11_rpc now also claims
-- manager invites). Every manager has the same rights, including inviting and
-- removing other managers. A community always keeps at least one manager with
-- an active account.

-- ---------------------------------------------------------------------------
-- Table + helper
-- ---------------------------------------------------------------------------

create table if not exists public.community_managers_v14 (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities_v06(id) on delete cascade,
  email text,
  user_id uuid references auth.users(id) on delete cascade,
  invited_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (email is not null or user_id is not null),
  check (email is null or email = lower(trim(email)))
);

create unique index if not exists community_managers_v14_community_email_uidx
  on public.community_managers_v14(community_id, email) where email is not null;
create unique index if not exists community_managers_v14_community_user_uidx
  on public.community_managers_v14(community_id, user_id) where user_id is not null;
create index if not exists community_managers_v14_user_id_idx
  on public.community_managers_v14(user_id);

alter table public.community_managers_v14 enable row level security;
revoke all on public.community_managers_v14 from anon, authenticated;

-- Every existing community: its creator becomes its first manager.
insert into public.community_managers_v14 (community_id, email, user_id)
select c.id, nullif(lower(trim(u.email)), ''), c.owner_user_id
from public.communities_v06 c
join auth.users u on u.id = c.owner_user_id
where not exists (
  select 1 from public.community_managers_v14 m
  where m.community_id = c.id and m.user_id = c.owner_user_id
);

create or replace function public.is_community_manager_v14(p_community_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.community_managers_v14 m
    where m.community_id = p_community_id
      and m.user_id = auth.uid()
  );
$$;

-- Adds the current user as a manager of a community they just created.
create or replace function public.add_creator_as_manager_v14(p_community_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.community_managers_v14 (community_id, email, user_id, invited_by_user_id)
  values (
    p_community_id,
    nullif(lower(trim(auth.jwt()->>'email')), ''),
    auth.uid(),
    auth.uid()
  )
  on conflict do nothing;
$$;

-- ---------------------------------------------------------------------------
-- Account roles + claiming invites
-- ---------------------------------------------------------------------------

create or replace function public.claim_my_memberships_v11_rpc()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(trim(coalesce(auth.jwt()->>'email','')));
  v_members integer := 0;
  v_managers integer := 0;
begin
  if v_user_id is null then
    raise exception 'Потрібно увійти в акаунт.';
  end if;
  if v_email = '' then
    return 0;
  end if;

  update public.community_members_v06 m
  set user_id = v_user_id,
      updated_at = now()
  where m.user_id is null
    and m.email is not null
    and lower(trim(m.email)) = v_email;
  get diagnostics v_members = row_count;

  update public.community_managers_v14 cm
  set user_id = v_user_id
  where cm.user_id is null
    and cm.email = v_email
    and not exists (
      select 1 from public.community_managers_v14 x
      where x.community_id = cm.community_id and x.user_id = v_user_id
    );
  get diagnostics v_managers = row_count;

  return v_members + v_managers;
end;
$$;

create or replace function public.get_my_account_roles_v11_rpc()
returns table (
  is_manager boolean,
  is_participant boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (
      exists(select 1 from public.community_managers_v14 m where m.user_id = auth.uid())
      or exists(select 1 from public.initiatives_v04 i where i.owner_user_id = auth.uid())
    ) as is_manager,
    exists(
      select 1 from public.community_members_v06 m
      where m.user_id = auth.uid() and m.status = 'active'
    ) as is_participant;
$$;

-- ---------------------------------------------------------------------------
-- Managers of a community
-- ---------------------------------------------------------------------------

create or replace function public.get_community_managers_v14_rpc(p_community_id uuid)
returns table (
  id uuid,
  email text,
  is_active boolean,
  is_me boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_community_manager_v14(p_community_id) then
    raise exception 'Спільноту не знайдено.';
  end if;

  return query
  select
    m.id,
    coalesce(m.email, lower(u.email)) as email,
    m.user_id is not null as is_active,
    m.user_id is not distinct from auth.uid() as is_me,
    m.created_at
  from public.community_managers_v14 m
  left join auth.users u on u.id = m.user_id
  where m.community_id = p_community_id
  order by m.created_at;
end;
$$;

create or replace function public.add_community_manager_v14_rpc(
  p_community_id uuid,
  p_email text
)
returns table (id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := nullif(lower(trim(p_email)), '');
begin
  if auth.uid() is null then raise exception 'Потрібно увійти в акаунт.'; end if;
  if not public.is_community_manager_v14(p_community_id) then
    raise exception 'Спільноту не знайдено.';
  end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Перевірте правильність email.';
  end if;
  if exists (
    select 1
    from public.community_managers_v14 m
    left join auth.users u on u.id = m.user_id
    where m.community_id = p_community_id
      and (m.email = v_email or lower(u.email) = v_email)
  ) then
    raise exception 'Цей email уже є серед менеджерів.';
  end if;

  return query
  insert into public.community_managers_v14 (community_id, email, invited_by_user_id)
  values (p_community_id, v_email, auth.uid())
  returning community_managers_v14.id;
end;
$$;

create or replace function public.remove_community_manager_v14_rpc(p_manager_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_community_id uuid;
  v_user_id uuid;
begin
  if auth.uid() is null then raise exception 'Потрібно увійти в акаунт.'; end if;

  select m.community_id, m.user_id
  into v_community_id, v_user_id
  from public.community_managers_v14 m
  where m.id = p_manager_id;

  if v_community_id is null or not public.is_community_manager_v14(v_community_id) then
    raise exception 'Менеджера не знайдено.';
  end if;

  -- Serialise removals in one community so two managers cannot remove each other at once.
  perform 1 from public.communities_v06 where id = v_community_id for update;

  if v_user_id is not null and not exists (
    select 1 from public.community_managers_v14 m
    where m.community_id = v_community_id
      and m.user_id is not null
      and m.id <> p_manager_id
  ) then
    raise exception 'У спільноти має залишитися хоча б один менеджер з активним доступом.';
  end if;

  delete from public.community_managers_v14 where id = p_manager_id;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Communities
-- ---------------------------------------------------------------------------

create or replace function public.create_community_v06_rpc(
  p_name text,
  p_description text default null
)
returns table (id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'Потрібно увійти в акаунт.';
  end if;
  if nullif(trim(p_name), '') is null then
    raise exception 'Вкажіть назву спільноти.';
  end if;

  insert into public.communities_v06 (name, description, owner_user_id)
  values (trim(p_name), nullif(trim(p_description), ''), v_user_id)
  returning communities_v06.id into v_id;

  perform public.add_creator_as_manager_v14(v_id);

  return query select v_id;
end;
$$;

create or replace function public.get_my_communities_v06_rpc()
returns table (
  id uuid,
  name text,
  description text,
  members_count integer,
  initiatives_count integer,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.description,
    (select count(*)::integer
       from public.community_members_v06 m
      where m.community_id = c.id
        and m.status = 'active') as members_count,
    (select count(*)::integer
       from public.initiatives_v04 i
      where i.community_id = c.id) as initiatives_count,
    c.created_at,
    c.updated_at
  from public.communities_v06 c
  join public.community_managers_v14 cm
    on cm.community_id = c.id and cm.user_id = auth.uid()
  order by c.created_at desc;
$$;

create or replace function public.get_my_community_v06_rpc(
  p_community_id uuid
)
returns table (
  id uuid,
  name text,
  description text,
  members_count integer,
  initiatives_count integer,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.description,
    (select count(*)::integer
       from public.community_members_v06 m
      where m.community_id = c.id
        and m.status = 'active') as members_count,
    (select count(*)::integer
       from public.initiatives_v04 i
      where i.community_id = c.id) as initiatives_count,
    c.created_at,
    c.updated_at
  from public.communities_v06 c
  where c.id = p_community_id
    and public.is_community_manager_v14(c.id);
$$;

create or replace function public.update_community_v12_rpc(
  p_community_id uuid,
  p_name text,
  p_description text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Потрібно увійти в акаунт.'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Вкажіть назву спільноти.'; end if;
  if not public.is_community_manager_v14(p_community_id) then
    raise exception 'Спільноту не знайдено.';
  end if;

  update public.communities_v06
  set name = trim(p_name),
      description = nullif(trim(p_description),''),
      updated_at = now()
  where id = p_community_id;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Members
-- ---------------------------------------------------------------------------

create or replace function public.create_community_member_v06_rpc(
  p_community_id uuid,
  p_full_name text,
  p_email text default null
)
returns table (id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Потрібно увійти в акаунт.';
  end if;
  if not public.is_community_manager_v14(p_community_id) then
    raise exception 'Спільноту не знайдено.';
  end if;
  if nullif(trim(p_full_name), '') is null then
    raise exception 'Вкажіть імʼя учасника.';
  end if;

  return query
  insert into public.community_members_v06 (community_id, full_name, email)
  values (p_community_id, trim(p_full_name), nullif(lower(trim(p_email)), ''))
  returning community_members_v06.id;
end;
$$;

create or replace function public.get_my_members_v06_rpc(
  p_community_id uuid default null
)
returns table (
  id uuid,
  community_id uuid,
  community_name text,
  full_name text,
  email text,
  status text,
  user_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.community_id,
    c.name as community_name,
    m.full_name,
    m.email,
    m.status,
    m.user_id,
    m.created_at,
    m.updated_at
  from public.community_members_v06 m
  join public.communities_v06 c on c.id = m.community_id
  join public.community_managers_v14 cm
    on cm.community_id = c.id and cm.user_id = auth.uid()
  where (p_community_id is null or m.community_id = p_community_id)
  order by c.name, m.full_name, m.created_at;
$$;

create or replace function public.update_community_member_v13_rpc(
  p_member_id uuid,
  p_full_name text,
  p_email text default null,
  p_status text default 'active'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_email text;
  v_community_id uuid;
  v_new_email text := nullif(lower(trim(p_email)), '');
  v_status text := lower(trim(coalesce(p_status, 'active')));
begin
  if auth.uid() is null then
    raise exception 'Потрібно увійти в акаунт.';
  end if;
  if nullif(trim(p_full_name), '') is null then
    raise exception 'Вкажіть імʼя учасника.';
  end if;
  if v_status not in ('active','inactive') then
    raise exception 'Некоректний статус учасника.';
  end if;

  select m.email, m.community_id
    into v_old_email, v_community_id
  from public.community_members_v06 m
  where m.id = p_member_id
  for update;

  if v_community_id is null or not public.is_community_manager_v14(v_community_id) then
    raise exception 'Учасника не знайдено.';
  end if;

  update public.community_members_v06
  set full_name = trim(p_full_name),
      email = v_new_email,
      status = v_status,
      user_id = case
        when lower(trim(coalesce(v_old_email, ''))) is distinct from lower(trim(coalesce(v_new_email, '')))
          then null
        else user_id
      end,
      updated_at = now()
  where id = p_member_id;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Announcements
-- ---------------------------------------------------------------------------

create or replace function public.create_announcement_v12_rpc(
  p_community_id uuid,
  p_title text,
  p_body text
)
returns table(id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Потрібно увійти в акаунт.'; end if;
  if nullif(trim(p_title),'') is null then raise exception 'Вкажіть заголовок.'; end if;
  if nullif(trim(p_body),'') is null then raise exception 'Вкажіть текст оголошення.'; end if;
  if not public.is_community_manager_v14(p_community_id) then
    raise exception 'Спільноту не знайдено.';
  end if;

  return query
  insert into public.announcements_v12(community_id,title,body,created_by_user_id)
  values(p_community_id,trim(p_title),trim(p_body),auth.uid())
  returning announcements_v12.id;
end;
$$;

create or replace function public.get_manager_announcements_v12_rpc(p_community_id uuid)
returns table(
  id uuid,
  community_id uuid,
  title text,
  body text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id,a.community_id,a.title,a.body,a.created_at
  from public.announcements_v12 a
  where a.community_id = p_community_id
    and public.is_community_manager_v14(p_community_id)
  order by a.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Collections and contributions (shared by all managers of the community)
-- ---------------------------------------------------------------------------

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
  v_frequency text := coalesce(nullif(trim(p_frequency), ''), 'once');
begin
  if auth.uid() is null then raise exception 'Потрібно увійти в акаунт.'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Вкажіть назву збору.'; end if;
  if v_frequency not in ('once','monthly') then raise exception 'Некоректна регулярність.'; end if;
  if not public.is_community_manager_v14(p_community_id) then
    raise exception 'Спільноту не знайдено.';
  end if;

  return query
  insert into public.collections_v10 (community_id, name, frequency, owner_user_id)
  values (p_community_id, trim(p_name), v_frequency, auth.uid())
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
  join public.community_managers_v14 mg
    on mg.community_id = c.community_id and mg.user_id = auth.uid()
  left join public.collection_contributions_v10 cc on cc.collection_id = c.id
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
  where c.id = p_collection_id
    and public.is_community_manager_v14(c.community_id)
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
  where c.id = p_collection_id;

  if v_community_id is null or not public.is_community_manager_v14(v_community_id) then
    raise exception 'Збір не знайдено.';
  end if;

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
    and public.is_community_manager_v14(c.community_id)
  order by cc.created_at desc;
$$;

-- Unused by the current frontend; kept consistent with the new access rule.
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
  join public.community_managers_v14 mg
    on mg.community_id = c.community_id and mg.user_id = auth.uid()
  left join public.collection_contributions_v10 cc on cc.collection_id = c.id;
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
  join public.community_managers_v14 mg
    on mg.community_id = cm.id and mg.user_id = auth.uid()
  join public.collections_v10 c on c.community_id = m.community_id
  left join public.collection_contributions_v10 cc on cc.collection_id = c.id and cc.member_id = m.id
  group by m.id, m.full_name, cm.name
  having count(cc.id) > 0
  order by coalesce(sum(cc.amount),0) desc, m.full_name;
$$;

create or replace function public.get_manager_community_stats_v12_rpc(p_community_id uuid)
returns table(
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
    coalesce(sum(cc.amount),0)::numeric,
    count(cc.id)::integer,
    count(distinct cc.member_id)::integer,
    count(distinct c.id)::integer
  from public.collections_v10 c
  left join public.collection_contributions_v10 cc on cc.collection_id = c.id
  where c.community_id = p_community_id
    and public.is_community_manager_v14(p_community_id);
$$;

create or replace function public.get_manager_community_member_stats_v12_rpc(p_community_id uuid)
returns table(
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
    m.id,m.full_name,cm.name,coalesce(sum(cc.amount),0)::numeric,count(cc.id)::integer
  from public.community_members_v06 m
  join public.communities_v06 cm on cm.id = m.community_id
  join public.collections_v10 c on c.community_id = m.community_id
  left join public.collection_contributions_v10 cc on cc.collection_id = c.id and cc.member_id = m.id
  where m.community_id = p_community_id
    and public.is_community_manager_v14(p_community_id)
  group by m.id,m.full_name,cm.name
  having count(cc.id) > 0
  order by coalesce(sum(cc.amount),0) desc,m.full_name;
$$;

-- ---------------------------------------------------------------------------
-- Initiatives inside communities
-- (Initiatives are reworked in the next step; here they only follow the new
-- access rule so co-managers see the community's initiatives.)
-- ---------------------------------------------------------------------------

create or replace function public.get_my_initiatives_v06_rpc(
  p_community_id uuid default null
)
returns table (
  manager_token text,
  title text,
  status text,
  round_number integer,
  target_amount numeric,
  deadline timestamptz,
  expected_participants integer,
  proposals_count integer,
  sum_max numeric,
  created_at timestamptz,
  closed_at timestamptz,
  community_id uuid,
  community_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.manager_token,
    i.title,
    i.status,
    i.round_number,
    i.target_amount,
    i.deadline,
    i.expected_participants,
    count(p.id)::integer as proposals_count,
    coalesce(sum(p.max_amount), 0)::numeric as sum_max,
    i.created_at,
    i.closed_at,
    i.community_id,
    c.name as community_name
  from public.initiatives_v04 i
  left join public.proposals_v04 p
    on p.initiative_id = i.id
   and p.round_number = i.round_number
  left join public.communities_v06 c
    on c.id = i.community_id
  where (
      (i.community_id is not null and public.is_community_manager_v14(i.community_id))
      or (i.community_id is null and i.owner_user_id = auth.uid())
    )
    and (p_community_id is null or i.community_id = p_community_id)
  group by
    i.id, i.manager_token, i.title, i.status, i.round_number, i.target_amount,
    i.deadline, i.expected_participants, i.created_at, i.closed_at,
    i.community_id, c.name
  order by i.created_at desc;
$$;

create or replace function public.create_community_initiative_v06_rpc(
  p_community_id uuid,
  p_title text,
  p_description text default null,
  p_target_amount numeric default null,
  p_deadline timestamptz default null,
  p_expected_participants integer default null,
  p_payment_details text default null,
  p_comments_enabled boolean default true
)
returns table (manager_token text, participant_token text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Потрібно увійти в акаунт.'; end if;
  if not public.is_community_manager_v14(p_community_id) then
    raise exception 'Спільноту не знайдено.';
  end if;

  return query
  select x.manager_token, x.participant_token
  from public.create_manager_initiative_v12_rpc(
    p_community_id, p_title, p_description, p_target_amount, p_deadline,
    p_expected_participants, p_payment_details, p_comments_enabled
  ) x;
end;
$$;

create or replace function public.create_manager_initiative_v12_rpc(
  p_community_id uuid default null,
  p_title text default null,
  p_description text default null,
  p_target_amount numeric default null,
  p_deadline timestamptz default null,
  p_expected_participants integer default null,
  p_payment_details text default null,
  p_comments_enabled boolean default true
)
returns table(manager_token text, participant_token text, community_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_community_id uuid := p_community_id;
  v_email text := nullif(lower(trim(auth.jwt()->>'email')),'');
begin
  if v_user_id is null then raise exception 'Потрібно увійти в акаунт.'; end if;
  if nullif(trim(p_title),'') is null then raise exception 'Вкажіть назву ініціативи.'; end if;
  if p_target_amount is not null and p_target_amount <= 0 then raise exception 'Бюджет має бути більшим за 0.'; end if;
  if p_expected_participants is not null and p_expected_participants <= 0 then raise exception 'Кількість учасників має бути більшою за 0.'; end if;

  if v_community_id is not null and not public.is_community_manager_v14(v_community_id) then
    raise exception 'Спільноту не знайдено.';
  end if;

  if v_community_id is null then
    select m.community_id into v_community_id
    from public.community_managers_v14 m
    join public.communities_v06 c on c.id = m.community_id
    where m.user_id = v_user_id
    order by c.created_at
    limit 1;

    if v_community_id is null then
      insert into public.communities_v06(name,owner_user_id)
      values('Моя спільнота',v_user_id)
      returning id into v_community_id;
      perform public.add_creator_as_manager_v14(v_community_id);
    end if;
  end if;

  return query
  insert into public.initiatives_v04(
    title,description,target_amount,deadline,expected_participants,payment_details,
    comments_enabled,manager_email,owner_user_id,community_id
  )
  values(
    trim(p_title),nullif(trim(p_description),''),p_target_amount,p_deadline,
    p_expected_participants,nullif(trim(p_payment_details),''),coalesce(p_comments_enabled,true),
    v_email,v_user_id,v_community_id
  )
  returning initiatives_v04.manager_token,initiatives_v04.participant_token,initiatives_v04.community_id;
end;
$$;

create or replace function public.claim_initiative_v04_rpc(p_manager_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_owner uuid;
  v_initiative_id uuid;
  v_community_id uuid;
begin
  if v_user_id is null then raise exception 'Потрібно увійти в акаунт.'; end if;
  if p_manager_token is null or p_manager_token !~ '^[a-fA-F0-9]{32}$' then
    raise exception 'Некоректне посилання менеджера.';
  end if;

  select i.id,i.owner_user_id
  into v_initiative_id,v_current_owner
  from public.initiatives_v04 i
  where i.manager_token = p_manager_token
  for update;

  if not found then raise exception 'Ініціативу не знайдено.'; end if;
  if v_current_owner is not null and v_current_owner <> v_user_id then
    raise exception 'Ініціатива вже привʼязана до іншого акаунта.';
  end if;

  select m.community_id into v_community_id
  from public.community_managers_v14 m
  join public.communities_v06 c on c.id = m.community_id
  where m.user_id = v_user_id
  order by c.created_at
  limit 1;

  if v_community_id is null then
    insert into public.communities_v06(name,owner_user_id)
    values('Моя спільнота',v_user_id)
    returning id into v_community_id;
    perform public.add_creator_as_manager_v14(v_community_id);
  end if;

  update public.initiatives_v04
  set owner_user_id = v_user_id,
      community_id = coalesce(community_id,v_community_id)
  where id = v_initiative_id;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.is_community_manager_v14(uuid) from public;
revoke all on function public.add_creator_as_manager_v14(uuid) from public;
revoke all on function public.get_community_managers_v14_rpc(uuid) from public;
revoke all on function public.add_community_manager_v14_rpc(uuid,text) from public;
revoke all on function public.remove_community_manager_v14_rpc(uuid) from public;

-- Internal helpers: callable only from other security-definer functions.
revoke all on function public.is_community_manager_v14(uuid) from anon, authenticated;
revoke all on function public.add_creator_as_manager_v14(uuid) from anon, authenticated;

grant execute on function public.get_community_managers_v14_rpc(uuid) to authenticated;
grant execute on function public.add_community_manager_v14_rpc(uuid,text) to authenticated;
grant execute on function public.remove_community_manager_v14_rpc(uuid) to authenticated;
