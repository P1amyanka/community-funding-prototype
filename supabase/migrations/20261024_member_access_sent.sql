-- «Надіслати доступ»: зберігаємо, коли менеджер востаннє надіслав учаснику
-- посилання для входу, щоб у списку учасників був статус «Запрошено <дата>».
-- Залежить від 20261014_community_managers.sql (is_community_manager_v14).

alter table public.community_members_v06
  add column if not exists access_sent_at timestamptz;

-- Зміна email відвʼязує акаунт (update_community_member_v13_rpc), тож і старе
-- запрошення більше не дійсне.
create or replace function public.reset_member_access_sent_v19()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if lower(trim(coalesce(new.email, ''))) is distinct from lower(trim(coalesce(old.email, ''))) then
    new.access_sent_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists community_members_v06_reset_access_sent on public.community_members_v06;
create trigger community_members_v06_reset_access_sent
  before update of email on public.community_members_v06
  for each row execute function public.reset_member_access_sent_v19();

create or replace function public.mark_member_access_sent_v19_rpc(p_member_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_community_id uuid;
  v_sent_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Потрібно увійти в акаунт.';
  end if;

  select m.community_id into v_community_id
  from public.community_members_v06 m
  where m.id = p_member_id and m.email is not null;

  if v_community_id is null or not public.is_community_manager_v14(v_community_id) then
    raise exception 'Учасника не знайдено.';
  end if;

  update public.community_members_v06
  set access_sent_at = now()
  where id = p_member_id
  returning access_sent_at into v_sent_at;

  return v_sent_at;
end;
$$;

revoke all on function public.mark_member_access_sent_v19_rpc(uuid) from public;
grant execute on function public.mark_member_access_sent_v19_rpc(uuid) to authenticated;

-- Як get_my_members_v06_rpc, плюс access_sent_at.
create or replace function public.get_my_members_v19_rpc(
  p_community_id uuid default null
)
returns table (
  id uuid,
  community_id uuid,
  community_name text,
  full_name text,
  email text,
  status text,
  user_id uuid,
  access_sent_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.community_id,
    c.name as community_name,
    m.full_name,
    m.email,
    m.status,
    m.user_id,
    m.access_sent_at,
    m.created_at,
    m.updated_at
  from public.community_members_v06 m
  join public.communities_v06 c on c.id = m.community_id
  join public.community_managers_v14 cm
    on cm.community_id = c.id and cm.user_id = auth.uid()
  where (p_community_id is null or m.community_id = p_community_id)
  order by c.name, m.full_name, m.created_at;
$$;

revoke all on function public.get_my_members_v19_rpc(uuid) from public;
grant execute on function public.get_my_members_v19_rpc(uuid) to authenticated;
