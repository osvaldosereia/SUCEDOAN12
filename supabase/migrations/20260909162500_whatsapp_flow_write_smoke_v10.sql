begin;

do $$
declare
  v_customer uuid:=gen_random_uuid();
  v_conv uuid:=gen_random_uuid();
  v_session uuid:=gen_random_uuid();
  v_def uuid;
  v_wa uuid;
  v_basket uuid;
  v_product uuid;
  v_addon uuid;
  v_qty numeric;
  v_selection jsonb;
  v_patched jsonb;
  v_result jsonb;
  v_order jsonb;
  v_gates_off boolean;
  v_total numeric;
begin
  begin
    update public.automation_config
       set experience_orchestrator_enabled=true,
           whatsapp_flow_data_exchange_enabled=true,
           whatsapp_flow_send_enabled=true,
           whatsapp_flow_commercial_write_enabled=true,
           bling_order_sync_enabled=false
     where id=1;

    select id into v_def from public.experience_definitions where slug='flow-cestas-comercial-v1';
    select id into v_wa from public.whatsapp_accounts limit 1;
    select id into v_basket from public.basket_templates where is_active and is_whatsapp_active order by sort_order,name limit 1;
    if v_def is null or v_wa is null or v_basket is null then raise exception 'smoke_fixture_missing'; end if;

    insert into public.customers(id,name) values(v_customer,'FLOW_WRITE_SMOKE');
    insert into public.customer_addresses(customer_id,street,number,neighborhood,city,state,is_default,is_active)
    values(v_customer,'TEST','1','TEST','Cuiabá','MT',true,true);
    insert into public.conversations(id,whatsapp_account_id,customer_id,source,channel,status,stage,mode)
    values(v_conv,v_wa,v_customer,'unknown','whatsapp','open','new','ai');
    insert into public.experience_sessions(id,conversation_id,customer_id,definition_id,status,idempotency_key,context,expires_at)
    values(v_session,v_conv,v_customer,v_def,'offered','write-smoke-'||replace(v_session::text,'-',''),jsonb_build_object('basket_id',v_basket),now()+interval '30 minutes');

    v_result:=public.apply_whatsapp_flow_commercial_write_v1(
      v_session,0,'smoke_start_'||replace(v_session::text,'-',''),'start_basket',jsonb_build_object('basket_id',v_basket)
    );
    v_total:=coalesce((v_result->>'commercial_total')::numeric,(v_result->>'total')::numeric,0);
    if v_total<=0 then raise exception 'smoke_start_failed:%',v_result; end if;

    v_selection:=public.get_whatsapp_flow_basket_editor_v1(v_basket)->'selection';
    select bi.product_id,bi.quantity into v_product,v_qty
      from public.basket_template_items bi
      join public.products p on p.id=bi.product_id
     where bi.basket_id=v_basket and coalesce(p.price,0)>0
     order by bi.sort_order,p.name limit 1;
    if v_product is null then raise exception 'smoke_priced_component_missing'; end if;

    v_patched:=public.patch_whatsapp_flow_basket_selection_v2(v_basket,v_selection,v_product,v_qty+1);
    if not coalesce((v_patched->>'valid')::boolean,false) then raise exception 'smoke_patch_failed:%',v_patched; end if;

    v_result:=public.apply_whatsapp_flow_commercial_write_v1(
      v_session,0,'smoke_selection_'||replace(v_session::text,'-',''),'apply_basket_selection',jsonb_build_object('selection',v_patched->'selection')
    );
    v_total:=coalesce((v_result->>'total')::numeric,(v_result->>'commercial_total')::numeric,0);
    if v_total<=0 then raise exception 'smoke_selection_failed:%',v_result; end if;

    select p.id into v_addon
      from public.products p
     where p.physically_verified and p.is_active and coalesce(p.price,0)>0 and coalesce(p.stock,0)>0
       and not exists(select 1 from public.basket_template_items bi where bi.basket_id=v_basket and bi.product_id=p.id)
     order by p.name limit 1;
    if v_addon is null then raise exception 'smoke_addon_missing'; end if;

    v_result:=public.apply_whatsapp_flow_commercial_write_v1(
      v_session,0,'smoke_addon_'||replace(v_session::text,'-',''),'set_addon',jsonb_build_object('product_id',v_addon,'quantity',1)
    );
    v_total:=coalesce((v_result->>'total')::numeric,(v_result->>'commercial_total')::numeric,0);
    if v_total<=0 then raise exception 'smoke_addon_failed:%',v_result; end if;

    v_order:=public.finalize_whatsapp_flow_commercial_order_v1(
      v_session,0,'smoke_order_'||replace(v_session::text,'-',''),'pix','transactional smoke'
    );
    if not coalesce((v_order->>'ok')::boolean,false) then raise exception 'smoke_finalize_failed:%',v_order; end if;
    if v_order->>'next_step'<>'send_location_in_chat' then raise exception 'smoke_next_step_failed:%',v_order; end if;
    if not exists(select 1 from public.orders where conversation_id=v_conv and status='confirmed') then raise exception 'smoke_order_missing'; end if;

    raise exception 'SMOKE_ROLLBACK_SENTINEL';
  exception when raise_exception then
    if sqlerrm<>'SMOKE_ROLLBACK_SENTINEL' then raise; end if;
  end;

  select not experience_orchestrator_enabled
     and not whatsapp_flow_data_exchange_enabled
     and not whatsapp_flow_send_enabled
     and not whatsapp_flow_commercial_write_enabled
     and not bling_order_sync_enabled
    into v_gates_off
    from public.automation_config where id=1;
  if not coalesce(v_gates_off,false) then raise exception 'smoke_gate_restore_failed'; end if;
end $$;

update public.experience_definitions
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'production_write_smoke_passed',true,
  'production_write_smoke_passed_at',now(),
  'implementation_stage','production_write_smoke_v10'
),updated_at=now()
where slug='flow-cestas-comercial-v1';

commit;
