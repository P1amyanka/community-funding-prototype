-- Active Community context + Announcements (v1).
-- New manager workflows are community-first. Existing legacy standalone initiative links remain valid.

create table if not exists public.announcements_v12 (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities_v06(id) on delete cascade,
  title text not null,
  body text not null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(title)) > 0),
  check (length(trim(body)) > 0)
);

create index if not exists announcements_v12_community_created_idx
  on public.announcements_v12(community_id, created_at desc);

alter table public.announcements_v12 enable row level security;
revoke all on public.announcements_v12 from anon, authenticated;

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

  update public.communities_v06
  set name = trim(p_name),
      description = nullif(trim(p_description),''),
      updated_at = now()
  where id = p_community_id
    and owner_user_id = auth.uid();

  if not found then raise exception 'Спільноту не знайдено.'; end if;
  return true;
end;
$$;

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

  if not exists (
    select 1 from public.communities_v06 c
    where c.id = p_community_id and c.owner_user_id = auth.uid()
  ) then raise exception 'Спільноту не знайдено.'; end if;

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
  join public.communities_v06 c on c.id = a.community_id
  where a.community_id = p_community_id
    and c.owner_user_id = auth.uid()
  order by a.created_at desc;
$$;

create or replace function public.get_participant_announcements_v12_rpc(p_community_id uuid)
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
    and exists (
      select 1 from public.community_members_v06 m
      where m.community_id = a.community_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  order by a.created_at desc;
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

  if v_community_id is not null and not exists (
    select 1 from public.communities_v06 c
    where c.id = v_community_id and c.owner_user_id = v_user_id
  ) then
    raise exception 'Спільноту не знайдено.';
  end if;

  if v_community_id is null then
    select c.id into v_community_id
    from public.communities_v06 c
    where c.owner_user_id = v_user_id
    order by c.created_at
    limit 1;

    if v_community_id is null then
      insert into public.communities_v06(name,owner_user_id)
      values('Моя спільнота',v_user_id)
      returning id into v_community_id;
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

-- When an old anonymous initiative is claimed, attach it to a community too.
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

  select c.id into v_community_id
  from public.communities_v06 c
  where c.owner_user_id = v_user_id
  order by c.created_at
  limit 1;

  if v_community_id is null then
    insert into public.communities_v06(name,owner_user_id)
    values('Моя спільнота',v_user_id)
    returning id into v_community_id;
  end if;

  update public.initiatives_v04
  set owner_user_id = v_user_id,
      community_id = coalesce(community_id,v_community_id)
  where id = v_initiative_id;

  return true;
end;
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
  where c.owner_user_id = auth.uid()
    and c.community_id = p_community_id;
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
  join public.collections_v10 c on c.community_id = m.community_id and c.owner_user_id = auth.uid()
  left join public.collection_contributions_v10 cc on cc.collection_id = c.id and cc.member_id = m.id
  where cm.owner_user_id = auth.uid()
    and m.community_id = p_community_id
  group by m.id,m.full_name,cm.name
  having count(cc.id) > 0
  order by coalesce(sum(cc.amount),0) desc,m.full_name;
$$;

create or replace function public.get_participant_community_stats_v12_rpc(p_community_id uuid)
returns table(
  total_amount numeric,
  contributions_count integer,
  collections_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  with my_members as (
    select id
    from public.community_members_v06
    where user_id = auth.uid() and status = 'active' and community_id = p_community_id
  ),
  my_contributions as (
    select cc.*
    from public.collection_contributions_v10 cc
    join my_members m on m.id = cc.member_id
    join public.collections_v10 c on c.id = cc.collection_id and c.community_id = p_community_id
  )
  select
    coalesce((select sum(amount) from my_contributions),0)::numeric,
    (select count(*) from my_contributions)::integer,
    (select count(distinct collection_id) from my_contributions)::integer;
$$;

create or replace function public.get_participant_community_period_stats_v12_rpc(p_community_id uuid)
returns table(
  period_type text,
  month integer,
  half_year integer,
  year integer,
  total_amount numeric,
  contributions_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select cc.period_type,cc.month,cc.half_year,cc.year,sum(cc.amount)::numeric,count(cc.id)::integer
  from public.collection_contributions_v10 cc
  join public.community_members_v06 m on m.id = cc.member_id
  join public.collections_v10 c on c.id = cc.collection_id and c.community_id = m.community_id
  where m.user_id = auth.uid()
    and m.status = 'active'
    and m.community_id = p_community_id
  group by cc.period_type,cc.month,cc.half_year,cc.year
  order by cc.year desc nulls last,cc.period_type,cc.month,cc.half_year;
$$;

revoke all on function public.update_community_v12_rpc(uuid,text,text) from public;
revoke all on function public.create_announcement_v12_rpc(uuid,text,text) from public;
revoke all on function public.get_manager_announcements_v12_rpc(uuid) from public;
revoke all on function public.get_participant_announcements_v12_rpc(uuid) from public;
revoke all on function public.create_manager_initiative_v12_rpc(uuid,text,text,numeric,timestamptz,integer,text,boolean) from public;
revoke all on function public.get_manager_community_stats_v12_rpc(uuid) from public;
revoke all on function public.get_manager_community_member_stats_v12_rpc(uuid) from public;
revoke all on function public.get_participant_community_stats_v12_rpc(uuid) from public;
revoke all on function public.get_participant_community_period_stats_v12_rpc(uuid) from public;

grant execute on function public.update_community_v12_rpc(uuid,text,text) to authenticated;
grant execute on function public.create_announcement_v12_rpc(uuid,text,text) to authenticated;
grant execute on function public.get_manager_announcements_v12_rpc(uuid) to authenticated;
grant execute on function public.get_participant_announcements_v12_rpc(uuid) to authenticated;
grant execute on function public.create_manager_initiative_v12_rpc(uuid,text,text,numeric,timestamptz,integer,text,boolean) to authenticated;
grant execute on function public.get_manager_community_stats_v12_rpc(uuid) to authenticated;
grant execute on function public.get_manager_community_member_stats_v12_rpc(uuid) to authenticated;
grant execute on function public.get_participant_community_stats_v12_rpc(uuid) to authenticated;
grant execute on function public.get_participant_community_period_stats_v12_rpc(uuid) to authenticated;
