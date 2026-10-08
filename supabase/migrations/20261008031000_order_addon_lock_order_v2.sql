-- ANA V3 R11: lock canonical order before session, avoiding confirmation deadlock.
-- Preserve reserve_vitrine_order_stock_v1, idempotent_replay and original order id.
-- Guard against drift: do not patch an unexpected live function definition.
do $migration$
declare
  v_def text;
  v_old text:=$old$  select * into v_session
  from private.order_addon_sessions_v1
  where token_hash=v_token_hash
  for update;
  if not found then
    return jsonb_build_object('ok',false,'error','session_not_found');
  end if;$old$;
  v_new text:=$new$  -- Lock canonical order before session, matching confirmation.
  select order_id into v_order_id from private.order_addon_sessions_v1 where token_hash=v_token_hash;
  if not found then return jsonb_build_object('ok',false,'error','session_not_found'); end if;
  select * into v_order from public.orders where id=v_order_id for update;
  if not found then return jsonb_build_object('ok',false,'error','order_not_found'); end if;
  select * into v_session from private.order_addon_sessions_v1
  where token_hash=v_token_hash and order_id=v_order.id for update;
  if not found then return jsonb_build_object('ok',false,'error','session_not_found'); end if;$new$;
  v_late text:=$late$  select * into v_order
  from public.orders
  where id=v_session.order_id
  for update;
  if not found then
    return jsonb_build_object('ok',false,'error','order_not_found');
  end if;$late$;
begin
  select pg_get_functiondef('public.ops3_add_items_to_existing_order_v1(text,text,jsonb)'::regprocedure) into v_def;
  if position(v_old in v_def)=0 or position(v_late in v_def)=0
     or position('  v_order public.orders%rowtype;' in v_def)=0 then
    raise exception 'addon_lock_order_v2: unexpected definition; no changes applied';
  end if;
  v_def:=replace(v_def,'  v_order public.orders%rowtype;',
                     '  v_order public.orders%rowtype;'||E'\n'||'  v_order_id uuid;');
  v_def:=replace(v_def,v_old,v_new);
  v_def:=replace(v_def,v_late,'');
  execute v_def;
end;
$migration$;
