begin;

create or replace function public.apply_basket_cart_selection_v2(
  p_cart_id uuid,
  p_basket_id uuid,
  p_selection jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_cart public.carts%rowtype;
  v_validated jsonb;
  v_expected integer;
  v_updated integer;
  v_recalc jsonb;
begin
  select * into v_cart
  from public.carts
  where id=p_cart_id
  for update;
  if not found then raise exception 'cart_not_found'; end if;
  if v_cart.status<>'draft' then raise exception 'cart_not_editable'; end if;
  if v_cart.basket_id is distinct from p_basket_id then raise exception 'basket_cart_mismatch'; end if;

  v_validated:=public.validate_basket_flow_selection_v1(p_basket_id,coalesce(p_selection,'[]'::jsonb));
  if not coalesce((v_validated->>'valid')::boolean,false) then raise exception 'basket_selection_invalid'; end if;
  v_expected:=jsonb_array_length(v_validated->'normalized');

  with sel as (
    select (x->>'product_id')::uuid as product_id,
           (x->>'quantity')::numeric as quantity
    from jsonb_array_elements(v_validated->'normalized') x
  ), priced as (
    select ci.id,
           s.quantity as new_quantity,
           case
             when s.quantity < bi.quantity then
               abs(s.quantity-bi.quantity) * coalesce(bi.remove_unit_delta, case when coalesce(p.price,0)>0 then -p.price end)
             when s.quantity > bi.quantity then
               (s.quantity-bi.quantity) * coalesce(bi.add_unit_delta, case when coalesce(p.price,0)>0 then p.price end)
             else 0::numeric
           end as new_delta
    from public.cart_items ci
    join sel s on s.product_id=ci.product_id
    join public.basket_template_items bi on bi.basket_id=p_basket_id and bi.product_id=ci.product_id
    join public.products p on p.id=ci.product_id
    where ci.cart_id=p_cart_id and ci.source in ('basket','substitution')
  )
  update public.cart_items ci
     set quantity=priced.new_quantity,
         commercial_delta=priced.new_delta,
         updated_at=now()
    from priced
   where ci.id=priced.id;
  get diagnostics v_updated=row_count;
  if v_updated<>v_expected then raise exception 'basket_selection_cart_mismatch'; end if;

  v_recalc:=public.recalculate_cart(p_cart_id);
  return v_recalc || jsonb_build_object(
    'selection',v_validated->'normalized',
    'updated_components',v_updated,
    'recalculation_count',1,
    'apply_mode','bulk_single_recalc'
  );
end;
$$;

revoke all on function public.apply_basket_cart_selection_v2(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.apply_basket_cart_selection_v2(uuid,uuid,jsonb) to service_role;

create or replace function public.apply_whatsapp_flow_commercial_write_v1(
  p_session_id uuid,
  p_expected_state_version integer,
  p_operation_key text,
  p_operation_type text,
  p_data jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  a public.automation_config%rowtype;
  s public.experience_sessions%rowtype;
  c public.conversations%rowtype;
  v_key text:=trim(coalesce(p_operation_key,''));
  v_type text:=lower(trim(coalesce(p_operation_type,'')));
  v_fp text;
  v_existing public.whatsapp_flow_write_operations%rowtype;
  v_result jsonb;
  v_cart jsonb;
  v_cart_id uuid;
  v_basket_id uuid;
  v_product_id uuid;
  v_quantity numeric;
  v_selection jsonb;
begin
  select * into a from public.automation_config where id=1;
  if not coalesce(a.whatsapp_flow_commercial_write_enabled,false) then raise exception 'whatsapp_flow_commercial_write_disabled'; end if;
  if not a.experience_orchestrator_enabled then raise exception 'experience_orchestrator_disabled'; end if;
  if not a.whatsapp_flow_data_exchange_enabled then raise exception 'whatsapp_flow_data_exchange_disabled'; end if;
  if not a.whatsapp_flow_send_enabled then raise exception 'whatsapp_flow_send_disabled'; end if;

  if v_key !~ '^[A-Za-z0-9:_-]{8,180}$' then raise exception 'invalid_operation_key'; end if;
  if v_type not in ('start_basket','apply_basket_selection','set_addon','set_upsell') then raise exception 'invalid_operation_type'; end if;
  v_fp:=encode(extensions.digest(convert_to(v_type||':'||coalesce(p_data,'{}'::jsonb)::text,'UTF8'),'sha256'),'hex');

  select * into v_existing from public.whatsapp_flow_write_operations where operation_key=v_key;
  if found then
    if v_existing.session_id is distinct from p_session_id or v_existing.operation_type<>v_type or v_existing.request_fingerprint<>v_fp then raise exception 'flow_write_idempotency_conflict'; end if;
    return v_existing.result || jsonb_build_object('idempotent_replay',true);
  end if;

  select * into s from public.experience_sessions where id=p_session_id for update;
  if not found then raise exception 'experience_session_not_found'; end if;
  if s.status not in ('offered','open') or s.expires_at<=now() then raise exception 'experience_session_inactive'; end if;
  if s.flow_state_version is distinct from p_expected_state_version then raise exception 'flow_state_version_conflict'; end if;
  select * into c from public.conversations where id=s.conversation_id for update;
  if not found then raise exception 'conversation_not_found'; end if;
  if c.human_required or c.mode='human' then raise exception 'conversation_requires_human'; end if;

  if v_type='start_basket' then
    begin v_basket_id:=(p_data->>'basket_id')::uuid; exception when others then raise exception 'invalid_basket_id'; end;
    v_result:=public.start_basket_cart(c.id,v_basket_id);
  elsif v_type='apply_basket_selection' then
    begin v_basket_id:=(coalesce(s.context->>'basket_id',''))::uuid; exception when others then raise exception 'basket_context_missing'; end;
    v_selection:=coalesce(p_data->'selection','[]'::jsonb);
    v_cart:=public.get_whatsapp_sales_cart_v1(c.id);
    if not coalesce((v_cart->>'exists')::boolean,false) or coalesce(v_cart->>'basket_id','')<>v_basket_id::text then raise exception 'basket_cart_not_started'; end if;
    v_cart_id:=(v_cart->>'cart_id')::uuid;
    v_result:=public.apply_basket_cart_selection_v2(v_cart_id,v_basket_id,v_selection);
  elsif v_type in ('set_addon','set_upsell') then
    begin v_product_id:=(p_data->>'product_id')::uuid; exception when others then raise exception 'invalid_product_id'; end;
    begin v_quantity:=(p_data->>'quantity')::numeric; exception when others then raise exception 'invalid_quantity'; end;
    if v_quantity<0 or v_quantity>99 or trunc(v_quantity)<>v_quantity then raise exception 'invalid_quantity'; end if;
    v_cart:=public.get_whatsapp_sales_cart_v1(c.id);
    if not coalesce((v_cart->>'exists')::boolean,false) then raise exception 'cart_not_started'; end if;
    v_cart_id:=(v_cart->>'cart_id')::uuid;
    v_result:=public.set_cart_addon_quantity(v_cart_id,v_product_id,v_quantity);
  end if;

  insert into public.whatsapp_flow_write_operations(operation_key,session_id,conversation_id,operation_type,request_fingerprint,result)
  values(v_key,s.id,c.id,v_type,v_fp,coalesce(v_result,'{}'::jsonb));

  return coalesce(v_result,'{}'::jsonb) || jsonb_build_object('idempotent_replay',false);
end;
$$;

revoke all on function public.apply_whatsapp_flow_commercial_write_v1(uuid,integer,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.apply_whatsapp_flow_commercial_write_v1(uuid,integer,text,text,jsonb) to service_role;

update public.experience_definitions
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'bulk_selection_single_recalc',true,
  'bulk_selection_recalculation_count',1,
  'implementation_stage','bulk_selection_single_recalc_v27'
),updated_at=now()
where slug='flow-cestas-comercial-v2';

commit;
