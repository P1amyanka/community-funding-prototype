create or replace function public.healthcheck_v04_rpc()
returns table (status text, checked_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select 'ok'::text, now();
$$;

revoke all on function public.healthcheck_v04_rpc() from public;
grant execute on function public.healthcheck_v04_rpc() to anon, authenticated;
