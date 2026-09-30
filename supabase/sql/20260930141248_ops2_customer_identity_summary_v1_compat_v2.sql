create or replace function public.ops2_customer_identity_summary_v1()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.ops2_customer_identity_summary_v2()
$$;

revoke all on function public.ops2_customer_identity_summary_v1() from public,anon,authenticated;
grant execute on function public.ops2_customer_identity_summary_v1() to service_role;