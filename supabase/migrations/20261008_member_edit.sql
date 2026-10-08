-- Member editing support.
-- Managers can edit name, email and status for members that belong to their Communities.
-- Inactive members immediately lose participant-cabinet access because participant RPCs require status='active'.
-- If a linked member's email changes, the auth link is cleared so access can be re-sent.

drop function if exists public.update_community_member_v13_rpc(uuid,text,text);

create or replace function public.update_community_member_v13_rpc(
  p_member_id uuid,
  p_full_name text,
  p_email text default null,
  p_status text default 'active'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_old_email text;
  v_new_email text := nullif(lower(trim(p_email)), '');
  v_status text := lower(trim(coalesce(p_status, 'active')));
begin
  if v_user_id is null then
    raise exception 'Потрібно увійти в акаунт.';
  end if;

  if nullif(trim(p_full_name), '') is null then
    raise exception 'Вкажіть імʼя учасника.';
  end if;

  if v_status not in ('active','inactive') then
    raise exception 'Некоректний статус учасника.';
  end if;

  select m.email
    into v_old_email
  from public.community_members_v06 m
  join public.communities_v06 c on c.id = m.community_id
  where m.id = p_member_id
    and c.owner_user_id = v_user_id
  for update;

  if not found then
    raise exception 'Учасника не знайдено.';
  end if;

  update public.community_members_v06
  set full_name = trim(p_full_name),
      email = v_new_email,
      status = v_status,
      user_id = case
        when lower(trim(coalesce(v_old_email, ''))) is distinct from lower(trim(coalesce(v_new_email, '')))
          then null
        else user_id
      end,
      updated_at = now()
  where id = p_member_id;

  return true;
end;
$$;

revoke all on function public.update_community_member_v13_rpc(uuid,text,text,text) from public;
grant execute on function public.update_community_member_v13_rpc(uuid,text,text,text) to authenticated;
