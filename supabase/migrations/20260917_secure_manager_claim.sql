-- Replace email-only ownership claiming with manager-token proof.
-- A stored manager_email was not verified when old initiatives were created,
-- so it must not be used by itself to establish ownership.

drop function if exists public.claim_my_email_initiatives_v04_rpc();

create or replace function public.claim_initiative_v04_rpc(
  p_manager_token text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_owner uuid;
begin
  if v_user_id is null then
    raise exception 'Потрібно увійти в акаунт.';
  end if;

  if p_manager_token is null or p_manager_token !~ '^[a-fA-F0-9]{32}$' then
    raise exception 'Некоректне посилання менеджера.';
  end if;

  select i.owner_user_id
    into v_current_owner
  from public.initiatives_v04 i
  where i.manager_token = p_manager_token
  for update;

  if not found then
    raise exception 'Ініціативу не знайдено.';
  end if;

  if v_current_owner is null then
    update public.initiatives_v04
    set owner_user_id = v_user_id
    where manager_token = p_manager_token;
    return true;
  end if;

  if v_current_owner = v_user_id then
    return true;
  end if;

  raise exception 'Ініціатива вже привʼязана до іншого акаунта.';
end;
$$;

revoke all on function public.claim_initiative_v04_rpc(text) from public;
grant execute on function public.claim_initiative_v04_rpc(text) to authenticated;
