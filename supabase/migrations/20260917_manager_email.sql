-- Optional manager email used to send the permanent manager link after initiative creation.

alter table public.initiatives_v04
  add column if not exists manager_email text;

-- Replace the existing 7-argument create RPC with an 8-argument version.
drop function if exists public.create_initiative_v04_rpc(
  text, text, numeric, timestamptz, integer, text, boolean
);

create function public.create_initiative_v04_rpc(
  p_title text,
  p_description text default null,
  p_target_amount numeric default null,
  p_deadline timestamptz default null,
  p_expected_participants integer default null,
  p_payment_details text default null,
  p_comments_enabled boolean default true,
  p_manager_email text default null
)
returns table (
  manager_token text,
  participant_token text
)
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
    title,
    description,
    target_amount,
    deadline,
    expected_participants,
    payment_details,
    comments_enabled,
    manager_email
  ) values (
    trim(p_title),
    nullif(trim(p_description), ''),
    p_target_amount,
    p_deadline,
    p_expected_participants,
    nullif(trim(p_payment_details), ''),
    coalesce(p_comments_enabled, true),
    nullif(lower(trim(p_manager_email)), '')
  )
  returning initiatives_v04.manager_token, initiatives_v04.participant_token;
end;
$$;

revoke all
on function public.create_initiative_v04_rpc(
  text, text, numeric, timestamptz, integer, text, boolean, text
)
from public;

grant execute
on function public.create_initiative_v04_rpc(
  text, text, numeric, timestamptz, integer, text, boolean, text
)
to anon, authenticated;
