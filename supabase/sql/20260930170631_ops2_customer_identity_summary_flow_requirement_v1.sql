create or replace function public.ops2_customer_identity_summary_v2()
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
    'site_orders_linked_conversation_31d',(
      select count(*) from public.orders
      where created_at>=now()-interval '31 days' and source in ('vitrine','storefront_v2') and conversation_id is not null
    ),
    'registration_pending_orders',(
      select count(*) from public.ops2_customer_registration_journeys_v1 where workflow_open=true and registration_state='pending'
    ),
    'registration_complete_orders',(
      select count(*) from public.ops2_customer_registration_journeys_v1 where registration_state='complete'
    ),
    'flow_required_orders',(
      select count(*)
      from public.ops2_customer_registration_journeys_v1 j
      where j.workflow_open=true
        and j.registration_state='pending'
        and public.ops2_customer_registration_state_v1(j.customer_id)->>'flow_required'='true'
    ),
    'flow_required_with_conversation',(
      select count(*)
      from public.ops2_customer_registration_journeys_v1 j
      join public.orders o on o.id=j.order_id
      where j.workflow_open=true
        and j.registration_state='pending'
        and public.ops2_customer_registration_state_v1(j.customer_id)->>'flow_required'='true'
        and o.conversation_id is not null
    ),
    'flow_required_without_conversation',(
      select count(*)
      from public.ops2_customer_registration_journeys_v1 j
      join public.orders o on o.id=j.order_id
      where j.workflow_open=true
        and j.registration_state='pending'
        and public.ops2_customer_registration_state_v1(j.customer_id)->>'flow_required'='true'
        and o.conversation_id is null
    ),
    'document_only_pending_orders',(
      select count(*)
      from public.ops2_customer_registration_journeys_v1 j
      where j.workflow_open=true
        and j.registration_state='pending'
        and public.ops2_customer_registration_state_v1(j.customer_id)->>'document_only_pending'='true'
    ),
    'pending_with_conversation',(
      select count(*)
      from public.ops2_customer_registration_journeys_v1 j
      join public.orders o on o.id=j.order_id
      where j.workflow_open=true and j.registration_state='pending' and o.conversation_id is not null
    ),
    'pending_without_conversation',(
      select count(*)
      from public.ops2_customer_registration_journeys_v1 j
      join public.orders o on o.id=j.order_id
      where j.workflow_open=true and j.registration_state='pending' and o.conversation_id is null
    ),
    'pending_missing_name',(
      select count(*) from public.ops2_customer_registration_journeys_v1
      where workflow_open=true and registration_state='pending' and missing_fields @> array['name']::text[]
    ),
    'pending_missing_document',(
      select count(*) from public.ops2_customer_registration_journeys_v1
      where workflow_open=true and registration_state='pending' and missing_fields @> array['document']::text[]
    ),
    'pending_missing_address',(
      select count(*) from public.ops2_customer_registration_journeys_v1
      where workflow_open=true and registration_state='pending' and missing_fields @> array['address']::text[]
    ),
    'pending_missing_city',(
      select count(*) from public.ops2_customer_registration_journeys_v1
      where workflow_open=true and registration_state='pending' and missing_fields @> array['city']::text[]
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
    'flow_events_review',(select count(*) from public.papoai_customer_flow_events_v1 where status<>'processed')
  )
$$;

revoke all on function public.ops2_customer_identity_summary_v2() from public,anon,authenticated;
grant execute on function public.ops2_customer_identity_summary_v2() to service_role;
