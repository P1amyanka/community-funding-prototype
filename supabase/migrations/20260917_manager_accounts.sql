-- Manager account ownership for initiatives.
-- Existing anonymous manager-token access remains unchanged.

alter table public.initiatives_v04
  add column if not exists owner_user_id uuid
  references auth.users(id)
  on delete set null;

create index if not exists initiatives_v04_owner_user_id_idx
  on public.initiatives_v04(owner_user_id);

create index if not exists initiatives_v04_manager_email_idx
  on public.initiatives_v04(lower(manager_email));

create or replace function public.create_initiative_v04_rpc(
  p_title text,
  p_description text default null,
  p_target_amount numeric default null,
  p_deadline timestamptz default null,
  p_expected_participants integer default null,
  p_payment_details text default null,
  p_comments_enabled boolean default true,
  p_manager_email text default null
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
    title,
    description,
    target_amount,
    deadline,
    expected_participants,
    payment_details,
    comments_enabled,
    manager_email,
    owner_user_id
  )
  values (
    trim(p_title),
    nullif(trim(p_description), ''),
    p_target_amount,
    p_deadline,
    p_expected_participants,
    nullif(trim(p_payment_details), ''),
    coalesce(p_comments_enabled, true),
    nullif(lower(trim(p_manager_email)), ''),
    auth.uid()
  )
  returning
    initiatives_v04.manager_token,
    initiatives_v04.participant_token;
end;
$$;

create or replace function public.claim_my_email_initiatives_v04_rpc()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_email text;
  v_count integer;
begin
  v_user_id := auth.uid();
  v_email := lower(nullif(trim(auth.jwt() ->> 'email'), ''));

  if v_user_id is null then
    raise exception 'Потрібно увійти в акаунт.';
  end if;

  if v_email is null then
    raise exception 'Email користувача не знайдено.';
  end if;

  update public.initiatives_v04
  set owner_user_id = v_user_id
  where owner_user_id is null
    and manager_email is not null
    and lower(trim(manager_email)) = v_email;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.get_my_initiatives_v04_rpc()
returns table (
  manager_token text,
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
    i.manager_token,
    i.title,
    i.status,
    i.round_number,
    i.target_amount,
    i.deadline,
    i.expected_participants,
    count(p.id)::integer as proposals_count,
    coalesce(sum(p.max_amount), 0)::numeric as sum_max,
    i.created_at,
    i.closed_at
  from public.initiatives_v04 i
  left join public.proposals_v04 p
    on p.initiative_id = i.id
   and p.round_number = i.round_number
  where i.owner_user_id = auth.uid()
  group by
    i.id,
    i.manager_token,
    i.title,
    i.status,
    i.round_number,
    i.target_amount,
    i.deadline,
    i.expected_participants,
    i.created_at,
    i.closed_at
  order by i.created_at desc;
$$;

revoke all on function public.claim_my_email_initiatives_v04_rpc() from public;
revoke all on function public.get_my_initiatives_v04_rpc() from public;

grant execute on function public.claim_my_email_initiatives_v04_rpc()
  to authenticated;

grant execute on function public.get_my_initiatives_v04_rpc()
  to authenticated;

grant execute on function public.create_initiative_v04_rpc(
  text, text, numeric, timestamptz, integer, text, boolean, text
) to anon, authenticated;

grant select on table public.initiatives_v04 to service_role;
