-- Initiatives inside communities (v15).
--
-- * Every initiative belongs to a community. Initiatives created before
--   communities existed are moved into the community named below.
-- * Members answer from their cabinet. A proposal is tied to the member
--   (proposals_v04.member_id); participant_key holds the same member id, so
--   the existing round logic and its uniqueness rule keep working unchanged.
-- * Managers open an initiative by id; access is checked with
--   is_community_manager_v14.
-- * The old link-based functions (manager/participant tokens, anonymous
--   creation, claiming by email) are no longer callable from the app. They
--   stay in the database only as the internal round engine for the v15
--   functions.
--
-- Requires 20261014_community_managers.sql.

-- ---------------------------------------------------------------------------
-- 1. Move initiatives without a community into the test community
-- ---------------------------------------------------------------------------

do $$
declare
  v_target_name constant text := 'Тестова спільнота';  -- change here if the name differs
  v_orphans integer;
  v_matches integer;
  v_community_id uuid;
begin
  select count(*) into v_orphans from public.initiatives_v04 where community_id is null;
  if v_orphans = 0 then
    return;
  end if;

  select count(*), min(id::text)::uuid
  into v_matches, v_community_id
  from public.communities_v06
  where lower(trim(name)) = lower(trim(v_target_name));

  if v_matches <> 1 then
    raise exception 'Потрібна рівно одна спільнота з назвою «%» (знайдено: %). Ініціатив без спільноти: %. Змініть v_target_name на початку міграції.',
      v_target_name, v_matches, v_orphans;
  end if;

  update public.initiatives_v04
  set community_id = v_community_id
  where community_id is null;

  raise notice 'Перенесено ініціатив у «%»: %', v_target_name, v_orphans;
end;
$$;

alter table public.initiatives_v04
  alter column community_id set not null;

alter table public.initiatives_v04
  drop constraint if exists initiatives_v04_community_id_fkey;
alter table public.initiatives_v04
  add constraint initiatives_v04_community_id_fkey
  foreign key (community_id) references public.communities_v06(id) on delete cascade;

-- ---------------------------------------------------------------------------
-- 2. Proposals belong to members
-- ---------------------------------------------------------------------------

alter table public.proposals_v04
  add column if not exists member_id uuid references public.community_members_v06(id) on delete cascade;

create index if not exists proposals_v04_member_id_idx on public.proposals_v04(member_id);

-- The caller's active member record in a community, or null.
create or replace function public.my_member_id_v15(p_community_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.id
  from public.community_members_v06 m
  where m.community_id = p_community_id
    and m.user_id = auth.uid()
    and m.status = 'active'
  order by m.created_at
  limit 1;
$$;

-- Initiative row for a manager of its community; raises otherwise.
create or replace function public.require_initiative_manager_v15(p_initiative_id uuid)
returns public.initiatives_v04
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.initiatives_v04%rowtype;
begin
  if auth.uid() is null then raise exception 'Потрібно увійти в акаунт.'; end if;
  select * into v from public.initiatives_v04 where id = p_initiative_id;
  if not found or not public.is_community_manager_v14(v.community_id) then
    raise exception 'Ініціативу не знайдено.';
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Manager functions
-- ---------------------------------------------------------------------------

create or replace function public.get_community_initiatives_v15_rpc(p_community_id uuid)
returns table (
  id uuid,
  title text,
  status text,
  round_number integer,
  target_amount numeric,
  deadline timestamptz,
  expected_participants integer,
  proposals_count integer,
  sum_max numeric,
  created_at timestamptz,
  closed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.id, i.title, i.status, i.round_number, i.target_amount, i.deadline,
    i.expected_participants,
    count(p.id)::integer,
    coalesce(sum(p.max_amount), 0)::numeric,
    i.created_at, i.closed_at
  from public.initiatives_v04 i
  left join public.proposals_v04 p
    on p.initiative_id = i.id and p.round_number = i.round_number
  where i.community_id = p_community_id
    and public.is_community_manager_v14(p_community_id)
  group by i.id
  order by (i.status = 'open') desc, i.created_at desc;
$$;

create or replace function public.create_initiative_v15_rpc(
  p_community_id uuid,
  p_title text,
  p_description text default null,
  p_target_amount numeric default null,
  p_deadline timestamptz default null,
  p_expected_participants integer default null,
  p_payment_details text default null,
  p_comments_enabled boolean default true
)
returns table (id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Потрібно увійти в акаунт.'; end if;
  if not public.is_community_manager_v14(p_community_id) then raise exception 'Спільноту не знайдено.'; end if;
  if nullif(trim(p_title),'') is null then raise exception 'Вкажіть назву ініціативи.'; end if;
  if p_target_amount is not null and p_target_amount <= 0 then raise exception 'Бюджет має бути більшим за 0.'; end if;
  if p_expected_participants is not null and p_expected_participants <= 0 then raise exception 'Кількість учасників має бути більшою за 0.'; end if;

  return query
  insert into public.initiatives_v04 (
    title, description, target_amount, deadline, expected_participants,
    payment_details, comments_enabled, owner_user_id, community_id
  ) values (
    trim(p_title), nullif(trim(p_description),''), p_target_amount, p_deadline,
    p_expected_participants, nullif(trim(p_payment_details),''),
    coalesce(p_comments_enabled, true), auth.uid(), p_community_id
  )
  returning initiatives_v04.id;
end;
$$;

create or replace function public.get_initiative_v15_rpc(p_initiative_id uuid)
returns table (
  id uuid,
  community_id uuid,
  community_name text,
  title text,
  description text,
  target_amount numeric,
  deadline timestamptz,
  expected_participants integer,
  payment_details text,
  comments_enabled boolean,
  status text,
  round_number integer,
  active_members_count integer,
  created_at timestamptz,
  closed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.id, i.community_id, c.name, i.title, i.description, i.target_amount,
    i.deadline, i.expected_participants, i.payment_details, i.comments_enabled,
    i.status, i.round_number,
    (select count(*)::integer from public.community_members_v06 m
      where m.community_id = i.community_id and m.status = 'active'),
    i.created_at, i.closed_at
  from public.initiatives_v04 i
  join public.communities_v06 c on c.id = i.community_id
  where i.id = p_initiative_id
    and public.is_community_manager_v14(i.community_id);
$$;

create or replace function public.get_initiative_proposals_v15_rpc(p_initiative_id uuid)
returns table (
  id uuid,
  member_id uuid,
  participant_label text,
  max_amount numeric,
  recommended_amount numeric,
  comment text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.member_id, coalesce(m.full_name, p.participant_label),
    p.max_amount, p.recommended_amount, p.comment, p.created_at, p.updated_at
  from public.initiatives_v04 i
  join public.proposals_v04 p
    on p.initiative_id = i.id and p.round_number = i.round_number
  left join public.community_members_v06 m on m.id = p.member_id
  where i.id = p_initiative_id
    and public.is_community_manager_v14(i.community_id)
  order by p.created_at, p.id;
$$;

create or replace function public.get_initiative_round_history_v15_rpc(p_initiative_id uuid)
returns table (
  round_number integer,
  target_amount numeric,
  deadline timestamptz,
  expected_participants integer,
  payment_details text,
  feasible boolean,
  sum_max numeric,
  gap numeric,
  proposals jsonb,
  closed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select h.round_number, h.target_amount, h.deadline, h.expected_participants,
         h.payment_details, h.feasible, h.sum_max, h.gap, h.proposals, h.closed_at
  from public.initiatives_v04 i
  join public.round_results_v04 h on h.initiative_id = i.id
  where i.id = p_initiative_id
    and public.is_community_manager_v14(i.community_id)
  order by h.round_number desc;
$$;

create or replace function public.close_initiative_round_v15_rpc(p_initiative_id uuid)
returns table (round_number integer, feasible boolean, gap numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.initiatives_v04%rowtype := public.require_initiative_manager_v15(p_initiative_id);
begin
  -- Keep labels in the round history in step with current member names.
  update public.proposals_v04 p
  set participant_label = m.full_name
  from public.community_members_v06 m
  where p.initiative_id = v.id
    and p.round_number = v.round_number
    and m.id = p.member_id;

  return query select * from public.close_round_v04_rpc(v.manager_token);
end;
$$;

create or replace function public.start_initiative_round_v15_rpc(
  p_initiative_id uuid,
  p_title text,
  p_description text,
  p_target_amount numeric,
  p_deadline timestamptz,
  p_expected_participants integer,
  p_payment_details text,
  p_comments_enabled boolean default null
)
returns table (round_number integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.initiatives_v04%rowtype := public.require_initiative_manager_v15(p_initiative_id);
begin
  return query
  select r.round_number
  from public.start_next_round_v04_rpc(
    v.manager_token, p_title, p_description, p_target_amount, p_deadline,
    p_expected_participants, p_payment_details, p_comments_enabled
  ) r;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Participant (member cabinet) functions
-- ---------------------------------------------------------------------------

create or replace function public.get_my_initiatives_v15_rpc(p_community_id uuid)
returns table (
  id uuid,
  title text,
  status text,
  round_number integer,
  target_amount numeric,
  deadline timestamptz,
  own_max_amount numeric,
  own_recommended_amount numeric,
  feasible boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.id, i.title, i.status, i.round_number, i.target_amount, i.deadline,
    p.max_amount, p.recommended_amount, h.feasible, i.created_at
  from public.initiatives_v04 i
  left join public.proposals_v04 p
    on p.initiative_id = i.id
   and p.round_number = i.round_number
   and p.member_id = public.my_member_id_v15(p_community_id)
  left join public.round_results_v04 h
    on h.initiative_id = i.id and h.round_number = i.round_number
  where i.community_id = p_community_id
    and public.my_member_id_v15(p_community_id) is not null
  order by (i.status = 'open') desc, i.created_at desc;
$$;

create or replace function public.get_my_initiative_v15_rpc(p_initiative_id uuid)
returns table (
  id uuid,
  community_id uuid,
  community_name text,
  title text,
  description text,
  target_amount numeric,
  deadline timestamptz,
  payment_details text,
  comments_enabled boolean,
  status text,
  round_number integer,
  own_max_amount numeric,
  own_recommended_amount numeric,
  own_comment text,
  feasible boolean,
  gap numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.id, i.community_id, c.name, i.title, i.description, i.target_amount, i.deadline,
    -- Payment details appear once the round is closed and either the budget
    -- was reached or there was no budget at all.
    case
      when i.status = 'closed' and (h.feasible is true or i.target_amount is null)
        then i.payment_details
      else null
    end,
    i.comments_enabled, i.status, i.round_number,
    p.max_amount, p.recommended_amount, p.comment,
    h.feasible, h.gap
  from public.initiatives_v04 i
  join public.communities_v06 c on c.id = i.community_id
  left join public.proposals_v04 p
    on p.initiative_id = i.id
   and p.round_number = i.round_number
   and p.member_id = public.my_member_id_v15(i.community_id)
  left join public.round_results_v04 h
    on h.initiative_id = i.id and h.round_number = i.round_number
  where i.id = p_initiative_id
    and public.my_member_id_v15(i.community_id) is not null;
$$;

create or replace function public.submit_my_proposal_v15_rpc(
  p_initiative_id uuid,
  p_max_amount numeric,
  p_comment text default null
)
returns table (proposal_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_initiative public.initiatives_v04%rowtype;
  v_member public.community_members_v06%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Потрібно увійти в акаунт.'; end if;

  select * into v_initiative from public.initiatives_v04 where id = p_initiative_id;
  if not found then raise exception 'Ініціативу не знайдено.'; end if;

  select * into v_member
  from public.community_members_v06
  where id = public.my_member_id_v15(v_initiative.community_id);
  if not found then raise exception 'Ініціативу не знайдено.'; end if;

  select r.proposal_id into v_id
  from public.upsert_proposal_v04_rpc(
    v_initiative.participant_token, v_member.id, v_member.full_name, p_max_amount, p_comment
  ) r;

  update public.proposals_v04 set member_id = v_member.id where id = v_id;

  return query select v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Roles: a manager is someone who manages a community
-- ---------------------------------------------------------------------------

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
    exists(select 1 from public.community_managers_v14 m where m.user_id = auth.uid()) as is_manager,
    exists(
      select 1 from public.community_members_v06 m
      where m.user_id = auth.uid() and m.status = 'active'
    ) as is_participant;
$$;

-- ---------------------------------------------------------------------------
-- 6. Close the old link-based and anonymous functions to the app
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname = any (array[
        'create_initiative_v04_rpc',
        'get_manager_state_v04_rpc',
        'get_manager_proposals_v04_rpc',
        'get_round_history_v04_rpc',
        'get_participant_state_v04_rpc',
        'upsert_proposal_v04_rpc',
        'close_round_v04_rpc',
        'start_next_round_v04_rpc',
        'claim_initiative_v04_rpc',
        'claim_my_email_initiatives_v04_rpc',
        'get_my_initiatives_v04_rpc',
        'get_my_initiatives_v06_rpc',
        'create_community_initiative_v06_rpc',
        'create_manager_initiative_v12_rpc'
      ])
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------------

revoke all on function public.my_member_id_v15(uuid) from public, anon, authenticated;
revoke all on function public.require_initiative_manager_v15(uuid) from public, anon, authenticated;

revoke all on function public.get_community_initiatives_v15_rpc(uuid) from public;
revoke all on function public.create_initiative_v15_rpc(uuid,text,text,numeric,timestamptz,integer,text,boolean) from public;
revoke all on function public.get_initiative_v15_rpc(uuid) from public;
revoke all on function public.get_initiative_proposals_v15_rpc(uuid) from public;
revoke all on function public.get_initiative_round_history_v15_rpc(uuid) from public;
revoke all on function public.close_initiative_round_v15_rpc(uuid) from public;
revoke all on function public.start_initiative_round_v15_rpc(uuid,text,text,numeric,timestamptz,integer,text,boolean) from public;
revoke all on function public.get_my_initiatives_v15_rpc(uuid) from public;
revoke all on function public.get_my_initiative_v15_rpc(uuid) from public;
revoke all on function public.submit_my_proposal_v15_rpc(uuid,numeric,text) from public;

grant execute on function public.get_community_initiatives_v15_rpc(uuid) to authenticated;
grant execute on function public.create_initiative_v15_rpc(uuid,text,text,numeric,timestamptz,integer,text,boolean) to authenticated;
grant execute on function public.get_initiative_v15_rpc(uuid) to authenticated;
grant execute on function public.get_initiative_proposals_v15_rpc(uuid) to authenticated;
grant execute on function public.get_initiative_round_history_v15_rpc(uuid) to authenticated;
grant execute on function public.close_initiative_round_v15_rpc(uuid) to authenticated;
grant execute on function public.start_initiative_round_v15_rpc(uuid,text,text,numeric,timestamptz,integer,text,boolean) to authenticated;
grant execute on function public.get_my_initiatives_v15_rpc(uuid) to authenticated;
grant execute on function public.get_my_initiative_v15_rpc(uuid) to authenticated;
grant execute on function public.submit_my_proposal_v15_rpc(uuid,numeric,text) to authenticated;
