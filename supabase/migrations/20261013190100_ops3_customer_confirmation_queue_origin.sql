-- Preserve canonical customer confirmation validation, and identify the source
-- before the order-status trigger queues the order for separation.
CREATE OR REPLACE FUNCTION public.ops3_confirm_customer_order_v1(p_token_hash text, p_expected_total numeric, p_expected_updated_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a private.order_customer_actions_v1%rowtype; o public.orders%rowtype;
  d jsonb; stock jsonb; problems text[]:=array[]::text[];
begin
  if p_token_hash !~ '^[a-f0-9]{64}$' or p_expected_total is null or p_expected_updated_at is null
    then return jsonb_build_object('ok',false,'error','invalid_request'); end if;
  select * into a from private.order_customer_actions_v1 where token_hash=p_token_hash for update;
  if not found then return jsonb_build_object('ok',false,'error','invalid_token'); end if;
  select * into o from public.orders where id=a.order_id for update;
  if not found then return jsonb_build_object('ok',false,'error','order_not_found'); end if;
  if a.confirmed_at is not null and o.status='confirmed' then
    return jsonb_build_object('ok',true,'already_confirmed',true,'order_id',o.id,'status','confirmed','total',o.total);
  end if;
  if now()>a.expires_at then return jsonb_build_object('ok',false,'error','session_expired'); end if;
  if o.source not in ('vitrine','storefront_v2') or o.status<>'storefront_received' or o.confirmed_at is not null
     or o.cancelled_at is not null then return jsonb_build_object('ok',false,'error','order_status_closed','status',o.status); end if;
  if o.bling_order_id is not null or o.bling_synced_at is not null or coalesce(o.sync_status,'local')<>'local'
     then return jsonb_build_object('ok',false,'error','bling_sync_started'); end if;
  if exists(select 1 from public.order_separation_assignments_v1 x where x.order_id=o.id)
     or exists(select 1 from public.order_separation_items_v1 x where x.order_id=o.id)
     then return jsonb_build_object('ok',false,'error','separation_started'); end if;
  if o.updated_at<>p_expected_updated_at or round(o.total,2)<>round(p_expected_total,2) then
    return jsonb_build_object('ok',false,'error','order_changed','current_total',o.total,'updated_at',o.updated_at);
  end if;
  d:=coalesce(o.delivery_address,'{}'::jsonb);
  if nullif(btrim(coalesce(d->>'customer_name',d->>'recipient_name','')),'') is null then problems:=array_append(problems,'customer_required'); end if;
  if nullif(btrim(coalesce(d->>'street','')),'') is null then problems:=array_append(problems,'delivery_street_required'); end if;
  if nullif(btrim(coalesce(d->>'number','')),'') is null then problems:=array_append(problems,'delivery_number_required'); end if;
  if nullif(btrim(coalesce(d->>'city','')),'') is null then problems:=array_append(problems,'delivery_city_required'); end if;
  if nullif(btrim(coalesce(d->>'state','')),'') is null then problems:=array_append(problems,'delivery_state_required'); end if;
  if nullif(btrim(coalesce(o.payment_method,'')),'') is null then problems:=array_append(problems,'payment_method_required'); end if;
  if array_length(problems,1)>0 then return jsonb_build_object('ok',false,'error','order_operational_data_incomplete','blockers',to_jsonb(problems)); end if;
  stock:=public.reserve_vitrine_order_stock_v1(o.id);
  if coalesce((stock->>'ok')::boolean,false) is not true then
    raise exception 'customer_confirm_stock_unavailable:%',coalesce(stock->>'error','unknown') using errcode='P0001';
  end if;
  update public.orders
     set status='confirmed',
         confirmed_at=now(),
         checkout_snapshot=jsonb_set(coalesce(o.checkout_snapshot,'{}'::jsonb),
                                     '{customer_confirmed}','true'::jsonb,true),
         updated_at=now()
   where id=o.id;
  update private.order_customer_actions_v1 set confirmed_at=now(),confirmed_total=o.total where order_id=o.id;
  perform public.ops2_refresh_order_public_snapshot_v1(o.id);
  return jsonb_build_object('ok',true,'order_id',o.id,'status','confirmed','total',o.total,'confirmed_at',now());
end;$function$

