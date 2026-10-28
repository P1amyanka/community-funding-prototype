-- Опитування типу «Варіанти» (v21): менеджер задає 2–10 варіантів, кожен
-- учасник голосує за один або кілька (якщо дозволено). Тип «Бюджет» — це
-- наявні ініціативи v15, вони не змінюються.
--
-- * initiatives_v04.poll_type: 'budget' (за замовчуванням, усі наявні) | 'choice'.
-- * Варіанти — poll_options_v21, голоси — poll_votes_v21 (голос привʼязаний
--   до картки учасника; змінити можна, поки опитування відкрите).
-- * Менеджер бачить, хто за що проголосував, і хто ще не відповів.
--   Учасник бачить кількість голосів за варіантами — після свого голосу або
--   після завершення; чужих імен не бачить.
--
-- Залежить від 20261014_initiatives_in_communities.sql (my_member_id_v15,
-- require_initiative_manager_v15) і 20261014_community_managers.sql.

alter table public.initiatives_v04
  add column if not exists poll_type text not null default 'budget',
  add column if not exists allow_multiple boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'initiatives_v04_poll_type_check') then
    alter table public.initiatives_v04
      add constraint initiatives_v04_poll_type_check check (poll_type in ('budget', 'choice'));
  end if;
end $$;

create table if not exists public.poll_options_v21 (
  id uuid primary key default gen_random_uuid(),
  initiative_id uuid not null references public.initiatives_v04(id) on delete cascade,
  label text not null check (length(trim(label)) > 0 and length(label) <= 200),
  position integer not null,
  created_at timestamptz not null default now()
);
create index if not exists poll_options_v21_initiative_idx on public.poll_options_v21(initiative_id, position);

create table if not exists public.poll_votes_v21 (
  id uuid primary key default gen_random_uuid(),
  initiative_id uuid not null references public.initiatives_v04(id) on delete cascade,
  option_id uuid not null references public.poll_options_v21(id) on delete cascade,
  member_id uuid not null references public.community_members_v06(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (option_id, member_id)
);
create index if not exists poll_votes_v21_initiative_idx on public.poll_votes_v21(initiative_id, member_id);

alter table public.poll_options_v21 enable row level security;
alter table public.poll_votes_v21 enable row level security;
revoke all on table public.poll_options_v21 from public, anon, authenticated;
revoke all on table public.poll_votes_v21 from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Менеджер
-- ---------------------------------------------------------------------------

create or replace function public.create_choice_poll_v21_rpc(
  p_community_id uuid,
  p_title text,
  p_description text default null,
  p_options text[] default null,
  p_allow_multiple boolean default false,
  p_deadline timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_options text[];
begin
  if auth.uid() is null then raise exception 'Потрібно увійти в акаунт.'; end if;
  if not public.is_community_manager_v14(p_community_id) then raise exception 'Спільноту не знайдено.'; end if;
  if nullif(trim(p_title), '') is null then raise exception 'Вкажіть назву опитування.'; end if;

  select array_agg(o order by ord) into v_options
  from (
    select trim(x) as o, min(n) as ord
    from unnest(coalesce(p_options, '{}'::text[])) with ordinality as t(x, n)
    where nullif(trim(x), '') is not null
    group by trim(x)
  ) s;

  if coalesce(array_length(v_options, 1), 0) < 2 then raise exception 'Додайте щонайменше 2 різні варіанти.'; end if;
  if array_length(v_options, 1) > 10 then raise exception 'Можна додати не більше 10 варіантів.'; end if;
  if exists (select 1 from unnest(v_options) o where length(o) > 200) then raise exception 'Варіант задовгий (до 200 символів).'; end if;

  insert into public.initiatives_v04 (
    title, description, deadline, owner_user_id, community_id, poll_type, allow_multiple, comments_enabled
  ) values (
    trim(p_title), nullif(trim(p_description), ''), p_deadline, auth.uid(), p_community_id,
    'choice', coalesce(p_allow_multiple, false), false
  )
  returning id into v_id;

  insert into public.poll_options_v21 (initiative_id, label, position)
  select v_id, o, n::integer from unnest(v_options) with ordinality as t(o, n);

  return v_id;
end;
$$;

-- Список опитувань спільноти для менеджера (обох типів).
create or replace function public.get_community_polls_v21_rpc(p_community_id uuid)
returns table (
  id uuid,
  poll_type text,
  title text,
  status text,
  round_number integer,
  target_amount numeric,
  deadline timestamptz,
  answers_count integer,
  sum_max numeric,
  leading_option text,
  created_at timestamptz,
  closed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.id, i.poll_type, i.title, i.status, i.round_number, i.target_amount, i.deadline,
    case when i.poll_type = 'choice'
      then (select count(distinct v.member_id) from public.poll_votes_v21 v where v.initiative_id = i.id)
      else (select count(*) from public.proposals_v04 p where p.initiative_id = i.id and p.round_number = i.round_number)
    end::integer,
    case when i.poll_type = 'budget'
      then (select coalesce(sum(p.max_amount), 0) from public.proposals_v04 p where p.initiative_id = i.id and p.round_number = i.round_number)
    end::numeric,
    case when i.poll_type = 'choice' then (
      select o.label from public.poll_options_v21 o
      left join public.poll_votes_v21 v on v.option_id = o.id
      where o.initiative_id = i.id
      group by o.id, o.label, o.position
      having count(v.id) > 0
      order by count(v.id) desc, o.position
      limit 1
    ) end,
    i.created_at, i.closed_at
  from public.initiatives_v04 i
  where i.community_id = p_community_id
    and public.is_community_manager_v14(p_community_id)
  order by (i.status = 'open') desc, i.created_at desc;
$$;

-- Опитування «Варіанти» для менеджера: варіанти з голосами й іменами, хто ще не відповів.
create or replace function public.get_choice_poll_v21_rpc(p_initiative_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.initiatives_v04%rowtype := public.require_initiative_manager_v15(p_initiative_id);
begin
  if v.poll_type <> 'choice' then raise exception 'Опитування не знайдено.'; end if;
  return jsonb_build_object(
    'id', v.id,
    'title', v.title,
    'description', v.description,
    'deadline', v.deadline,
    'status', v.status,
    'closed_at', v.closed_at,
    'allow_multiple', v.allow_multiple,
    'community_id', v.community_id,
    'voters_count', (select count(distinct x.member_id) from public.poll_votes_v21 x where x.initiative_id = v.id),
    'options', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id,
        'label', o.label,
        'votes', (select count(*) from public.poll_votes_v21 x where x.option_id = o.id),
        'voters', coalesce((
          select jsonb_agg(m.full_name order by m.full_name)
          from public.poll_votes_v21 x join public.community_members_v06 m on m.id = x.member_id
          where x.option_id = o.id
        ), '[]'::jsonb)
      ) order by o.position)
      from public.poll_options_v21 o where o.initiative_id = v.id
    ), '[]'::jsonb),
    'not_voted', coalesce((
      select jsonb_agg(m.full_name order by m.full_name)
      from public.community_members_v06 m
      where m.community_id = v.community_id and m.status = 'active'
        and not exists (select 1 from public.poll_votes_v21 x where x.initiative_id = v.id and x.member_id = m.id)
    ), '[]'::jsonb)
  );
end;
$$;

-- Завершити або знову відкрити опитування «Варіанти».
create or replace function public.set_choice_poll_status_v21_rpc(p_initiative_id uuid, p_status text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.initiatives_v04%rowtype := public.require_initiative_manager_v15(p_initiative_id);
begin
  if v.poll_type <> 'choice' then raise exception 'Опитування не знайдено.'; end if;
  if p_status not in ('open', 'closed') then raise exception 'Некоректний статус.'; end if;
  update public.initiatives_v04
  set status = p_status,
      closed_at = case when p_status = 'closed' then now() else null end
  where id = v.id;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Учасник
-- ---------------------------------------------------------------------------

create or replace function public.get_my_polls_v21_rpc(p_community_id uuid)
returns table (
  id uuid,
  poll_type text,
  title text,
  status text,
  round_number integer,
  target_amount numeric,
  deadline timestamptz,
  own_max_amount numeric,
  own_recommended_amount numeric,
  feasible boolean,
  own_voted boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.id, i.poll_type, i.title, i.status, i.round_number, i.target_amount, i.deadline,
    p.max_amount, p.recommended_amount, h.feasible,
    exists (
      select 1 from public.poll_votes_v21 x
      where x.initiative_id = i.id and x.member_id = public.my_member_id_v15(p_community_id)
    ),
    i.created_at
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

create or replace function public.get_my_choice_poll_v21_rpc(p_initiative_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.initiatives_v04%rowtype;
  v_member uuid;
  v_voted boolean;
  v_show boolean;
begin
  if auth.uid() is null then raise exception 'Потрібно увійти в акаунт.'; end if;
  select * into v from public.initiatives_v04 where id = p_initiative_id and poll_type = 'choice';
  if not found then raise exception 'Опитування не знайдено.'; end if;
  v_member := public.my_member_id_v15(v.community_id);
  if v_member is null then raise exception 'Опитування не знайдено.'; end if;

  v_voted := exists (select 1 from public.poll_votes_v21 x where x.initiative_id = v.id and x.member_id = v_member);
  v_show := v_voted or v.status = 'closed';

  return jsonb_build_object(
    'id', v.id,
    'community_name', (select c.name from public.communities_v06 c where c.id = v.community_id),
    'title', v.title,
    'description', v.description,
    'deadline', v.deadline,
    'status', v.status,
    'allow_multiple', v.allow_multiple,
    'voted', v_voted,
    'show_results', v_show,
    'voters_count', case when v_show then (select count(distinct x.member_id) from public.poll_votes_v21 x where x.initiative_id = v.id) end,
    'options', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id,
        'label', o.label,
        'mine', exists (select 1 from public.poll_votes_v21 x where x.option_id = o.id and x.member_id = v_member),
        'votes', case when v_show then (select count(*) from public.poll_votes_v21 x where x.option_id = o.id) end
      ) order by o.position)
      from public.poll_options_v21 o where o.initiative_id = v.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.submit_my_vote_v21_rpc(p_initiative_id uuid, p_option_ids uuid[])
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.initiatives_v04%rowtype;
  v_member uuid;
  v_ids uuid[];
begin
  if auth.uid() is null then raise exception 'Потрібно увійти в акаунт.'; end if;
  select * into v from public.initiatives_v04 where id = p_initiative_id and poll_type = 'choice' for update;
  if not found then raise exception 'Опитування не знайдено.'; end if;
  v_member := public.my_member_id_v15(v.community_id);
  if v_member is null then raise exception 'Опитування не знайдено.'; end if;
  if v.status <> 'open' then raise exception 'Опитування вже завершено.'; end if;
  if v.deadline is not null and v.deadline < now() then raise exception 'Час для відповідей минув.'; end if;

  select array_agg(distinct x) into v_ids from unnest(coalesce(p_option_ids, '{}'::uuid[])) x;
  if coalesce(array_length(v_ids, 1), 0) = 0 then raise exception 'Оберіть варіант.'; end if;
  if not v.allow_multiple and array_length(v_ids, 1) > 1 then raise exception 'Можна обрати лише один варіант.'; end if;
  if exists (
    select 1 from unnest(v_ids) x
    where not exists (select 1 from public.poll_options_v21 o where o.id = x and o.initiative_id = v.id)
  ) then raise exception 'Варіант не знайдено.'; end if;

  delete from public.poll_votes_v21 where initiative_id = v.id and member_id = v_member;
  insert into public.poll_votes_v21 (initiative_id, option_id, member_id)
  select v.id, x, v_member from unnest(v_ids) x;
  return true;
end;
$$;

revoke all on function public.create_choice_poll_v21_rpc(uuid, text, text, text[], boolean, timestamptz) from public;
revoke all on function public.get_community_polls_v21_rpc(uuid) from public;
revoke all on function public.get_choice_poll_v21_rpc(uuid) from public;
revoke all on function public.set_choice_poll_status_v21_rpc(uuid, text) from public;
revoke all on function public.get_my_polls_v21_rpc(uuid) from public;
revoke all on function public.get_my_choice_poll_v21_rpc(uuid) from public;
revoke all on function public.submit_my_vote_v21_rpc(uuid, uuid[]) from public;
grant execute on function public.create_choice_poll_v21_rpc(uuid, text, text, text[], boolean, timestamptz) to authenticated;
grant execute on function public.get_community_polls_v21_rpc(uuid) to authenticated;
grant execute on function public.get_choice_poll_v21_rpc(uuid) to authenticated;
grant execute on function public.set_choice_poll_status_v21_rpc(uuid, text) to authenticated;
grant execute on function public.get_my_polls_v21_rpc(uuid) to authenticated;
grant execute on function public.get_my_choice_poll_v21_rpc(uuid) to authenticated;
grant execute on function public.submit_my_vote_v21_rpc(uuid, uuid[]) to authenticated;
