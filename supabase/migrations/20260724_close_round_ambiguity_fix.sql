create or replace function public.close_round_v04_rpc(p_manager_token text)
returns table (round_number integer, feasible boolean, gap numeric)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
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
  on conflict on constraint round_results_v04_pkey
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

revoke all on function public.close_round_v04_rpc(text) from public;
grant execute on function public.close_round_v04_rpc(text) to anon, authenticated;
