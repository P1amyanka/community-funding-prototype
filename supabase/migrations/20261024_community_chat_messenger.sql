-- Месенджер чату класу (Telegram або Viber) — щоб кнопка «Поділитися»
-- на оголошенні відкривала саме його. Залежить від 20261014_community_managers.sql.

alter table public.communities_v06
  add column if not exists chat_messenger text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'communities_v06_chat_messenger_check') then
    alter table public.communities_v06
      add constraint communities_v06_chat_messenger_check
      check (chat_messenger is null or chat_messenger in ('telegram', 'viber'));
  end if;
end $$;

create or replace function public.get_community_chat_messenger_v20_rpc(p_community_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_messenger text;
begin
  if auth.uid() is null or not public.is_community_manager_v14(p_community_id) then
    raise exception 'Спільноту не знайдено.';
  end if;
  select c.chat_messenger into v_messenger from public.communities_v06 c where c.id = p_community_id;
  return v_messenger;
end;
$$;

create or replace function public.set_community_chat_messenger_v20_rpc(p_community_id uuid, p_messenger text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_messenger text := nullif(lower(trim(coalesce(p_messenger, ''))), '');
begin
  if auth.uid() is null or not public.is_community_manager_v14(p_community_id) then
    raise exception 'Спільноту не знайдено.';
  end if;
  if v_messenger is not null and v_messenger not in ('telegram', 'viber') then
    raise exception 'Некоректний месенджер.';
  end if;
  update public.communities_v06 set chat_messenger = v_messenger, updated_at = now() where id = p_community_id;
  return true;
end;
$$;

revoke all on function public.get_community_chat_messenger_v20_rpc(uuid) from public;
revoke all on function public.set_community_chat_messenger_v20_rpc(uuid, text) from public;
grant execute on function public.get_community_chat_messenger_v20_rpc(uuid) to authenticated;
grant execute on function public.set_community_chat_messenger_v20_rpc(uuid, text) to authenticated;
