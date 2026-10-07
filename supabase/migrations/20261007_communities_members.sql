-- Communities + community members (v0.6/v0.7 combined).
-- Standalone initiatives remain supported; community_id is optional.

create table if not exists public.communities_v06 (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(name)) > 0)
);

create index if not exists communities_v06_owner_user_id_idx
  on public.communities_v06(owner_user_id);

create table if not exists public.community_members_v06 (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities_v06(id) on delete cascade,
  full_name text not null,
  email text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(full_name)) > 0)
);

create index if not exists community_members_v06_community_id_idx
  on public.community_members_v06(community_id);

create index if not exists community_members_v06_user_id_idx
  on public.community_members_v06(user_id);

alter table public.initiatives_v04
  add column if not exists community_id uuid
  references public.communities_v06(id)
  on delete set null;

create index if not exists initiatives_v04_community_id_idx
  on public.initiatives_v04(community_id);

alter table public.communities_v06 enable row level security;
alter table public.community_members_v06 enable row level security;

revoke all on public.communities_v06 from anon, authenticated;
revoke all on public.community_members_v06 from anon, authenticated;

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
begin
  if v_user_id is null then
    raise exception 'Потрібно увійти в акаунт.';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'Вкажіть назву спільноти.';
  end if;

  return query
  insert into public.communities_v06 (name, description, owner_user_id)
  values (
    trim(p_name),
    nullif(trim(p_description), ''),
    v_user_id
  )
  returning communities_v06.id;
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
  where c.owner_user_id = auth.uid()
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
    and c.owner_user_id = auth.uid();
$$;

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
declare
  v_user_id uuid := auth.uid();
  v_email text;
begin
  if v_user_id is null then
    raise exception 'Потрібно увійти в акаунт.';
  end if;

  if not exists (
    select 1
    from public.communities_v06 c
    where c.id = p_community_id
      and c.owner_user_id = v_user_id
  ) then
    raise exception 'Спільноту не знайдено.';
  end if;

  if nullif(trim(p_full_name), '') is null then
    raise exception 'Вкажіть імʼя учасника.';
  end if;

  v_email := nullif(lower(trim(p_email)), '');

  return query
  insert into public.community_members_v06 (
    community_id,
    full_name,
    email
  )
  values (
    p_community_id,
    trim(p_full_name),
    v_email
  )
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
  where c.owner_user_id = auth.uid()
    and (p_community_id is null or m.community_id = p_community_id)
  order by c.name, m.full_name, m.created_at;
$$;

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
  where i.owner_user_id = auth.uid()
    and (p_community_id is null or i.community_id = p_community_id)
  group by
    i.id,
    i.manager_token,
    i.title,
    i.status,
    i.round_number,
    i.target_amount,
    i.deadline,
    i.expected_participants,
    i.created_at,
    i.closed_at,
    i.community_id,
    c.name
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
declare
  v_user_id uuid := auth.uid();
  v_email text := nullif(lower(trim(auth.jwt() ->> 'email')), '');
begin
  if v_user_id is null then
    raise exception 'Потрібно увійти в акаунт.';
  end if;

  if not exists (
    select 1
    from public.communities_v06 c
    where c.id = p_community_id
      and c.owner_user_id = v_user_id
  ) then
    raise exception 'Спільноту не знайдено.';
  end if;

  if nullif(trim(p_title), '') is null then
    raise exception 'Вкажіть назву ініціативи.';
  end if;

  if p_target_amount is not null and p_target_amount <= 0 then
    raise exception 'Бюджет має бути більшим за 0.';
  end if;

  if p_expected_participants is not null and p_expected_participants <= 0 then
    raise exception 'Кількість учасників має бути більшою за 0.';
  end if;

  return query
  insert into public.initiatives_v04 (
    title,
    description,
    target_amount,
    deadline,
    expected_participants,
    payment_details,
    comments_enabled,
    manager_email,
    owner_user_id,
    community_id
  )
  values (
    trim(p_title),
    nullif(trim(p_description), ''),
    p_target_amount,
    p_deadline,
    p_expected_participants,
    nullif(trim(p_payment_details), ''),
    coalesce(p_comments_enabled, true),
    v_email,
    v_user_id,
    p_community_id
  )
  returning
    initiatives_v04.manager_token,
    initiatives_v04.participant_token;
end;
$$;

revoke all on function public.create_community_v06_rpc(text, text) from public;
revoke all on function public.get_my_communities_v06_rpc() from public;
revoke all on function public.get_my_community_v06_rpc(uuid) from public;
revoke all on function public.create_community_member_v06_rpc(uuid, text, text) from public;
revoke all on function public.get_my_members_v06_rpc(uuid) from public;
revoke all on function public.get_my_initiatives_v06_rpc(uuid) from public;
revoke all on function public.create_community_initiative_v06_rpc(uuid, text, text, numeric, timestamptz, integer, text, boolean) from public;

grant execute on function public.create_community_v06_rpc(text, text) to authenticated;
grant execute on function public.get_my_communities_v06_rpc() to authenticated;
grant execute on function public.get_my_community_v06_rpc(uuid) to authenticated;
grant execute on function public.create_community_member_v06_rpc(uuid, text, text) to authenticated;
grant execute on function public.get_my_members_v06_rpc(uuid) to authenticated;
grant execute on function public.get_my_initiatives_v06_rpc(uuid) to authenticated;
grant execute on function public.create_community_initiative_v06_rpc(uuid, text, text, numeric, timestamptz, integer, text, boolean) to authenticated;
