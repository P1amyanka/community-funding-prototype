-- Participant auth + participant cabinet.
-- One auth user can be linked to multiple community_members_v06 rows (across communities)
-- through the same normalized email.

create or replace function public.claim_my_memberships_v11_rpc()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(trim(coalesce(auth.jwt()->>'email','')));
  v_count integer := 0;
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

  get diagnostics v_count = row_count;
  return v_count;
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
      exists(select 1 from public.communities_v06 c where c.owner_user_id = auth.uid())
      or exists(select 1 from public.initiatives_v04 i where i.owner_user_id = auth.uid())
    ) as is_manager,
    exists(
      select 1 from public.community_members_v06 m
      where m.user_id = auth.uid() and m.status = 'active'
    ) as is_participant;
$$;

create or replace function public.get_my_participant_memberships_v11_rpc()
returns table (
  member_id uuid,
  community_id uuid,
  community_name text,
  full_name text,
  email text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.community_id,
    c.name,
    m.full_name,
    m.email
  from public.community_members_v06 m
  join public.communities_v06 c on c.id = m.community_id
  where m.user_id = auth.uid()
    and m.status = 'active'
  order by c.name, m.full_name;
$$;

create or replace function public.get_my_participant_collections_v11_rpc()
returns table (
  id uuid,
  community_id uuid,
  community_name text,
  name text,
  frequency text,
  personal_amount numeric,
  personal_contributions_count integer
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
    coalesce(sum(cc.amount),0)::numeric as personal_amount,
    count(cc.id)::integer as personal_contributions_count
  from public.collections_v10 c
  join public.communities_v06 cm on cm.id = c.community_id
  join public.community_members_v06 m
    on m.community_id = c.community_id
   and m.user_id = auth.uid()
   and m.status = 'active'
  left join public.collection_contributions_v10 cc
    on cc.collection_id = c.id
   and cc.member_id = m.id
  group by c.id, c.community_id, cm.name, c.name, c.frequency, c.created_at
  order by c.created_at desc;
$$;

create or replace function public.get_my_participant_collection_v11_rpc(p_collection_id uuid)
returns table (
  id uuid,
  community_id uuid,
  community_name text,
  name text,
  frequency text,
  personal_amount numeric,
  personal_contributions_count integer
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
    coalesce(sum(cc.amount),0)::numeric as personal_amount,
    count(cc.id)::integer as personal_contributions_count
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
  group by c.id, c.community_id, cm.name, c.name, c.frequency;
$$;

create or replace function public.get_my_participant_contributions_v11_rpc(p_collection_id uuid)
returns table (
  id uuid,
  amount numeric,
  period_type text,
  month integer,
  half_year integer,
  year integer,
  note text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cc.id,
    cc.amount,
    cc.period_type,
    cc.month,
    cc.half_year,
    cc.year,
    cc.note
  from public.collection_contributions_v10 cc
  join public.community_members_v06 m on m.id = cc.member_id
  join public.collections_v10 c on c.id = cc.collection_id
  where cc.collection_id = p_collection_id
    and m.user_id = auth.uid()
    and m.status = 'active'
    and m.community_id = c.community_id
  order by cc.created_at desc;
$$;

create or replace function public.get_my_participant_stats_v11_rpc()
returns table (
  total_amount numeric,
  contributions_count integer,
  collections_count integer,
  communities_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  with my_members as (
    select id, community_id
    from public.community_members_v06
    where user_id = auth.uid() and status = 'active'
  ),
  my_contributions as (
    select cc.*
    from public.collection_contributions_v10 cc
    join my_members m on m.id = cc.member_id
    join public.collections_v10 c
      on c.id = cc.collection_id
     and c.community_id = m.community_id
  )
  select
    coalesce((select sum(amount) from my_contributions),0)::numeric,
    (select count(*) from my_contributions)::integer,
    (select count(distinct collection_id) from my_contributions)::integer,
    (select count(distinct community_id) from my_members)::integer;
$$;

create or replace function public.get_my_participant_period_stats_v11_rpc()
returns table (
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
  select
    cc.period_type,
    cc.month,
    cc.half_year,
    cc.year,
    sum(cc.amount)::numeric,
    count(cc.id)::integer
  from public.collection_contributions_v10 cc
  join public.community_members_v06 m on m.id = cc.member_id
  join public.collections_v10 c
    on c.id = cc.collection_id
   and c.community_id = m.community_id
  where m.user_id = auth.uid()
    and m.status = 'active'
  group by cc.period_type, cc.month, cc.half_year, cc.year
  order by cc.year desc nulls last, cc.period_type, cc.month, cc.half_year;
$$;

revoke all on function public.claim_my_memberships_v11_rpc() from public;
revoke all on function public.get_my_account_roles_v11_rpc() from public;
revoke all on function public.get_my_participant_memberships_v11_rpc() from public;
revoke all on function public.get_my_participant_collections_v11_rpc() from public;
revoke all on function public.get_my_participant_collection_v11_rpc(uuid) from public;
revoke all on function public.get_my_participant_contributions_v11_rpc(uuid) from public;
revoke all on function public.get_my_participant_stats_v11_rpc() from public;
revoke all on function public.get_my_participant_period_stats_v11_rpc() from public;

grant execute on function public.claim_my_memberships_v11_rpc() to authenticated;
grant execute on function public.get_my_account_roles_v11_rpc() to authenticated;
grant execute on function public.get_my_participant_memberships_v11_rpc() to authenticated;
grant execute on function public.get_my_participant_collections_v11_rpc() to authenticated;
grant execute on function public.get_my_participant_collection_v11_rpc(uuid) to authenticated;
grant execute on function public.get_my_participant_contributions_v11_rpc(uuid) to authenticated;
grant execute on function public.get_my_participant_stats_v11_rpc() to authenticated;
grant execute on function public.get_my_participant_period_stats_v11_rpc() to authenticated;
