-- Dona Antônia · Order Separation V2 completion pipeline
-- Additive migration layered on top of 20261003193000_order_separation_v2.sql.

create or replace function public.ops2_prepare_order_separation_completion_v2(
  p_order_id uuid,
  p_expected_order_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_existing public.order_separation_completions_v1%rowtype;
  v_pending integer := 0;
  v_total_items integer := 0;
  v_original_total numeric(14,2) := 0;
  v_original_subtotal numeric(14,2) := 0;
  v_original_fiscal_subtotal numeric(14,2) := 0;
  v_missing_subtotal numeric(14,2) := 0;
  v_final_total numeric(14,2) := 0;
  v_new_subtotal numeric(14,2) := 0;
  v_new_fiscal_subtotal numeric(14,2) := 0;
  v_missing_items jsonb := '[]'::jsonb;
  v_deliverable_ids uuid[] := '{}'::uuid[];
  v_separator text := null;
  v_now timestamptz := now();
begin
  if p_order_id is null then
    return jsonb_build_object('ok',false,'error','invalid_order_id');
  end if;

  select * into v_order
  from public.orders
  where id=p_order_id
  for update;

  if not found then
    return jsonb_build_object('ok',false,'error','order_not_found');
  end if;

  select * into v_existing
  from public.order_separation_completions_v1
  where order_id=p_order_id;

  if found then
    return jsonb_build_object(
      'ok',true,
      'status','already_prepared',
      'order_id',p_order_id,
      'phase',v_existing.phase,
      'original_total',v_existing.original_total,
      'missing_subtotal',v_existing.missing_subtotal,
      'final_total',v_existing.final_total,
      'deliverable_order_item_ids',to_jsonb(v_existing.deliverable_order_item_ids),
      'metadata',v_existing.metadata
    );
  end if;

  if v_order.status not in ('confirmed','processing') then
    return jsonb_build_object('ok',false,'error','order_not_in_separation','status',v_order.status);
  end if;

  if p_expected_order_updated_at is null or v_order.updated_at is distinct from p_expected_order_updated_at then
    return jsonb_build_object(
      'ok',false,
      'error','stale_order_version',
      'conflict','order_version_conflict',
      'order_updated_at',v_order.updated_at
    );
  end if;

  perform public.ops2_init_order_separation_v2(p_order_id);

  select
    count(*) filter(where state='pending'),
    count(*)
  into v_pending,v_total_items
  from public.order_separation_items_v1
  where order_id=p_order_id;

  if v_total_items=0 then
    return jsonb_build_object('ok',false,'error','order_has_no_items');
  end if;
  if v_pending>0 then
    return jsonb_build_object('ok',false,'error','separation_incomplete','pending_count',v_pending);
  end if;

  select round(coalesce(sum(line_total),0)::numeric,2)
  into v_missing_subtotal
  from public.order_separation_items_v1
  where order_id=p_order_id and state='missing';

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'order_item_id',s.order_item_id,
    'product_id',s.product_id,
    'name',oi.name_snapshot,
    'quantity',s.quantity,
    'unit_price',s.unit_price,
    'line_total',s.line_total,
    'basket_name',nullif(oi.metadata->>'basket_name',''),
    'basket_id',nullif(oi.metadata->>'basket_id',''),
    'kind',coalesce(nullif(oi.metadata->>'history_kind',''),'product')
  )) order by oi.created_at,oi.id),'[]'::jsonb)
  into v_missing_items
  from public.order_separation_items_v1 s
  join public.order_items oi on oi.id=s.order_item_id
  where s.order_id=p_order_id and s.state='missing';

  select coalesce(array_agg(order_item_id order by order_item_id) filter(where state='separated'),'{}'::uuid[])
  into v_deliverable_ids
  from public.order_separation_items_v1
  where order_id=p_order_id;

  select separator_key into v_separator
  from public.order_separation_assignments_v1
  where order_id=p_order_id;

  v_original_total := round(coalesce(v_order.total,0)::numeric,2);
  v_original_subtotal := round(coalesce(v_order.subtotal,0)::numeric,2);
  v_original_fiscal_subtotal := round(coalesce(v_order.fiscal_subtotal,0)::numeric,2);
  v_final_total := round(v_original_total - v_missing_subtotal,2);
  v_new_subtotal := round(v_original_subtotal - v_missing_subtotal,2);
  v_new_fiscal_subtotal := round(v_original_fiscal_subtotal - v_missing_subtotal,2);

  if v_final_total<0 or v_new_subtotal<0 or v_new_fiscal_subtotal<0 then
    return jsonb_build_object(
      'ok',false,
      'error','missing_adjustment_exceeds_order_value',
      'missing_subtotal',v_missing_subtotal,
      'original_total',v_original_total,
      'original_subtotal',v_original_subtotal,
      'original_fiscal_subtotal',v_original_fiscal_subtotal
    );
  end if;

  insert into public.order_separation_completions_v1(
    order_id,order_number,phase,
    original_total,original_subtotal,original_fiscal_subtotal,
    original_discount,original_other_expenses,original_basket_hidden_adjustment,
    missing_subtotal,final_total,missing_items,deliverable_order_item_ids,
    separator_key,metadata,prepared_at,created_at,updated_at
  ) values(
    p_order_id,v_order.order_number,'prepared',
    v_original_total,v_original_subtotal,v_original_fiscal_subtotal,
    coalesce(v_order.discount,0),coalesce(v_order.other_expenses,0),coalesce(v_order.basket_hidden_adjustment,0),
    v_missing_subtotal,v_final_total,v_missing_items,v_deliverable_ids,
    v_separator,
    jsonb_build_object(
      'financial_applied',true,
      'stock_applied',false,
      'physical_stock_launched',false,
      'original_order_updated_at',v_order.updated_at,
      'prepared_by','order_separation_v2'
    ),
    v_now,v_now,v_now
  )
  on conflict (order_id) do nothing;

  update public.orders
  set total=v_final_total,
      subtotal=v_new_subtotal,
      fiscal_subtotal=v_new_fiscal_subtotal,
      updated_at=v_now
  where id=p_order_id;

  return jsonb_build_object(
    'ok',true,
    'status','prepared',
    'order_id',p_order_id,
    'order_number',v_order.order_number,
    'original_total',v_original_total,
    'missing_subtotal',v_missing_subtotal,
    'final_total',v_final_total,
    'subtotal',v_new_subtotal,
    'fiscal_subtotal',v_new_fiscal_subtotal,
    'discount',coalesce(v_order.discount,0),
    'other_expenses',coalesce(v_order.other_expenses,0),
    'basket_hidden_adjustment',coalesce(v_order.basket_hidden_adjustment,0),
    'missing_items',v_missing_items,
    'deliverable_order_item_ids',to_jsonb(v_deliverable_ids),
    'order_updated_at',v_now
  );
end;
$$;

create or replace function public.ops2_apply_order_separation_stock_v2(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_completion public.order_separation_completions_v1%rowtype;
  v_authority text := 'legacy_shadow';
  v_missing_components jsonb := '[]'::jsonb;
  v_now timestamptz := now();
  r record;
  v_deliverable_qty numeric := 0;
begin
  if p_order_id is null then
    return jsonb_build_object('ok',false,'error','invalid_order_id');
  end if;

  select * into v_completion
  from public.order_separation_completions_v1
  where order_id=p_order_id
  for update;

  if not found then
    return jsonb_build_object('ok',false,'error','separation_completion_not_prepared');
  end if;

  if coalesce((v_completion.metadata->>'stock_applied')::boolean,false) then
    return jsonb_build_object(
      'ok',true,'status','already_applied','physical_stock_changed',false,
      'phase',v_completion.phase,'metadata',v_completion.metadata
    );
  end if;

  select coalesce(metadata->>'ops2_stock_authority','legacy_shadow')
  into v_authority
  from public.bling_hub_runtime_v2
  where id=1;

  if coalesce(v_authority,'legacy_shadow')<>'bling' then
    return jsonb_build_object('ok',false,'error','separation_requires_bling_stock_authority','stock_authority',v_authority);
  end if;

  for r in
    select vr.id,vr.product_id,vr.quantity,
           coalesce(d.deliverable_qty,0) as deliverable_qty
    from public.vitrine_stock_reservations vr
    left join (
      select product_id, sum(quantity)::numeric as deliverable_qty
      from public.order_separation_items_v1
      where order_id=p_order_id and state='separated' and product_id is not null
      group by product_id
    ) d on d.product_id=vr.product_id
    where vr.order_id=p_order_id
    order by vr.product_id
    for update of vr
  loop
    v_deliverable_qty:=coalesce(r.deliverable_qty,0);
    if v_deliverable_qty<=0 then
      update public.vitrine_stock_reservations
      set status='released',released_at=v_now,consumed_at=null,updated_at=v_now
      where id=r.id;
    else
      update public.vitrine_stock_reservations
      set quantity=v_deliverable_qty,status='consumed',consumed_at=v_now,released_at=null,updated_at=v_now
      where id=r.id;
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'order_item_id',s.order_item_id,
    'product_id',s.product_id,
    'quantity',s.quantity,
    'basket_id',nullif(oi.metadata->>'basket_id',''),
    'basket_name',nullif(oi.metadata->>'basket_name','')
  ))),'[]'::jsonb)
  into v_missing_components
  from public.order_separation_items_v1 s
  join public.order_items oi on oi.id=s.order_item_id
  where s.order_id=p_order_id and s.state='missing';

  update public.basket_stock_allocations
  set metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
        'separation_v2_missing_components',v_missing_components,
        'separation_v2_applied_at',v_now
      )
  where order_id=p_order_id;

  update public.order_separation_completions_v1
  set phase='stock_applied',
      metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
        'stock_applied',true,
        'stock_authority',v_authority,
        'physical_stock_changed',false,
        'missing_components',v_missing_components,
        'stock_applied_at',v_now
      ),
      updated_at=v_now
  where order_id=p_order_id;

  return jsonb_build_object(
    'ok',true,
    'status','stock_applied',
    'stock_authority',v_authority,
    'physical_stock_changed',false,
    'missing_components',v_missing_components
  );
end;
$$;

create or replace function public.ops2_mark_order_separation_completion_v2(
  p_order_id uuid,
  p_phase text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_phase text := lower(trim(coalesce(p_phase,'')));
  v_now timestamptz := now();
  v_row public.order_separation_completions_v1%rowtype;
begin
  if v_phase not in ('prepared','stock_applied','bling_verified','ready','physical_stock_launched','needs_attention','completed') then
    return jsonb_build_object('ok',false,'error','invalid_completion_phase');
  end if;

  update public.order_separation_completions_v1
  set phase=v_phase,
      metadata=coalesce(metadata,'{}'::jsonb) || coalesce(p_metadata,'{}'::jsonb),
      completed_at=case when v_phase='completed' then coalesce(completed_at,v_now) else completed_at end,
      updated_at=v_now
  where order_id=p_order_id
  returning * into v_row;

  if not found then
    return jsonb_build_object('ok',false,'error','separation_completion_not_found');
  end if;

  return jsonb_build_object(
    'ok',true,
    'order_id',p_order_id,
    'phase',v_row.phase,
    'original_total',v_row.original_total,
    'missing_subtotal',v_row.missing_subtotal,
    'final_total',v_row.final_total,
    'completed_at',v_row.completed_at,
    'metadata',v_row.metadata
  );
end;
$$;

revoke all on function public.ops2_prepare_order_separation_completion_v2(uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.ops2_apply_order_separation_stock_v2(uuid) from public,anon,authenticated;
revoke all on function public.ops2_mark_order_separation_completion_v2(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.ops2_prepare_order_separation_completion_v2(uuid,timestamptz) to service_role;
grant execute on function public.ops2_apply_order_separation_stock_v2(uuid) to service_role;
grant execute on function public.ops2_mark_order_separation_completion_v2(uuid,text,jsonb) to service_role;

-- Preserve the existing fiscal/bling safeguards while allowing a completed
-- separation to compute item_sum from deliverable lines only.
create or replace function public.ops2_fiscal_dispatch_preflight_v1(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  o public.orders%rowtype;
  item_sum numeric(14,2):=0;
  expected_total numeric(14,2):=0;
  link_status text;
  link_meta jsonb:='{}'::jsonb;
  runtime_meta jsonb:='{}'::jsonb;
  target_verified_id bigint:=0;
  blockers text[]:='{}';
  v_has_separation boolean:=false;
begin
  select * into o from public.orders where id=p_order_id;
  if not found then
    return jsonb_build_object('ok',false,'ready',false,'blockers',jsonb_build_array('order_not_found'));
  end if;

  select exists(select 1 from public.order_separation_completions_v1 where order_id=o.id)
  into v_has_separation;

  if v_has_separation then
    select round(coalesce(sum(line_total),0)::numeric,2)
      into item_sum
      from public.order_separation_items_v1
     where order_id=o.id and state='separated';
  else
    select round(coalesce(sum(line_total),0)::numeric,2)
      into item_sum
      from public.order_items
     where order_id=o.id;
  end if;

  expected_total:=round((coalesce(o.fiscal_subtotal,0)+coalesce(o.other_expenses,0)-coalesce(o.discount,0))::numeric,2);

  if o.status<>'ready' then blockers:=array_append(blockers,'order_not_ready'); end if;
  if abs(item_sum-round(coalesce(o.fiscal_subtotal,0)::numeric,2))>0.01 then blockers:=array_append(blockers,'fiscal_subtotal_item_sum_mismatch'); end if;
  if abs(round(coalesce(o.total,0)::numeric,2)-expected_total)>0.01 then blockers:=array_append(blockers,'canonical_total_not_balanced'); end if;
  if coalesce(o.other_expenses,0)<0 then blockers:=array_append(blockers,'negative_other_expenses'); end if;
  if coalesce(o.discount,0)<0 then blockers:=array_append(blockers,'negative_discount'); end if;

  select status,coalesce(metadata,'{}'::jsonb)
    into link_status,link_meta
    from public.bling_hub_entity_links_v2
   where source_system='vitrine_qx' and entity_type='order' and source_id=o.id::text
   limit 1;

  if coalesce(link_status,'')<>'matched' then blockers:=array_append(blockers,'bling_order_not_linked'); end if;

  select coalesce(metadata,'{}'::jsonb)
    into runtime_meta
    from public.bling_hub_runtime_v2
   where id=1;

  if coalesce(runtime_meta->>'ops2_direct_order_state_enabled','false')::boolean
     and coalesce(runtime_meta->>'ops2_live_cutover_at','')<>'' then
    target_verified_id:=coalesce((runtime_meta->'ops2_order_status_mapping'->>'verified_id')::bigint,0);
    if coalesce(link_meta->>'ops2_target_key','')<>'verified'
       or coalesce((link_meta->>'ops2_target_status_id')::bigint,0)<>target_verified_id then
      blockers:=array_append(blockers,'bling_order_not_verified');
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,'order_id',o.id,'order_number',o.order_number,
    'ready',coalesce(array_length(blockers,1),0)=0,'blockers',to_jsonb(blockers),
    'item_sum',item_sum,'fiscal_subtotal',round(coalesce(o.fiscal_subtotal,0)::numeric,2),
    'other_expenses',round(coalesce(o.other_expenses,0)::numeric,2),'discount',round(coalesce(o.discount,0)::numeric,2),
    'canonical_total',round(coalesce(o.total,0)::numeric,2),'recomposed_total',expected_total,
    'basket_hidden_adjustment',round(coalesce(o.basket_hidden_adjustment,0)::numeric,2),
    'separation_v2',v_has_separation,
    'bling_link_status',link_status,'bling_target_key',link_meta->>'ops2_target_key',
    'bling_target_status_id',link_meta->>'ops2_target_status_id'
  );
end;
$$;
