begin;

create or replace function public.handle_whatsapp_flow_commercial_exchange_v6(
  p_session_id uuid,
  p_conversation_id uuid,
  p_action text,
  p_screen text default null,
  p_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_result jsonb;
  v_response jsonb;
  v_data jsonb;
  v_screen text;
  v_enriched jsonb;
begin
  v_result:=public.handle_whatsapp_flow_commercial_exchange_v5(
    p_session_id,p_conversation_id,p_action,p_screen,p_data
  );
  if not coalesce((v_result->>'ok')::boolean,false) then return v_result; end if;

  v_response:=coalesce(v_result->'response','{}'::jsonb);
  v_screen:=coalesce(v_response->>'screen','');
  v_data:=coalesce(v_response->'data','{}'::jsonb);

  if v_screen ~ '^PERSONALIZAR_[123]$' and jsonb_typeof(v_data->'items')='array' then
    select coalesce(jsonb_agg(
      e || jsonb_build_object(
        'image_url',coalesce(p.image_url,''),
        'alt-text',left(coalesce(p.name,e->>'title','Produto da cesta'),80)
      )
    ),'[]'::jsonb)
    into v_enriched
    from jsonb_array_elements(v_data->'items') e
    left join public.products p
      on p.id = case
        when coalesce(e->>'id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (e->>'id')::uuid else null end;
    v_response:=jsonb_set(v_response,'{data,items}',v_enriched,true);
  end if;

  if v_screen ~ '^PRODUTOS_[123]$' and jsonb_typeof(v_data->'products')='array' then
    select coalesce(jsonb_agg(
      e || jsonb_build_object(
        'image_url',coalesce(p.image_url,''),
        'alt-text',left(coalesce(p.name,e->>'title','Produto'),80)
      )
    ),'[]'::jsonb)
    into v_enriched
    from jsonb_array_elements(v_data->'products') e
    left join public.products p
      on p.id = case
        when coalesce(e->>'id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (e->>'id')::uuid else null end;
    v_response:=jsonb_set(v_response,'{data,products}',v_enriched,true);
  end if;

  if v_screen='UPSELL' and jsonb_typeof(v_data->'products')='array' then
    select coalesce(jsonb_agg(
      e || jsonb_build_object(
        'image_url',coalesce(p.image_url,''),
        'alt-text',left(coalesce(p.name,e->>'title','Sugestão'),80)
      )
    ),'[]'::jsonb)
    into v_enriched
    from jsonb_array_elements(v_data->'products') e
    left join public.products p
      on p.id = case
        when coalesce(e->>'id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (e->>'id')::uuid else null end;
    v_response:=jsonb_set(v_response,'{data,products}',v_enriched,true);
  end if;

  return jsonb_set(v_result,'{response}',v_response,false);
end;
$$;

revoke all on function public.handle_whatsapp_flow_commercial_exchange_v6(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.handle_whatsapp_flow_commercial_exchange_v6(uuid,uuid,text,text,jsonb) to service_role;

update public.experience_definitions
set config=coalesce(config,'{}'::jsonb)||jsonb_build_object(
      'handler_version','v6',
      'flow_json_version','v6',
      'visual_radio_basket_cards',true,
      'visual_product_results',true,
      'visual_basket_components',true,
      'visual_upsell',true,
      'category_multiselect_max',3,
      'catalog_query_only',true,
      'component_prices_visible',false
    ),
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'implementation_stage','visual_v6_meta_validation'
    ),
    updated_at=now()
where slug='flow-cestas-comercial-v1';

update public.automation_config
set whatsapp_live_canary_percent=1,
    experience_orchestrator_enabled=false,
    whatsapp_flow_data_exchange_enabled=false,
    whatsapp_flow_send_enabled=false,
    whatsapp_flow_commercial_write_enabled=false,
    bling_order_sync_enabled=false,
    updated_at=now()
where id=1;

commit;
