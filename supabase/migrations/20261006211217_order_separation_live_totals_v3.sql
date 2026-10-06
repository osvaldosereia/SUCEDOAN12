-- Mantem a vitrine do cliente e a vitrine de separacao com o abatimento visivel
-- assim que um item e marcado como FALTOU. A mutacao financeira canonica do
-- pedido continua ocorrendo na conclusao da separacao.

create or replace function public.ops2_get_order_separation_v2(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_order public.orders%rowtype;
  v_assignment jsonb := null;
  v_completion jsonb := null;
  v_items jsonb := '[]'::jsonb;
  v_pending integer := 0;
  v_separated integer := 0;
  v_missing integer := 0;
  v_init jsonb;
  v_live_missing_subtotal numeric(14,2) := 0;
  v_original_total numeric(14,2) := 0;
  v_final_total numeric(14,2) := 0;
begin
  if p_order_id is null then
    return jsonb_build_object('ok',false,'error','invalid_order_id');
  end if;

  select * into v_order from public.orders where id=p_order_id;
  if not found then
    return jsonb_build_object('ok',false,'error','order_not_found');
  end if;

  if v_order.status in ('confirmed','processing')
     and not exists(select 1 from public.order_separation_completions_v1 where order_id=p_order_id) then
    v_init := public.ops2_init_order_separation_v2(p_order_id);
    if coalesce((v_init->>'ok')::boolean,false) is not true then
      return v_init;
    end if;
  end if;

  select jsonb_build_object(
    'separator_key',a.separator_key,
    'separator_label',a.separator_label,
    'assigned_at',a.assigned_at,
    'updated_at',a.updated_at
  ) into v_assignment
  from public.order_separation_assignments_v1 a
  where a.order_id=p_order_id;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',s.id,
    'order_item_id',s.order_item_id,
    'product_id',s.product_id,
    'state',s.state,
    'quantity',s.quantity,
    'unit_price',s.unit_price,
    'line_total',s.line_total,
    'changed_at',s.changed_at,
    'changed_by_separator_key',s.changed_by_separator_key,
    'name',oi.name_snapshot,
    'sku',oi.sku_snapshot,
    'image_url',nullif(coalesce(oi.metadata->>'image_url',p.image_url,''),''),
    'basket_name',nullif(oi.metadata->>'basket_name',''),
    'basket_id',nullif(oi.metadata->>'basket_id',''),
    'kind',coalesce(nullif(oi.metadata->>'history_kind',''),'product'),
    'updated_at',s.updated_at
  )) order by oi.created_at,oi.id),'[]'::jsonb)
  into v_items
  from public.order_separation_items_v1 s
  join public.order_items oi on oi.id=s.order_item_id
  left join public.products p on p.id=s.product_id
  where s.order_id=p_order_id;

  select
    count(*) filter(where state='pending'),
    count(*) filter(where state='separated'),
    count(*) filter(where state='missing'),
    round(coalesce(sum(line_total) filter(where state='missing'),0)::numeric,2)
  into v_pending,v_separated,v_missing,v_live_missing_subtotal
  from public.order_separation_items_v1
  where order_id=p_order_id;

  select jsonb_strip_nulls(jsonb_build_object(
    'id',c.id,
    'phase',c.phase,
    'original_total',c.original_total,
    'missing_subtotal',c.missing_subtotal,
    'final_total',c.final_total,
    'separator_key',c.separator_key,
    'prepared_at',c.prepared_at,
    'completed_at',c.completed_at,
    'metadata',c.metadata
  )) into v_completion
  from public.order_separation_completions_v1 c
  where c.order_id=p_order_id;

  v_original_total := round(coalesce((v_completion->>'original_total')::numeric,v_order.total,0)::numeric,2);
  if v_completion is not null and v_completion <> 'null'::jsonb then
    v_live_missing_subtotal := round(coalesce((v_completion->>'missing_subtotal')::numeric,v_live_missing_subtotal,0)::numeric,2);
    v_final_total := round(coalesce((v_completion->>'final_total')::numeric,v_order.total,0)::numeric,2);
  else
    v_final_total := greatest(0,round(v_original_total-v_live_missing_subtotal,2));
  end if;

  return jsonb_build_object(
    'ok',true,
    'order_id',v_order.id,
    'order_number',v_order.order_number,
    'status',v_order.status,
    'order_updated_at',v_order.updated_at,
    'customer_name',coalesce(nullif(v_order.customer_snapshot->>'name',''),nullif(v_order.delivery_address->>'customer_name',''),'Cliente'),
    'delivery',v_order.delivery_address,
    'original_total',v_original_total,
    'missing_subtotal',v_live_missing_subtotal,
    'final_total',v_final_total,
    'total',v_order.total,
    'assignment',coalesce(v_assignment,'null'::jsonb),
    'items',v_items,
    'counts',jsonb_build_object('pending',v_pending,'separated',v_separated,'missing',v_missing,'total',v_pending+v_separated+v_missing),
    'completion',coalesce(v_completion,'null'::jsonb)
  );
end;
$function$;

create or replace function public.ops2_refresh_order_public_snapshot_v1(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_order public.orders%rowtype;
  v_completion public.order_separation_completions_v1%rowtype;
  v_snapshot jsonb;
  v_live_missing_subtotal numeric(14,2) := 0;
  v_original_total numeric(14,2) := 0;
  v_final_total numeric(14,2) := 0;
begin
  select * into v_order from public.orders where id=p_order_id;
  if not found then return null; end if;

  select * into v_completion
  from public.order_separation_completions_v1
  where order_id=p_order_id;

  select round(coalesce(sum(line_total),0)::numeric,2)
  into v_live_missing_subtotal
  from public.order_separation_items_v1
  where order_id=p_order_id and state='missing';

  if v_completion.id is not null then
    v_original_total := round(coalesce(v_completion.original_total,v_order.total,0)::numeric,2);
    v_live_missing_subtotal := round(coalesce(v_completion.missing_subtotal,v_live_missing_subtotal,0)::numeric,2);
    v_final_total := round(coalesce(v_completion.final_total,v_order.total,0)::numeric,2);
  else
    v_original_total := round(coalesce(v_order.total,0)::numeric,2);
    v_final_total := greatest(0,round(v_original_total-v_live_missing_subtotal,2));
  end if;

  select jsonb_strip_nulls(jsonb_build_object(
    'version',3,
    'order_id',v_order.id::text,
    'order_number',v_order.order_number,
    'created_at',v_order.created_at,
    'total',v_final_total,
    'subtotal',case when v_completion.id is not null then v_order.subtotal else greatest(0,round(coalesce(v_order.subtotal,0)-v_live_missing_subtotal,2)) end,
    'original_total',v_original_total,
    'missing_subtotal',v_live_missing_subtotal,
    'final_total',v_final_total,
    'separation_completed_at',v_completion.completed_at,
    'payment_label',coalesce(nullif(v_order.checkout_snapshot->>'payment_label',''),nullif(v_order.payment_method,''),'A confirmar'),
    'customer_name',coalesce(nullif(v_order.customer_snapshot->>'name',''),nullif(v_order.customer_snapshot->>'display_name',''),nullif(v_order.delivery_address->>'customer_name',''),'Cliente'),
    'delivery',jsonb_strip_nulls(jsonb_build_object(
      'street',v_order.delivery_address->>'street',
      'number',v_order.delivery_address->>'number',
      'complement',v_order.delivery_address->>'complement',
      'district',coalesce(nullif(v_order.delivery_address->>'district',''),nullif(v_order.delivery_address->>'neighborhood','')),
      'city',v_order.delivery_address->>'city',
      'state',v_order.delivery_address->>'state',
      'reference',coalesce(nullif(v_order.delivery_address->>'reference',''),nullif(v_order.delivery_address->>'raw_text','')),
      'delivery_date',v_order.delivery_address->>'delivery_date',
      'delivery_label',v_order.delivery_address->>'delivery_label'
    )),
    'baskets',coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id',coalesce(bt.id::text,x.item->>'id'),
        'name',coalesce(bt.name,v_order.basket_name_snapshot,'Cesta'),
        'image_url',nullif(bt.image_url,''),
        'quantity',coalesce(nullif(x.item->>'qty','')::numeric,1)
      )) order by x.ord)
      from jsonb_array_elements(coalesce(v_order.checkout_snapshot->'cart','[]'::jsonb)) with ordinality as x(item,ord)
      left join public.basket_templates bt on bt.id::text=x.item->>'id'
      where x.item->>'type'='basket'
    ),'[]'::jsonb),
    'items',coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'order_item_id',oi.id::text,
        'name',oi.name_snapshot,
        'quantity',oi.quantity,
        'unit_price',oi.unit_price,
        'line_total',oi.line_total,
        'image_url',nullif(coalesce(oi.metadata->>'image_url',p.image_url,''),''),
        'basket_name',nullif(oi.metadata->>'basket_name',''),
        'basket_id',nullif(oi.metadata->>'basket_id',''),
        'kind',coalesce(nullif(oi.metadata->>'history_kind',''),'product'),
        'separation_state',si.state
      )) order by oi.created_at,oi.id)
      from public.order_items oi
      left join public.products p on p.id=oi.product_id
      left join public.order_separation_items_v1 si
        on si.order_id=oi.order_id and si.order_item_id=oi.id
      where oi.order_id=p_order_id and oi.quantity>0
    ),'[]'::jsonb)
  )) into v_snapshot;

  insert into public.order_public_snapshots_v1(order_id,snapshot,refreshed_at)
  values(p_order_id,v_snapshot,now())
  on conflict(order_id) do update
    set snapshot=excluded.snapshot,refreshed_at=now();

  return v_snapshot;
end;
$function$;
