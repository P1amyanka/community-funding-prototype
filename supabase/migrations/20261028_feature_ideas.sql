-- «Що додати в Comfundy?» (v22): перелік запланованих можливостей, за які
-- менеджери ставлять ❤️. Голосують лише менеджери (хоч однієї спільноти);
-- кількість лайків бачать усі менеджери. Перелік і статуси власниця веде
-- через SQL Editor (див. приклади наприкінці файлу).
-- Залежить від 20261014_community_managers.sql (community_managers_v14).

create table if not exists public.feature_ideas_v22 (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  description text,
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'done', 'hidden')),
  position integer not null default 100,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.feature_idea_votes_v22 (
  idea_id uuid not null references public.feature_ideas_v22(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (idea_id, user_id)
);

alter table public.feature_ideas_v22 enable row level security;
alter table public.feature_idea_votes_v22 enable row level security;
revoke all on table public.feature_ideas_v22 from public, anon, authenticated;
revoke all on table public.feature_idea_votes_v22 from public, anon, authenticated;

-- Стартовий перелік — лише якщо таблиця порожня.
insert into public.feature_ideas_v22 (title, description, position)
select x.title, x.description, x.position
from (values
  ('Оголошення автоматично в Telegram-групу класу', 'Опублікували оголошення в Comfundy — воно саме з’являється в групі класу.', 20),
  ('Лист на email про нове оголошення', 'Батьки дізнаються про оголошення без нагадувань у чаті.', 30),
  ('Застосунок на телефоні зі сповіщеннями', 'Comfundy на екрані телефону і push-сповіщення про нове.', 40),
  ('Нагадування батькам про внесок', 'Comfundy сам делікатно нагадує тим, хто ще не вніс.', 50),
  ('Оплати з банківської виписки', 'Завантажте виписку банки — Comfundy сам розкладе оплати по батьках.', 60),
  ('Витрати і залишок фонду', 'Записуйте, на що витратили гроші, і бачте, скільки лишилось.', 70),
  ('Звіт для батьків', 'Сторінка або PDF: скільки зібрали і на що витратили.', 80)
) as x(title, description, position)
where not exists (select 1 from public.feature_ideas_v22);

create or replace function public.is_any_manager_v22()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (select 1 from public.community_managers_v14 cm where cm.user_id = auth.uid());
$$;

create or replace function public.get_feature_ideas_v22_rpc()
returns table (
  id uuid,
  title text,
  description text,
  status text,
  votes integer,
  my_vote boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_any_manager_v22() then raise exception 'Розділ доступний менеджерам спільнот.'; end if;
  return query
  select i.id, i.title, i.description, i.status,
    (select count(*) from public.feature_idea_votes_v22 v where v.idea_id = i.id)::integer,
    exists (select 1 from public.feature_idea_votes_v22 v where v.idea_id = i.id and v.user_id = auth.uid()),
    i.created_at
  from public.feature_ideas_v22 i
  where i.status in ('planned', 'in_progress')
  order by i.position, i.created_at;
end;
$$;

-- Поставити або зняти ❤️. Повертає новий стан і кількість.
create or replace function public.toggle_feature_idea_vote_v22_rpc(p_idea_id uuid)
returns table (my_vote boolean, votes integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not public.is_any_manager_v22() then raise exception 'Розділ доступний менеджерам спільнот.'; end if;
  select i.status into v_status from public.feature_ideas_v22 i where i.id = p_idea_id;
  if v_status is null then raise exception 'Ідею не знайдено.'; end if;
  if v_status not in ('planned', 'in_progress') then raise exception 'Ідею не знайдено.'; end if;

  if exists (select 1 from public.feature_idea_votes_v22 v where v.idea_id = p_idea_id and v.user_id = auth.uid()) then
    delete from public.feature_idea_votes_v22 v where v.idea_id = p_idea_id and v.user_id = auth.uid();
  else
    insert into public.feature_idea_votes_v22 (idea_id, user_id) values (p_idea_id, auth.uid());
  end if;

  return query
  select exists (select 1 from public.feature_idea_votes_v22 v where v.idea_id = p_idea_id and v.user_id = auth.uid()),
         (select count(*) from public.feature_idea_votes_v22 v where v.idea_id = p_idea_id)::integer;
end;
$$;

-- Менеджер пропонує свою ідею — вона одразу зʼявляється в переліку (рішення
-- власниці 28.10). Прибрати недоречну: status = 'hidden'.
create or replace function public.suggest_feature_idea_v22_rpc(p_title text, p_description text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  -- Лише простий текст в один рядок: без керівних символів і переносів,
  -- повторні пробіли — один. На сторінці текст ще й екранується (esc()).
  v_title text := trim(regexp_replace(regexp_replace(coalesce(p_title, ''), '[[:cntrl:]]', ' ', 'g'), '\s+', ' ', 'g'));
  v_description text := trim(regexp_replace(regexp_replace(coalesce(p_description, ''), '[[:cntrl:]]', ' ', 'g'), '\s+', ' ', 'g'));
begin
  if not public.is_any_manager_v22() then raise exception 'Розділ доступний менеджерам спільнот.'; end if;
  if v_title = '' then raise exception 'Вкажіть назву ідеї.'; end if;
  if v_description = '' then raise exception 'Опишіть ідею.'; end if;
  if length(v_title) > 60 then raise exception 'Назва задовга (до 60 символів).'; end if;
  if length(v_description) > 160 then raise exception 'Опис задовгий (до 160 символів).'; end if;
  if (select count(*) from public.feature_ideas_v22 where created_by = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Забагато ідей за добу. Спробуйте завтра.';
  end if;
  insert into public.feature_ideas_v22 (title, description, status, created_by)
  values (v_title, v_description, 'planned', auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.suggest_feature_idea_v22_rpc(text, text) from public;
grant execute on function public.suggest_feature_idea_v22_rpc(text, text) to authenticated;

revoke all on function public.is_any_manager_v22() from public;
revoke all on function public.get_feature_ideas_v22_rpc() from public;
revoke all on function public.toggle_feature_idea_vote_v22_rpc(uuid) from public;
grant execute on function public.get_feature_ideas_v22_rpc() to authenticated;
grant execute on function public.toggle_feature_idea_vote_v22_rpc(uuid) to authenticated;

-- Як вести перелік (SQL Editor):
--   додати:      insert into feature_ideas_v22 (title, description, position) values ('Назва', 'Що це дасть', 100);
--   ідеї від менеджерів: select title, description, created_at from feature_ideas_v22 where created_by is not null order by created_at desc;
--   прибрати недоречну: update feature_ideas_v22 set status = 'hidden' where title = 'Назва';
--   статус:      update feature_ideas_v22 set status = 'in_progress' where title = 'Назва';   -- 'planned' (Плануємо) | 'in_progress' (Робимо) | 'done' (зроблено — зникає зі сторінки) | 'hidden' (приховано)
--   порядок:     update feature_ideas_v22 set position = 5 where title = 'Назва';
--   хто голосує: select i.title, count(v.*) from feature_ideas_v22 i left join feature_idea_votes_v22 v on v.idea_id = i.id group by i.id order by 2 desc;
