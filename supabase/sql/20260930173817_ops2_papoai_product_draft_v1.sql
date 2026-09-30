create or replace function public.papoai_prepare_product_draft_v1(
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
  v_raw text:=trim(coalesce(p_message,''));
  v_split text;
  v_line text;
  v_query text;
  v_qty integer;
  v_match text[];
  v_resolved jsonb;
  v_candidate jsonb;
  v_cart jsonb:='[]'::jsonb;
  v_issues jsonb:='[]'::jsonb;
  v_customer_snapshot jsonb:='{}'::jsonb;
  v_draft jsonb;
  v_total_cents bigint:=0;
  v_count integer:=0;
  v_stock numeric:=0;
  v_price numeric:=0;
begin
  select * into v_cfg from public.ops2_papoai_bridge_runtime_v1 where id=1;
  if coalesce(v_cfg.structured_draft_enabled,false) is not true then
    return jsonb_build_object('ok',false,'blocked',true,'error','structured_draft_disabled','external_write',false);
  end if;
  if nullif(btrim(coalesce(p_conversation_ref,'')),'') is null then
    return jsonb_build_object('ok',false,'error','conversation_required','external_write',false);
  end if;
  if v_raw='' then
    return jsonb_build_object('ok',false,'error','message_required','external_write',false);
  end if;

  v_split:=regexp_replace(v_raw,'[\r\n;]+',',','g');
  v_split:=regexp_replace(v_split,'\s+e\s+',',','gi');

  for v_line in
    select btrim(x) from regexp_split_to_table(v_split,',') x where btrim(x)<>''
  loop
    v_count:=v_count+1;
    if v_count>20 then
      return jsonb_build_object('ok',false,'error','too_many_product_lines','external_write',false);
    end if;

    v_query:=regexp_replace(v_line,
      '^\s*(quero|queria|preciso\s+de|me\s+manda|me\s+mande|manda|mande|coloca|coloque|adiciona|adicione)\s+',
      '','i');
    v_qty:=1;

    v_match:=regexp_match(v_query,'^\s*([1-9]|[12][0-9]|30)\s*(x|un|unidade|unidades)?\s+','i');
    if v_match is not null and array_length(v_match,1)>=1 then
      begin v_qty:=greatest(1,least(30,v_match[1]::integer)); exception when others then v_qty:=1; end;
      v_query:=regexp_replace(v_query,'^\s*([1-9]|[12][0-9]|30)\s*(x|un|unidade|unidades)?\s+','','i');
    elsif lower(v_query) ~ '^\s*duas\s+' then v_qty:=2; v_query:=regexp_replace(v_query,'^\s*duas\s+','','i');
    elsif translate(lower(v_query),'êéè','eee') ~ '^\s*tres\s+' then v_qty:=3; v_query:=regexp_replace(v_query,'^\s*(três|tres)\s+','','i');
    elsif lower(v_query) ~ '^\s*quatro\s+' then v_qty:=4; v_query:=regexp_replace(v_query,'^\s*quatro\s+','','i');
    elsif lower(v_query) ~ '^\s*cinco\s+' then v_qty:=5; v_query:=regexp_replace(v_query,'^\s*cinco\s+','','i');
    end if;

    v_query:=btrim(v_query);
    if v_query='' then
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('line',v_line,'reason','product_query_missing'));
      continue;
    end if;

    v_resolved:=public.papoai_resolve_product_intent_v1(v_query,5);
    if coalesce((v_resolved->>'resolved')::boolean,false) is not true then
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object(
        'line',v_line,'query',v_query,'quantity',v_qty,
        'reason',coalesce(v_resolved->>'reason','product_not_resolved'),
        'candidates',coalesce(v_resolved->'candidates','[]'::jsonb)
      ));
      continue;
    end if;

    v_candidate:=v_resolved->'candidates'->0;
    v_stock:=coalesce((v_candidate->>'stock')::numeric,0);
    if v_stock<v_qty then
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object(
        'line',v_line,'query',v_query,'quantity',v_qty,'reason','insufficient_stock',
        'available_quantity',v_stock,'product',v_candidate
      ));
      continue;
    end if;

    v_cart:=v_cart||jsonb_build_array(jsonb_build_object(
      'type','product','id',v_candidate->>'product_id','qty',v_qty
    ));
    v_price:=coalesce((v_candidate->>'price')::numeric,0);
    v_total_cents:=v_total_cents+round(v_price*v_qty*100)::bigint;
  end loop;

  if v_count=0 then
    return jsonb_build_object('ok',true,'draft_created',false,'reason','no_product_lines','external_write',false);
  end if;

  if jsonb_array_length(v_issues)>0 then
    return jsonb_build_object(
      'ok',true,'draft_created',false,'requires_clarification',true,
      'issues',v_issues,'resolved_cart',v_cart,'external_write',false
    );
  end if;

  if jsonb_array_length(v_cart)=0 then
    return jsonb_build_object('ok',true,'draft_created',false,'reason','no_resolved_products','external_write',false);
  end if;

  if p_customer_id is not null then
    select jsonb_strip_nulls(jsonb_build_object('id',c.id,'display_name',nullif(btrim(coalesce(c.name,'')),'')))
      into v_customer_snapshot
      from public.customers c where c.id=p_customer_id;
    v_customer_snapshot:=coalesce(v_customer_snapshot,'{}'::jsonb);
  end if;

  v_draft:=public.papoai_upsert_order_draft_v2(
    p_conversation_ref,p_phone,v_cart,null,v_customer_snapshot,'{}'::jsonb,p_customer_id,p_source_event_key
  );

  return jsonb_build_object(
    'ok',true,'draft_created',true,'draft',v_draft,'cart',v_cart,
    'quoted_subtotal_cents',v_total_cents,'needs_payment',true,'needs_delivery_review',true,
    'requires_clarification',false,'external_order_created',false,
    'structured_order_commit_enabled',coalesce(v_cfg.structured_order_commit_enabled,false)
  );
end;
$$;

revoke all on function public.papoai_prepare_product_draft_v1(text,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.papoai_prepare_product_draft_v1(text,text,text,uuid,text) to service_role;
