-- Keep the operational separator key consistent with the Admin UI.
-- Backward-compatible alias: claudenil -> claudio.
create or replace function public.ops2_set_order_separation_item_v2(
  p_order_id uuid,
  p_order_item_id uuid,
  p_state text,
  p_expected_order_updated_at timestamptz,
  p_separator_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
  v_state text := lower(trim(coalesce(p_state,'')));
  v_separator text := nullif(lower(trim(coalesce(p_separator_key,''))), '');
  v_now timestamptz := now();
begin
  if p_order_id is null or p_order_item_id is null then
    return jsonb_build_object('ok',false,'error','invalid_order_item');
  end if;

  if v_state not in ('separated','missing') then
    return jsonb_build_object('ok',false,'error','invalid_separation_state');
  end if;

  if v_separator='claudenil' then v_separator:='claudio'; end if;
  if v_separator is not null and v_separator not in ('jose','claudio','kelly','jovenil') then
    return jsonb_build_object('ok',false,'error','invalid_separator');
  end if;

  select * into v_order from public.orders where id=p_order_id for update;
  if not found then return jsonb_build_object('ok',false,'error','order_not_found'); end if;

  if v_order.status not in ('confirmed','processing') then
    return jsonb_build_object('ok',false,'error','order_not_in_separation','status',v_order.status);
  end if;

  if p_expected_order_updated_at is null or v_order.updated_at is distinct from p_expected_order_updated_at then
    return jsonb_build_object('ok',false,'error','stale_order_version','conflict','order_version_conflict','order_updated_at',v_order.updated_at);
  end if;

  if exists(select 1 from public.order_separation_completions_v1 where order_id=p_order_id) then
    return jsonb_build_object('ok',false,'error','separation_already_completed');
  end if;

  select * into v_item
  from public.order_items
  where id=p_order_item_id and order_id=p_order_id and quantity>0;
  if not found then return jsonb_build_object('ok',false,'error','order_item_not_found'); end if;

  insert into public.order_separation_items_v1(
    order_id,order_item_id,product_id,state,quantity,unit_price,line_total,
    changed_at,changed_by_separator_key,created_at,updated_at
  ) values(
    p_order_id,v_item.id,v_item.product_id,v_state,v_item.quantity,v_item.unit_price,v_item.line_total,
    v_now,v_separator,v_now,v_now
  )
  on conflict (order_id,order_item_id) do update
    set state=excluded.state,
        changed_at=v_now,
        changed_by_separator_key=v_separator,
        updated_at=v_now;

  update public.orders set updated_at=v_now where id=p_order_id;

  return jsonb_build_object(
    'ok',true,
    'order_id',p_order_id,
    'order_item_id',p_order_item_id,
    'state',v_state,
    'changed_by_separator_key',v_separator,
    'order_updated_at',v_now
  );
end;
$function$;
