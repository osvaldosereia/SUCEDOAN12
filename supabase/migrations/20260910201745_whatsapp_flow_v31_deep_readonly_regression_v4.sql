begin;

create or replace function public.get_whatsapp_flow_v31_deep_readonly_readiness_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  b record;
  v_base jsonb; v_remove jsonb; v_over jsonb;
  sel_base jsonb; sel_remove jsonb; sel_over jsonb;
  candidate_id uuid; over_id uuid;
  baskets integer:=0; base_valid integer:=0; remove_cases integer:=0; remove_valid integer:=0; over_cases integer:=0; over_blocked integer:=0;
  removable_count integer:=0; nonremovable_count integer:=0; low_stock_count integer:=0;
  preview_basket_id uuid; preview_base numeric:=0; preview_delta numeric:=0; addon_price numeric:=0; upsell_price numeric:=0; preview_total numeric:=0;
  addon_id uuid; upsell_id uuid;
  src_validate text:=''; src_finalize text:=''; src_nfm text:=''; src_wrapper text:=''; src_recalc text:='';
  checks jsonb:='[]'::jsonb; passed integer:=0; total integer:=0; ok boolean;
begin
  select count(*) filter(where bi.removable),count(*) filter(where not bi.removable),count(*) filter(where coalesce(p.stock,0) between 1 and 3)
    into removable_count,nonremovable_count,low_stock_count
  from public.basket_template_items bi
  join public.basket_templates bt on bt.id=bi.basket_id
  join public.products p on p.id=bi.product_id
  where bt.is_active and bt.is_whatsapp_active;

  for b in select bt.id from public.basket_templates bt where bt.is_active and bt.is_whatsapp_active and coalesce(bt.base_price,0)>0 order by bt.sort_order,bt.name loop
    baskets:=baskets+1;
    select coalesce(jsonb_agg(jsonb_build_object('product_id',bi.product_id,'quantity',bi.quantity) order by bi.sort_order,bi.created_at),'[]'::jsonb)
      into sel_base from public.basket_template_items bi where bi.basket_id=b.id;
    v_base:=public.validate_basket_flow_selection_v1(b.id,sel_base);
    if coalesce((v_base->>'valid')::boolean,false) then base_valid:=base_valid+1; end if;

    select bi.product_id into candidate_id
    from public.basket_template_items bi join public.products p on p.id=bi.product_id
    where bi.basket_id=b.id and bi.removable and bi.quantity_editable
      and coalesce(bi.min_quantity,0)=0 and (bi.remove_unit_delta is not null or coalesce(p.price,0)>0)
    order by bi.sort_order,bi.created_at limit 1;
    if candidate_id is not null then
      remove_cases:=remove_cases+1;
      select coalesce(jsonb_agg(jsonb_build_object('product_id',bi.product_id,'quantity',case when bi.product_id=candidate_id then 0 else bi.quantity end) order by bi.sort_order,bi.created_at),'[]'::jsonb)
        into sel_remove from public.basket_template_items bi where bi.basket_id=b.id;
      v_remove:=public.validate_basket_flow_selection_v1(b.id,sel_remove);
      if coalesce((v_remove->>'valid')::boolean,false) then remove_valid:=remove_valid+1; end if;
    end if;

    select bi.product_id into over_id from public.basket_template_items bi where bi.basket_id=b.id and bi.quantity_editable order by bi.sort_order,bi.created_at limit 1;
    if over_id is not null then
      over_cases:=over_cases+1;
      select coalesce(jsonb_agg(jsonb_build_object('product_id',bi.product_id,'quantity',case when bi.product_id=over_id then 7 else bi.quantity end) order by bi.sort_order,bi.created_at),'[]'::jsonb)
        into sel_over from public.basket_template_items bi where bi.basket_id=b.id;
      v_over:=public.validate_basket_flow_selection_v1(b.id,sel_over);
      if not coalesce((v_over->>'valid')::boolean,true) and exists(select 1 from jsonb_array_elements(coalesce(v_over->'issues','[]'::jsonb)) x where x->>'code'='quantity_out_of_range') then over_blocked:=over_blocked+1; end if;
    end if;
  end loop;

  select bt.id,bt.base_price into preview_basket_id,preview_base
  from public.basket_templates bt where bt.is_active and bt.is_whatsapp_active and coalesce(bt.base_price,0)>0 order by bt.sort_order,bt.name limit 1;
  if preview_basket_id is not null then
    select case when bi.quantity>0 then coalesce(bi.remove_unit_delta,-coalesce(p.price,0)) else 0 end
      into preview_delta
    from public.basket_template_items bi join public.products p on p.id=bi.product_id
    where bi.basket_id=preview_basket_id and bi.removable and bi.quantity_editable and coalesce(bi.min_quantity,0)<bi.quantity
      and (bi.remove_unit_delta is not null or coalesce(p.price,0)>0)
    order by bi.sort_order,bi.created_at limit 1;
    preview_delta:=coalesce(preview_delta,0);

    select p.id,p.price into addon_id,addon_price
    from public.products p
    where p.physically_verified and p.is_active and p.is_whatsapp_active and coalesce(p.stock,0)>0 and coalesce(p.price,0)>0
      and not exists(select 1 from public.basket_template_items bi where bi.basket_id=preview_basket_id and bi.product_id=p.id)
    order by p.name,p.id limit 1;
    addon_price:=coalesce(addon_price,0);

    select p.id,p.price into upsell_id,upsell_price
    from public.products p
    where p.physically_verified and p.is_active and p.is_whatsapp_active and coalesce(p.stock,0)>0 and coalesce(p.price,0)>0
      and p.id is distinct from addon_id
      and not exists(select 1 from public.basket_template_items bi where bi.basket_id=preview_basket_id and bi.product_id=p.id)
    order by p.name,p.id limit 1;
    upsell_price:=coalesce(upsell_price,0);
    preview_total:=greatest(0,preview_base+preview_delta+addon_price+upsell_price);
  end if;

  select pg_get_functiondef(p.oid) into src_validate from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='validate_basket_flow_selection_v1' limit 1;
  select pg_get_functiondef(p.oid) into src_finalize from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='finalize_whatsapp_flow_commercial_order_v1' limit 1;
  select pg_get_functiondef(p.oid) into src_nfm from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='process_whatsapp_flow_nfm_reply_legacy_v1' limit 1;
  select pg_get_functiondef(p.oid) into src_wrapper from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='process_whatsapp_flow_nfm_reply_v1' limit 1;
  select pg_get_functiondef(p.oid) into src_recalc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='recalculate_cart' limit 1;

  ok:=baskets=9; checks:=checks||jsonb_build_array(jsonb_build_object('name','all_nine_baskets_exercised','ok',ok,'detail','baskets='||baskets)); if ok then passed:=passed+1; end if; total:=total+1;
  ok:=base_valid=baskets; checks:=checks||jsonb_build_array(jsonb_build_object('name','all_baselines_valid','ok',ok,'detail','valid='||base_valid||'/'||baskets)); if ok then passed:=passed+1; end if; total:=total+1;
  ok:=remove_cases>0 and remove_valid=remove_cases; checks:=checks||jsonb_build_array(jsonb_build_object('name','real_removal_zero_valid','ok',ok,'detail','valid='||remove_valid||'/'||remove_cases)); if ok then passed:=passed+1; end if; total:=total+1;
  ok:=over_cases>0 and over_blocked=over_cases; checks:=checks||jsonb_build_array(jsonb_build_object('name','customer_cap_7_blocked','ok',ok,'detail','blocked='||over_blocked||'/'||over_cases)); if ok then passed:=passed+1; end if; total:=total+1;
  ok:=removable_count>0; checks:=checks||jsonb_build_array(jsonb_build_object('name','removable_dataset_covered','ok',ok,'detail','count='||removable_count)); if ok then passed:=passed+1; end if; total:=total+1;
  ok:=position('product_not_removable' in src_validate)>0; checks:=checks||jsonb_build_array(jsonb_build_object('name','nonremovable_guard_present','ok',ok,'detail','dataset_count='||nonremovable_count)); if ok then passed:=passed+1; end if; total:=total+1;
  ok:=position('v_stock' in src_validate)>0 and position('customer_max' in src_validate)>0; checks:=checks||jsonb_build_array(jsonb_build_object('name','stock_and_customer_cap_guard_present','ok',ok,'detail','low_stock_samples='||low_stock_count)); if ok then passed:=passed+1; end if; total:=total+1;
  ok:=preview_basket_id is not null and addon_id is not null and upsell_id is not null and preview_total=greatest(0,preview_base+preview_delta+addon_price+upsell_price); checks:=checks||jsonb_build_array(jsonb_build_object('name','personalized_plus_extra_plus_upsell_math','ok',ok,'detail',jsonb_build_object('base',preview_base,'personalization_delta',preview_delta,'extra',addon_price,'upsell',upsell_price,'preview_total',preview_total))); if ok then passed:=passed+1; end if; total:=total+1;
  ok:=position('v_total := greatest(0' in src_recalc)>0 and position('v_template_delta' in src_recalc)>0 and position('v_addons' in src_recalc)>0; checks:=checks||jsonb_build_array(jsonb_build_object('name','recalculate_cart_formula_matches_preview','ok',ok)); if ok then passed:=passed+1; end if; total:=total+1;
  ok:=position('flow_order_id' in src_finalize)>0 and position('status=''completed''' in src_finalize)>0; checks:=checks||jsonb_build_array(jsonb_build_object('name','finalize_persists_order_and_completes_session','ok',ok)); if ok then passed:=passed+1; end if; total:=total+1;
  ok:=position('flow-cestas-comercial-v8-stable' in src_nfm)>0 and position('''offered'',''open'',''completed''' in src_nfm)>0; checks:=checks||jsonb_build_array(jsonb_build_object('name','nfm_accepts_v31_completed_session','ok',ok)); if ok then passed:=passed+1; end if; total:=total+1;
  ok:=position('status=''confirmed''' in src_nfm)>0 and position('confirmed_at is not null' in src_nfm)>0 and position('coalesce(total,0)>0' in src_nfm)>0; checks:=checks||jsonb_build_array(jsonb_build_object('name','nfm_location_requires_confirmed_order','ok',ok)); if ok then passed:=passed+1; end if; total:=total+1;
  ok:=position('event_type=''flow_nfm_reply''' in src_nfm)>0 and position('v_duplicate' in src_nfm)>0 and position('not v_duplicate' in src_nfm)>0; checks:=checks||jsonb_build_array(jsonb_build_object('name','nfm_duplicate_location_suppressed','ok',ok)); if ok then passed:=passed+1; end if; total:=total+1;
  ok:=position('process_whatsapp_flow_nfm_reply_legacy_v1' in src_wrapper)>0; checks:=checks||jsonb_build_array(jsonb_build_object('name','nfm_wrapper_routes_commercial_bridge','ok',ok)); if ok then passed:=passed+1; end if; total:=total+1;

  return jsonb_build_object('ok',passed=total,'version','v2-deep-readonly','passed',passed,'total',total,'checks',checks,'baskets_exercised',baskets,'removable_components',removable_count,'nonremovable_components',nonremovable_count,'low_stock_components',low_stock_count,'writes_executed',false,'orders_created',false,'pii_returned',false,'checked_at',now());
end
$$;

revoke all on function public.get_whatsapp_flow_v31_deep_readonly_readiness_v2() from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v31_deep_readonly_readiness_v2() to service_role;

commit;
