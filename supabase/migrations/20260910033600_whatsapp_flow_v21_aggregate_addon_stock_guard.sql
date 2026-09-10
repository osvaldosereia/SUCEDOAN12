create or replace function public.handle_whatsapp_flow_commercial_exchange_v21(
  p_session_id uuid,
  p_conversation_id uuid,
  p_action text,
  p_screen text default null,
  p_data jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_product_id uuid;
  v_qty int;
  v_stock int;
  v_limit int;
  v_existing_qty int:=0;
  v_context jsonb;
begin
  if coalesce(p_screen,'') ~ '^PRODUTO_[ABC]$'
     and coalesce(p_data->>'trigger','')='add_product' then
    begin
      v_product_id:=(p_data->>'product_id')::uuid;
    exception when others then
      return jsonb_build_object('ok',false,'reason','invalid_product_id');
    end;
    begin
      v_qty:=(p_data->>'quantity')::int;
    exception when others then
      return jsonb_build_object('ok',false,'reason','invalid_quantity');
    end;

    select floor(coalesce(stock,0))::int
      into v_stock
      from public.products
     where id=v_product_id
       and is_active=true
       and coalesce(is_whatsapp_active,false)=true
       and coalesce(price,0)>0;
    if not found then
      return jsonb_build_object('ok',false,'reason','product_not_sellable');
    end if;

    select coalesce(context,'{}'::jsonb)
      into v_context
      from public.experience_sessions
     where id=p_session_id
       and conversation_id=p_conversation_id;
    if not found then
      return jsonb_build_object('ok',false,'reason','session_not_found');
    end if;

    if jsonb_typeof(v_context->'flow_pending_addons')='array' then
      select coalesce(sum(
        case when coalesce(e->>'product_id','')=v_product_id::text
             then case when coalesce(e->>'quantity','') ~ '^[0-9]+$' then (e->>'quantity')::int else 0 end
             else 0 end
      ),0)::int
        into v_existing_qty
        from jsonb_array_elements(v_context->'flow_pending_addons') e;
    end if;

    v_limit:=least(6,greatest(0,v_stock));
    if v_qty<1 or v_existing_qty+v_qty>v_limit then
      return jsonb_build_object(
        'ok',false,
        'reason','quantity_exceeds_available_stock',
        'available_quantity',greatest(0,v_limit-v_existing_qty),
        'already_selected_quantity',v_existing_qty,
        'maximum_total_quantity',v_limit
      );
    end if;
  end if;

  return public.handle_whatsapp_flow_commercial_exchange_v20(
    p_session_id,p_conversation_id,p_action,p_screen,p_data
  );
end;
$function$;

revoke all on function public.handle_whatsapp_flow_commercial_exchange_v21(uuid,uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.handle_whatsapp_flow_commercial_exchange_v21(uuid,uuid,text,text,jsonb) to service_role;
