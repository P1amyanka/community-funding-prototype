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
         i.expected_participants,
         case
           when i.status = 'closed' and h.feasible is true then i.payment_details
           else null
         end as payment_details,
         i.status, i.round_number,
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

  update public.initiatives_v04 as i
  set round_number = i.round_number + 1,
      status = 'open',
      deadline = p_deadline,
      closed_at = null
  where i.id = v_initiative.id
  returning i.round_number, i.participant_token
  into round_number, participant_token;

  return next;
end;
$$;

revoke all on function public.get_participant_state_v04_rpc(text, uuid) from public;
revoke all on function public.start_next_round_v04_rpc(text, timestamptz) from public;

grant execute on function public.get_participant_state_v04_rpc(text, uuid) to anon, authenticated;
grant execute on function public.start_next_round_v04_rpc(text, timestamptz) to anon, authenticated;
