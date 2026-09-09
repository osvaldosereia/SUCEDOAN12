begin;

do $$
declare r jsonb;
begin
  r:=public.get_whatsapp_basket_component_readiness_v3(null);
  if not coalesce((r->>'ready')::boolean,false) or coalesce((r->>'ready_baskets')::integer,0)<>9 then
    raise exception 'whatsapp_flow_baskets_not_ready:%',r;
  end if;
  if to_regprocedure('public.handle_whatsapp_flow_commercial_exchange_v7(uuid,uuid,text,text,jsonb)') is null then
    raise exception 'whatsapp_flow_handler_v7_missing';
  end if;
  if not exists(
    select 1 from public.experience_definitions
    where slug='flow-cestas-comercial-v1'
      and provider_id='1538860004926321'
      and coalesce((metadata->>'meta_validation_passed')::boolean,false)
      and coalesce((metadata->>'meta_validation_errors')::integer,0)=0
      and metadata->>'meta_status'='published'
  ) then raise exception 'whatsapp_flow_meta_not_ready'; end if;
end $$;

update public.experience_definitions
set status='active',
    config=coalesce(config,'{}'::jsonb)||jsonb_build_object(
      'live_percent',100,
      'production_enabled',true,
      'handler_version','v7',
      'flow_json_version','v6',
      'basket_readiness_version','v3',
      'product_runtime_source','supabase.products',
      'basket_composition_source','supabase.basket_template_items',
      'bling_sync_enabled',false
    ),
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'meta_status','published',
      'production_activated_at',now(),
      'implementation_stage','production_live_100_v11'
    ),
    updated_at=now()
where slug='flow-cestas-comercial-v1';

update public.automation_config
set whatsapp_live_canary_percent=100,
    experience_orchestrator_enabled=true,
    whatsapp_flow_data_exchange_enabled=true,
    whatsapp_flow_send_enabled=true,
    whatsapp_flow_commercial_write_enabled=true,
    bling_order_sync_enabled=false,
    updated_at=now()
where id=1;

commit;
