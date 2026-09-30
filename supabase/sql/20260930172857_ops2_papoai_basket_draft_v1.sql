create or replace function public.papoai_prepare_basket_draft_v1(
  p_conversation_ref text,
  p_phone text,
  p_message text,
  p_customer_id uuid default null,
  p_source_event_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_cfg public.ops2_papoai_bridge_runtime_v1%rowtype;
  v_resolved jsonb;
  v_candidate jsonb;
  v_norm text:=regexp_replace(
    translate(lower(trim(coalesce(p_message,''))),
      'áàãâäéèêëíìîïóòõôöúùûüç',
      'aaaaaeeeeiiiiooooouuuuc'),
    '[^a-z0-9]+',' ','g'
  );
  v_qty integer:=1;
  v_match text[];
  v_cart jsonb;
  v_customer_snapshot jsonb:='{}'::jsonb;
  v_draft jsonb;
  v_price numeric:=0;
  v_available numeric:=0;
begin
  select * into v_cfg
  from public.ops2_papoai_bridge_runtime_v1
  where id=1;

  if coalesce(v_cfg.structured_draft_enabled,false) is not true then
    return jsonb_build_object(
      'ok',false,'blocked',true,'error','structured_draft_disabled','external_write',false
    );
  end if;

  if nullif(btrim(coalesce(p_conversation_ref,'')),'') is null then
    return jsonb_build_object('ok',false,'error','conversation_required','external_write',false);
  end if;

  if nullif(btrim(coalesce(p_message,'')),'') is null then
    return jsonb_build_object('ok',false,'error','message_required','external_write',false);
  end if;

  v_resolved:=public.papoai_resolve_basket_intent_v1(p_message);

  if coalesce((v_resolved->>'resolved')::boolean,false) is not true then
    return jsonb_build_object(
      'ok',true,
      'draft_created',false,
      'requires_clarification',coalesce((v_resolved->>'ambiguous')::boolean,false),
      'reason',coalesce(v_resolved->>'reason','basket_not_resolved'),
      'candidates',coalesce(v_resolved->'candidates','[]'::jsonb),
      'external_write',false
    );
  end if;

  v_candidate:=v_resolved->'candidates'->0;
  v_available:=coalesce((v_candidate->>'available_quantity')::numeric,0);
  if v_available<=0 then
    return jsonb_build_object(
      'ok',true,'draft_created',false,'requires_clarification',false,
      'reason','basket_unavailable','basket',v_candidate,'external_write',false
    );
  end if;

  v_match:=regexp_match(v_norm,'(^| )([1-9]|[12][0-9]|30)(x| |$)');
  if v_match is not null and array_length(v_match,1)>=2 then
    begin v_qty:=greatest(1,least(30,v_match[2]::integer)); exception when others then v_qty:=1; end;
  elsif v_norm ~ '(^| )duas( |$)' then v_qty:=2;
  elsif v_norm ~ '(^| )(tres|três)( |$)' then v_qty:=3;
  elsif v_norm ~ '(^| )quatro( |$)' then v_qty:=4;
  elsif v_norm ~ '(^| )cinco( |$)' then v_qty:=5;
  elsif v_norm ~ '(^| )seis( |$)' then v_qty:=6;
  elsif v_norm ~ '(^| )sete( |$)' then v_qty:=7;
  elsif v_norm ~ '(^| )oito( |$)' then v_qty:=8;
  elsif v_norm ~ '(^| )nove( |$)' then v_qty:=9;
  elsif v_norm ~ '(^| )dez( |$)' then v_qty:=10;
  else v_qty:=1;
  end if;

  if v_qty>floor(v_available) then
    return jsonb_build_object(
      'ok',true,'draft_created',false,'requires_clarification',false,
      'reason','basket_quantity_unavailable','requested_quantity',v_qty,
      'available_quantity',v_available,'basket',v_candidate,'external_write',false
    );
  end if;

  if p_customer_id is not null then
    select jsonb_strip_nulls(jsonb_build_object(
      'id',c.id,
      'display_name',nullif(btrim(coalesce(c.name,'')),'')
    ))
    into v_customer_snapshot
    from public.customers c
    where c.id=p_customer_id;
    v_customer_snapshot:=coalesce(v_customer_snapshot,'{}'::jsonb);
  end if;

  v_cart:=jsonb_build_array(jsonb_build_object(
    'type','basket',
    'id',v_candidate->>'basket_id',
    'qty',v_qty
  ));

  v_draft:=public.papoai_upsert_order_draft_v2(
    p_conversation_ref,
    p_phone,
    v_cart,
    null,
    v_customer_snapshot,
    '{}'::jsonb,
    p_customer_id,
    p_source_event_key
  );

  v_price:=coalesce((v_candidate->>'price')::numeric,0);

  return jsonb_build_object(
    'ok',true,
    'draft_created',true,
    'draft',v_draft,
    'basket',v_candidate,
    'quantity',v_qty,
    'quoted_subtotal_cents',round(v_price*v_qty*100)::bigint,
    'needs_payment',true,
    'needs_delivery_review',true,
    'requires_clarification',false,
    'external_order_created',false,
    'structured_order_commit_enabled',coalesce(v_cfg.structured_order_commit_enabled,false)
  );
end;
$$;

revoke all on function public.papoai_prepare_basket_draft_v1(text,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.papoai_prepare_basket_draft_v1(text,text,text,uuid,text) to service_role;
