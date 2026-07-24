create extension if not exists pgcrypto;

create table if not exists public.initiatives_v04 (
  id uuid primary key default gen_random_uuid(),
  manager_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  participant_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  title text not null,
  description text,
  target_amount numeric(14,2),
  deadline timestamptz,
  expected_participants integer,
  payment_details text,
  status text not null default 'open' check (status in ('open', 'closed')),
  round_number integer not null default 1 check (round_number > 0),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  check (target_amount is null or target_amount > 0),
  check (expected_participants is null or expected_participants > 0)
);

create table if not exists public.proposals_v04 (
  id uuid primary key default gen_random_uuid(),
  initiative_id uuid not null references public.initiatives_v04(id) on delete cascade,
  round_number integer not null,
  participant_key uuid not null,
  participant_label text not null,
  max_amount numeric(14,2) not null check (max_amount >= 0),
  recommended_amount numeric(14,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (initiative_id, round_number, participant_key)
);

create table if not exists public.round_results_v04 (
  initiative_id uuid not null references public.initiatives_v04(id) on delete cascade,
  round_number integer not null,
  target_amount numeric(14,2),
  deadline timestamptz,
  expected_participants integer,
  payment_details text,
  feasible boolean,
  sum_max numeric(14,2) not null default 0,
  gap numeric(14,2),
  proposals jsonb not null default '[]'::jsonb,
  closed_at timestamptz not null default now(),
  primary key (initiative_id, round_number)
);

alter table public.initiatives_v04 enable row level security;
alter table public.proposals_v04 enable row level security;
alter table public.round_results_v04 enable row level security;

revoke all on public.initiatives_v04 from anon, authenticated;
revoke all on public.proposals_v04 from anon, authenticated;
revoke all on public.round_results_v04 from anon, authenticated;

create or replace function public.create_initiative_v04_rpc(
  p_title text,
  p_description text default null,
  p_target_amount numeric default null,
  p_deadline timestamptz default null,
  p_expected_participants integer default null,
  p_payment_details text default null
)
returns table (manager_token text, participant_token text)
language plpgsql
security definer
set search_path = public
as $$
begin
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
    title, description, target_amount, deadline, expected_participants, payment_details
  ) values (
    trim(p_title), nullif(trim(p_description), ''), p_target_amount, p_deadline,
    p_expected_participants, nullif(trim(p_payment_details), '')
  )
  returning initiatives_v04.manager_token, initiatives_v04.participant_token;
end;
$$;

create or replace function public.get_manager_state_v04_rpc(p_manager_token text)
returns table (
  id uuid,
  title text,
  description text,
  target_amount numeric,
  deadline timestamptz,
  expected_participants integer,
  payment_details text,
  status text,
  round_number integer,
  participant_token text,
  created_at timestamptz,
  closed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.title, i.description, i.target_amount, i.deadline,
         i.expected_participants, i.payment_details, i.status, i.round_number,
         i.participant_token, i.created_at, i.closed_at
  from public.initiatives_v04 i
  where i.manager_token = p_manager_token;
$$;

create or replace function public.get_manager_proposals_v04_rpc(p_manager_token text)
returns table (
  id uuid,
  participant_label text,
  max_amount numeric,
  recommended_amount numeric,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.participant_label, p.max_amount, p.recommended_amount,
         p.created_at, p.updated_at
  from public.initiatives_v04 i
  join public.proposals_v04 p
    on p.initiative_id = i.id and p.round_number = i.round_number
  where i.manager_token = p_manager_token
  order by p.created_at, p.id;
$$;

create or replace function public.get_round_history_v04_rpc(p_manager_token text)
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
  where i.manager_token = p_manager_token
  order by h.round_number desc;
$$;

create or replace function public.get_participant_state_v04_rpc(
  p_participant_token text,
  p_participant_key uuid default null
)
returns table (
  title text,
  description text,
  target_amount numeric,
  deadline timestamptz,
  expected_participants integer,
  payment_details text,
  status text,
  round_number integer,
  own_label text,
  own_max_amount numeric,
  own_recommended_amount numeric,
  feasible boolean,
  gap numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select i.title, i.description, i.target_amount, i.deadline,
         i.expected_participants, i.payment_details, i.status, i.round_number,
         p.participant_label, p.max_amount, p.recommended_amount,
         h.feasible, h.gap
  from public.initiatives_v04 i
  left join public.proposals_v04 p
    on p.initiative_id = i.id
   and p.round_number = i.round_number
   and p.participant_key = p_participant_key
  left join public.round_results_v04 h
    on h.initiative_id = i.id and h.round_number = i.round_number
  where i.participant_token = p_participant_token;
$$;

create or replace function public.upsert_proposal_v04_rpc(
  p_participant_token text,
  p_participant_key uuid,
  p_participant_label text,
  p_max_amount numeric
)
returns table (proposal_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_initiative public.initiatives_v04%rowtype;
  v_id uuid;
begin
  select * into v_initiative
  from public.initiatives_v04
  where participant_token = p_participant_token
  for update;

  if not found then raise exception 'Ініціативу не знайдено.'; end if;
  if v_initiative.status <> 'open' then raise exception 'Раунд уже завершено.'; end if;
  if nullif(trim(p_participant_label), '') is null then raise exception 'Вкажіть, як вас ідентифікувати.'; end if;
  if p_max_amount is null or p_max_amount < 0 then raise exception 'Сума не може бути відʼємною.'; end if;

  insert into public.proposals_v04 (
    initiative_id, round_number, participant_key, participant_label, max_amount
  ) values (
    v_initiative.id, v_initiative.round_number, p_participant_key,
    trim(p_participant_label), p_max_amount
  )
  on conflict (initiative_id, round_number, participant_key)
  do update set
    participant_label = excluded.participant_label,
    max_amount = excluded.max_amount,
    recommended_amount = null,
    updated_at = now()
  returning id into v_id;

  return query select v_id;
end;
$$;

create or replace function public.close_round_v04_rpc(p_manager_token text)
returns table (round_number integer, feasible boolean, gap numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_initiative public.initiatives_v04%rowtype;
  v_target_cents bigint;
  v_sum_cents bigint;
  v_remaining bigint;
  v_active integer;
  v_share bigint;
  v_capped_count integer;
  v_capped_sum bigint;
  v_base bigint;
  v_rest bigint;
  v_feasible boolean;
  v_gap numeric(14,2);
  v_proposals jsonb;
begin
  select * into v_initiative
  from public.initiatives_v04
  where manager_token = p_manager_token
  for update;

  if not found then raise exception 'Ініціативу не знайдено.'; end if;
  if v_initiative.status <> 'open' then raise exception 'Раунд уже завершено.'; end if;

  drop table if exists pg_temp.tmp_v04_alloc;
  create temporary table tmp_v04_alloc (
    id uuid primary key,
    participant_label text,
    max_cents bigint,
    recommended_cents bigint,
    created_at timestamptz
  ) on commit drop;

  insert into tmp_v04_alloc (id, participant_label, max_cents, created_at)
  select p.id, p.participant_label,
         greatest(0, round(p.max_amount * 100)::bigint), p.created_at
  from public.proposals_v04 p
  where p.initiative_id = v_initiative.id
    and p.round_number = v_initiative.round_number;

  select coalesce(sum(max_cents), 0) into v_sum_cents from tmp_v04_alloc;

  if v_initiative.target_amount is null then
    v_feasible := null;
    v_gap := null;
  else
    v_target_cents := round(v_initiative.target_amount * 100)::bigint;
    if v_sum_cents < v_target_cents then
      v_feasible := false;
      v_gap := (v_target_cents - v_sum_cents)::numeric / 100;
    else
      v_feasible := true;
      v_gap := 0;
      v_remaining := v_target_cents;

      loop
        select count(*) into v_active
        from tmp_v04_alloc where recommended_cents is null;
        exit when v_active = 0;

        v_share := floor(v_remaining::numeric / v_active)::bigint;
        select count(*), coalesce(sum(max_cents), 0)
          into v_capped_count, v_capped_sum
        from tmp_v04_alloc
        where recommended_cents is null and max_cents <= v_share;

        exit when v_capped_count = 0;

        update tmp_v04_alloc
        set recommended_cents = max_cents
        where recommended_cents is null and max_cents <= v_share;

        v_remaining := v_remaining - v_capped_sum;
      end loop;

      select count(*) into v_active
      from tmp_v04_alloc where recommended_cents is null;

      if v_active > 0 then
        v_base := floor(v_remaining::numeric / v_active)::bigint;
        v_rest := v_remaining - v_base * v_active;

        with ranked as (
          select id, row_number() over (order by created_at, id) as rn
          from tmp_v04_alloc
          where recommended_cents is null
        )
        update tmp_v04_alloc t
        set recommended_cents = v_base + case when r.rn <= v_rest then 1 else 0 end
        from ranked r
        where t.id = r.id;
      end if;
    end if;
  end if;

  update public.proposals_v04 p
  set recommended_amount = case
        when t.recommended_cents is null then null
        else t.recommended_cents::numeric / 100
      end,
      updated_at = now()
  from tmp_v04_alloc t
  where p.id = t.id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'participant_label', participant_label,
      'max', max_cents::numeric / 100,
      'recommended', case when recommended_cents is null then null else recommended_cents::numeric / 100 end
    ) order by created_at, id
  ), '[]'::jsonb)
  into v_proposals
  from tmp_v04_alloc;

  insert into public.round_results_v04 (
    initiative_id, round_number, target_amount, deadline, expected_participants,
    payment_details, feasible, sum_max, gap, proposals, closed_at
  ) values (
    v_initiative.id, v_initiative.round_number, v_initiative.target_amount,
    v_initiative.deadline, v_initiative.expected_participants,
    v_initiative.payment_details, v_feasible, v_sum_cents::numeric / 100,
    v_gap, v_proposals, now()
  )
  on conflict (initiative_id, round_number)
  do update set
    target_amount = excluded.target_amount,
    deadline = excluded.deadline,
    expected_participants = excluded.expected_participants,
    payment_details = excluded.payment_details,
    feasible = excluded.feasible,
    sum_max = excluded.sum_max,
    gap = excluded.gap,
    proposals = excluded.proposals,
    closed_at = excluded.closed_at;

  update public.initiatives_v04
  set status = 'closed', closed_at = now()
  where id = v_initiative.id;

  return query select v_initiative.round_number, v_feasible, v_gap;
end;
$$;

create or replace function public.start_next_round_v04_rpc(
  p_manager_token text,
  p_deadline timestamptz default null
)
returns table (round_number integer, participant_token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_initiative public.initiatives_v04%rowtype;
begin
  select * into v_initiative
  from public.initiatives_v04
  where manager_token = p_manager_token
  for update;

  if not found then raise exception 'Ініціативу не знайдено.'; end if;
  if v_initiative.status <> 'closed' then raise exception 'Спочатку завершіть поточний раунд.'; end if;

  update public.initiatives_v04
  set round_number = round_number + 1,
      status = 'open',
      deadline = p_deadline,
      closed_at = null
  where id = v_initiative.id
  returning initiatives_v04.round_number, initiatives_v04.participant_token
  into round_number, participant_token;

  return next;
end;
$$;

revoke all on function public.create_initiative_v04_rpc(text, text, numeric, timestamptz, integer, text) from public;
revoke all on function public.get_manager_state_v04_rpc(text) from public;
revoke all on function public.get_manager_proposals_v04_rpc(text) from public;
revoke all on function public.get_round_history_v04_rpc(text) from public;
revoke all on function public.get_participant_state_v04_rpc(text, uuid) from public;
revoke all on function public.upsert_proposal_v04_rpc(text, uuid, text, numeric) from public;
revoke all on function public.close_round_v04_rpc(text) from public;
revoke all on function public.start_next_round_v04_rpc(text, timestamptz) from public;

grant execute on function public.create_initiative_v04_rpc(text, text, numeric, timestamptz, integer, text) to anon, authenticated;
grant execute on function public.get_manager_state_v04_rpc(text) to anon, authenticated;
grant execute on function public.get_manager_proposals_v04_rpc(text) to anon, authenticated;
grant execute on function public.get_round_history_v04_rpc(text) to anon, authenticated;
grant execute on function public.get_participant_state_v04_rpc(text, uuid) to anon, authenticated;
grant execute on function public.upsert_proposal_v04_rpc(text, uuid, text, numeric) to anon, authenticated;
grant execute on function public.close_round_v04_rpc(text) to anon, authenticated;
grant execute on function public.start_next_round_v04_rpc(text, timestamptz) to anon, authenticated;
