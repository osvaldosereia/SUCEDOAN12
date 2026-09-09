begin;

do $$
declare r jsonb; v_sellable integer;
begin
  r:=public.get_whatsapp_basket_component_readiness_v3(null);
  if not coalesce((r->>'ready')::boolean,false) or coalesce((r->>'ready_baskets')::integer,0)<>9 then raise exception 'baskets_not_ready:%',r; end if;
  select count(*) into v_sellable from public.products where is_whatsapp_active and is_active and physically_verified and coalesce(price,0)>0 and coalesce(stock,0)>0;
  if v_sellable<1 then raise exception 'whatsapp_catalog_empty'; end if;
  if not exists(select 1 from public.experience_definitions where slug='flow-cestas-comercial-v1' and provider_id='1538860004926321' and metadata->>'meta_status'='published' and coalesce((metadata->>'meta_validation_errors')::integer,0)=0) then raise exception 'meta_flow_not_ready'; end if;
end $$;

update public.experience_definitions
set status='active',
    config=coalesce(config,'{}'::jsonb)||jsonb_build_object(
      'live_percent',100,
      'production_enabled',true,
      'sellable_product_policy','active_verified_whatsapp_price_stock',
      'bling_sync_enabled',false
    ),
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'production_activated_at',now(),
      'implementation_stage','production_live_v13'
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
