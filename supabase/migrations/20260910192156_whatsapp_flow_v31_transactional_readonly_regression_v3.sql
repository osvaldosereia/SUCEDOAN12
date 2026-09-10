begin;

create or replace function public.get_whatsapp_flow_v31_transactional_readonly_readiness_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  b record; selection_base jsonb; selection_low jsonb; selection_high jsonb;
  v_base jsonb; v_low jsonb; v_high jsonb;
  sample_baskets integer:=0; valid_base integer:=0; valid_low integer:=0; valid_high integer:=0;
  changed_low integer:=0; changed_high integer:=0;
  addon_candidates integer:=0; addon_stock_violations integer:=0;
  rec_count integer:=0; rec_invalid integer:=0; rec_in_cart integer:=0;
  src_apply text:=''; src_finalize text:=''; src_confirm text:=''; src_recalc text:='';
  checks jsonb:='[]'::jsonb; passed integer:=0; total integer:=0; ok boolean;
  owner_conv uuid:='ff5c1e73-f3ed-4b88-8eba-b6e3a9883941'::uuid;
  candidate record;
begin
  for b in
    select bt.id from public.basket_templates bt
    where bt.is_active=true and bt.is_whatsapp_active=true and coalesce(bt.base_price,0)>0
    order by bt.sort_order,bt.name limit 3
  loop
    sample_baskets:=sample_baskets+1;
    select coalesce(jsonb_agg(jsonb_build_object('product_id',bi.product_id,'quantity',bi.quantity) order by bi.sort_order,bi.created_at),'[]'::jsonb)
      into selection_base from public.basket_template_items bi where bi.basket_id=b.id;
    with limits as (
      select bi.product_id,bi.quantity,bi.sort_order,bi.created_at,
        case when bi.quantity_editable and bi.quantity>coalesce(bi.min_quantity,case when bi.removable then 0 else bi.quantity end)
             then greatest(coalesce(bi.min_quantity,case when bi.removable then 0 else bi.quantity end),bi.quantity-1) else bi.quantity end q_low,
        case when bi.quantity_editable then least(6,greatest(bi.quantity,least(coalesce(bi.max_quantity,6),6,greatest(0,floor(coalesce(p.stock,0))::int)))) else bi.quantity end q_high,
        row_number() over(order by case when bi.quantity_editable then 0 else 1 end,bi.sort_order,bi.created_at) rn
      from public.basket_template_items bi join public.products p on p.id=bi.product_id where bi.basket_id=b.id
    )
    select coalesce(jsonb_agg(jsonb_build_object('product_id',product_id,'quantity',case when rn=1 then q_low else quantity end) order by sort_order,created_at),'[]'::jsonb),
           coalesce(jsonb_agg(jsonb_build_object('product_id',product_id,'quantity',case when rn=1 then q_high else quantity end) order by sort_order,created_at),'[]'::jsonb)
      into selection_low,selection_high from limits;
    v_base:=public.validate_basket_flow_selection_v1(b.id,selection_base);
    v_low:=public.validate_basket_flow_selection_v1(b.id,selection_low);
    v_high:=public.validate_basket_flow_selection_v1(b.id,selection_high);
    if coalesce((v_base->>'valid')::boolean,false) then valid_base:=valid_base+1; end if;
    if coalesce((v_low->>'valid')::boolean,false) then valid_low:=valid_low+1; end if;
    if coalesce((v_high->>'valid')::boolean,false) then valid_high:=valid_high+1; end if;
    if exists(select 1 from jsonb_array_elements(coalesce(v_low->'normalized','[]'::jsonb)) e where coalesce((e->>'changed')::boolean,false)) then changed_low:=changed_low+1; end if;
    if exists(select 1 from jsonb_array_elements(coalesce(v_high->'normalized','[]'::jsonb)) e where coalesce((e->>'changed')::boolean,false)) then changed_high:=changed_high+1; end if;
  end loop;

  select count(*)::int,count(*) filter(where least(6,greatest(0,floor(coalesce(p.stock,0))::int))<1)::int
    into addon_candidates,addon_stock_violations
  from public.products p
  where p.physically_verified=true and p.is_active=true and p.is_whatsapp_active=true and coalesce(p.price,0)>0 and coalesce(p.stock,0)>0;

  for candidate in select * from public.get_cart_aware_recommendations(owner_conv,6,'upsell') loop
    rec_count:=rec_count+1;
    if coalesce(candidate.stock,0)<=0 or coalesce(candidate.price,0)<=0 then rec_invalid:=rec_invalid+1; end if;
    if exists(select 1 from public.carts ca join public.cart_items ci on ci.cart_id=ca.id where ca.conversation_id=owner_conv and ca.status='draft' and ci.product_id=candidate.product_id and ci.quantity>0) then rec_in_cart:=rec_in_cart+1; end if;
  end loop;

  select pg_get_functiondef(p.oid) into src_apply from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='apply_whatsapp_flow_commercial_write_v1' limit 1;
  select pg_get_functiondef(p.oid) into src_finalize from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='finalize_whatsapp_flow_commercial_order_v1' limit 1;
  select pg_get_functiondef(p.oid) into src_confirm from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='confirm_cart_order_v2' limit 1;
  select pg_get_functiondef(p.oid) into src_recalc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='recalculate_cart' limit 1;

  ok:=sample_baskets=3; checks:=checks||jsonb_build_array(jsonb_build_object('name','three_real_basket_samples','ok',ok,'detail','samples='||sample_baskets)); if ok then passed:=passed+1; end if; total:=total+1;
  ok:=valid_base=sample_baskets; checks:=checks||jsonb_build_array(jsonb_build_object('name','baseline_selection_valid','ok',ok,'detail','valid='||valid_base||'/'||sample_baskets)); if ok then passed:=passed+1; end if; total:=total+1;
  ok:=valid_low=sample_baskets; checks:=checks||jsonb_build_array(jsonb_build_object('name','decrease_selection_valid','ok',ok,'detail','valid='||valid_low||'/'||sample_baskets)); if ok then passed:=passed+1; end if; total:=total+1;
  ok:=valid_high=sample_baskets; checks:=checks||jsonb_build_array(jsonb_build_object('name','increase_selection_valid','ok',ok,'detail','valid='||valid_high||'/'||sample_baskets)); if ok then passed:=passed+1; end if; total:=total+1;
  ok:=changed_low+changed_high>0; checks:=checks||jsonb_build_array(jsonb_build_object('name','personalization_change_exercised','ok',ok,'detail','low_changed='||changed_low||', high_changed='||changed_high)); if ok then passed:=passed+1; end if; total:=total+1;
  ok:=coalesce((v_base#>>'{policy,component_prices_visible}')::boolean,true)=false; checks:=checks||jsonb_build_array(jsonb_build_object('name','component_prices_hidden_contract','ok',ok)); if ok then passed:=passed+1; end if; total:=total+1;
  ok:=addon_candidates>0 and addon_stock_violations=0; checks:=checks||jsonb_build_array(jsonb_build_object('name','addon_stock_floor_ready','ok',ok,'detail','candidates='||addon_candidates)); if ok then passed:=passed+1; end if; total:=total+1;
  ok:=position('v_quantity<0orv_quantity>6' in regexp_replace(src_apply,E'\\s','','g'))>0; checks:=checks||jsonb_build_array(jsonb_build_object('name','addon_customer_cap_6','ok',ok)); if ok then passed:=passed+1; end if; total:=total+1;
  ok:=rec_count<=6 and rec_invalid=0; checks:=checks||jsonb_build_array(jsonb_build_object('name','upsell_sellable_capped_6','ok',ok,'detail','count='||rec_count)); if ok then passed:=passed+1; end if; total:=total+1;
  ok:=rec_in_cart=0; checks:=checks||jsonb_build_array(jsonb_build_object('name','upsell_excludes_cart_items','ok',ok,'detail','duplicates='||rec_in_cart)); if ok then passed:=passed+1; end if; total:=total+1;
  ok:=position('whatsapp_flow_commercial_write_disabled' in src_apply)>0 and position('experience_orchestrator_disabled' in src_apply)>0 and position('whatsapp_flow_data_exchange_disabled' in src_apply)>0 and position('whatsapp_flow_send_disabled' in src_apply)>0; checks:=checks||jsonb_build_array(jsonb_build_object('name','write_path_four_gate_guard','ok',ok)); if ok then passed:=passed+1; end if; total:=total+1;
  ok:=position('flow_write_idempotency_conflict' in src_apply)>0 and position('idempotent_replay' in src_apply)>0; checks:=checks||jsonb_build_array(jsonb_build_object('name','write_idempotency_guard','ok',ok)); if ok then passed:=passed+1; end if; total:=total+1;
  ok:=position('v_total := greatest(0' in src_recalc)>0 and position('other_expenses' in src_recalc)>0 and position('discount' in src_recalc)>0; checks:=checks||jsonb_build_array(jsonb_build_object('name','commercial_total_recalculation_contract','ok',ok)); if ok then passed:=passed+1; end if; total:=total+1;
  ok:=position('whatsapp_flow_commercial_write_disabled' in src_finalize)>0 and position('customer_registration_incomplete' in src_finalize)>0 and position('confirm_cart_order_v2' in src_finalize)>0; checks:=checks||jsonb_build_array(jsonb_build_object('name','finalization_fail_closed','ok',ok)); if ok then passed:=passed+1; end if; total:=total+1;
  ok:=position('idempotency_key_conflict' in src_confirm)>0 and position('idempotent_replay' in src_confirm)>0; checks:=checks||jsonb_build_array(jsonb_build_object('name','order_confirmation_idempotent','ok',ok)); if ok then passed:=passed+1; end if; total:=total+1;
  ok:=position('v_method not in (''pix'',''dinheiro'',''cartao_entrega'',''cartao_alimentacao'')' in src_finalize)>0; checks:=checks||jsonb_build_array(jsonb_build_object('name','payment_methods_deterministic','ok',ok)); if ok then passed:=passed+1; end if; total:=total+1;

  return jsonb_build_object('ok',passed=total,'version','v1-transactional-readonly','passed',passed,'total',total,'checks',checks,'sample_baskets',sample_baskets,'upsell_count',rec_count,'addon_candidate_count',addon_candidates,'writes_executed',false,'orders_created',false,'pii_returned',false,'checked_at',now());
end
$$;

revoke all on function public.get_whatsapp_flow_v31_transactional_readonly_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v31_transactional_readonly_readiness_v1() to service_role;

commit;
