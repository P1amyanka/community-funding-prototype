create or replace function public.start_next_round_v04_rpc(
  p_manager_token text,
  p_title text,
  p_description text,
  p_target_amount numeric,
  p_deadline timestamptz,
  p_expected_participants integer,
  p_payment_details text
)
returns table (
  round_number integer,
  participant_token text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_initiative public.initiatives_v04%rowtype;
begin
  select *
  into v_initiative
  from public.initiatives_v04
  where manager_token = p_manager_token
  for update;

  if not found then
    raise exception 'Ініціативу не знайдено.';
  end if;

  if v_initiative.status <> 'closed' then
    raise exception 'Спочатку завершіть поточний раунд.';
  end if;

  if nullif(trim(coalesce(p_title, '')), '') is null then
    raise exception 'Вкажіть назву ініціативи.';
  end if;

  if p_target_amount is not null and p_target_amount <= 0 then
    raise exception 'Бюджет має бути більшим за 0.';
  end if;

  if p_expected_participants is not null and p_expected_participants <= 0 then
    raise exception 'Кількість учасників має бути більшою за 0.';
  end if;

  update public.initiatives_v04 as i
  set round_number = i.round_number + 1,
      title = trim(p_title),
      description = nullif(trim(coalesce(p_description, '')), ''),
      target_amount = p_target_amount,
      deadline = p_deadline,
      expected_participants = p_expected_participants,
      payment_details = nullif(trim(coalesce(p_payment_details, '')), ''),
      status = 'open',
      closed_at = null,
      updated_at = now()
  where i.id = v_initiative.id
  returning i.round_number, i.participant_token
  into round_number, participant_token;

  return next;
end;
$$;

revoke all
on function public.start_next_round_v04_rpc(text, text, text, numeric, timestamptz, integer, text)
from public;

grant execute
on function public.start_next_round_v04_rpc(text, text, text, numeric, timestamptz, integer, text)
to anon, authenticated;
