-- Applied to canonical Supabase 20260930023147
-- Dona Antônia Operations 2.0
create or replace function public.ops2_customer_identity_summary_v1()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'generated_at',now(),
    'site_orders_31d',(
      select count(*) from public.orders
      where created_at>=now()-interval '31 days' and source in ('vitrine','storefront_v2')
    ),
    'site_orders_without_customer_31d',(
      select count(*) from public.orders
      where created_at>=now()-interval '31 days' and source in ('vitrine','storefront_v2') and customer_id is null
    ),
    'site_orders_without_customer_with_phone_31d',(
      select count(*) from public.orders
      where created_at>=now()-interval '31 days' and source in ('vitrine','storefront_v2')
        and customer_id is null and nullif(btrim(coalesce(phone_e164,'')),'') is not null
    ),
    'provisional_customers',(
      select count(*) from public.customer_identity_profiles_v1 where identity_status='provisional'
    ),
    'provisional_without_name',(
      select count(*)
      from public.customer_identity_profiles_v1 ip
      join public.customers c on c.id=ip.customer_id
      where ip.identity_status='provisional' and nullif(btrim(coalesce(c.name,'')),'') is null
    ),
    'verified_flow_customers',(
      select count(*) from public.customer_identity_profiles_v1 where identity_status='verified_flow'
    ),
    'flow_events_total',(select count(*) from public.papoai_customer_flow_events_v1),
    'flow_events_review',(
      select count(*) from public.papoai_customer_flow_events_v1 where status<>'processed'
    )
  )
$$;
revoke all on function public.ops2_customer_identity_summary_v1() from public,anon,authenticated;
grant execute on function public.ops2_customer_identity_summary_v1() to service_role;
