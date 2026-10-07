-- Fix basket-mold duplication in separation and NF-e fiscal preflight.
-- Commercial basket rows remain for commerce/history only.
-- Physical component rows drive separation, customer vitrines and fiscal totals.

CREATE OR REPLACE FUNCTION public.ops2_init_order_separation_v2(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order public.orders%rowtype;
  v_inserted integer:=0;
  v_count integer:=0;
begin
  if p_order_id is null then return jsonb_build_object('ok',false,'error','invalid_order_id'); end if;
  select * into v_order from public.orders where id=p_order_id;
  if not found then return jsonb_build_object('ok',false,'error','order_not_found'); end if;
  if v_order.status not in ('confirmed','processing') then
    return jsonb_build_object('ok',false,'error','order_not_in_separation','status',v_order.status);
  end if;
  if exists(select 1 from public.order_separation_completions_v1 where order_id=p_order_id) then
    select count(*) into v_count
    from public.order_separation_items_v1 s
    join public.order_items oi on oi.id=s.order_item_id
    where s.order_id=p_order_id
      and not (
        coalesce(oi.metadata->>'history_kind','') in ('basket','basket_mold')
        and exists(
          select 1 from public.order_items c
          where c.order_id=p_order_id
            and coalesce(c.metadata->>'history_kind','') in ('basket_component','basket_mold_component')
            and (
              (
                nullif(oi.metadata->>'basket_id','') is not null
                and nullif(c.metadata->>'basket_id','')=nullif(oi.metadata->>'basket_id','')
              )
              or lower(trim(coalesce(nullif(c.metadata->>'basket_name',''),nullif(c.metadata->>'parent_basket_name',''),'')))
                 = lower(trim(coalesce(nullif(oi.metadata->>'basket_name',''),oi.name_snapshot,'')))
            )
        )
      );
    return jsonb_build_object('ok',true,'status','already_completed','item_count',v_count,'order_updated_at',v_order.updated_at);
  end if;

  delete from public.order_separation_items_v1 s
  using public.order_items oi
  where s.order_id=p_order_id
    and s.order_item_id=oi.id
    and oi.order_id=p_order_id
    and coalesce(oi.metadata->>'history_kind','') in ('basket','basket_mold')
    and exists(
      select 1
      from public.order_items c
      where c.order_id=p_order_id
        and coalesce(c.metadata->>'history_kind','') in ('basket_component','basket_mold_component')
        and (
          (
            nullif(oi.metadata->>'basket_id','') is not null
            and nullif(c.metadata->>'basket_id','')=nullif(oi.metadata->>'basket_id','')
          )
          or lower(trim(coalesce(nullif(c.metadata->>'basket_name',''),nullif(c.metadata->>'parent_basket_name',''),'')))
             = lower(trim(coalesce(nullif(oi.metadata->>'basket_name',''),oi.name_snapshot,'')))
        )
    );

  insert into public.order_separation_items_v1(
    order_id,order_item_id,product_id,state,quantity,unit_price,line_total,created_at,updated_at
  )
  select oi.order_id,oi.id,oi.product_id,'pending',oi.quantity,oi.unit_price,oi.line_total,now(),now()
  from public.order_items oi
  where oi.order_id=p_order_id
    and oi.quantity>0
    and not (
      coalesce(oi.metadata->>'history_kind','') in ('basket','basket_mold')
      and exists(
        select 1
        from public.order_items c
        where c.order_id=p_order_id
          and coalesce(c.metadata->>'history_kind','') in ('basket_component','basket_mold_component')
          and (
            (
              nullif(oi.metadata->>'basket_id','') is not null
              and nullif(c.metadata->>'basket_id','')=nullif(oi.metadata->>'basket_id','')
            )
            or lower(trim(coalesce(nullif(c.metadata->>'basket_name',''),nullif(c.metadata->>'parent_basket_name',''),'')))
               = lower(trim(coalesce(nullif(oi.metadata->>'basket_name',''),oi.name_snapshot,'')))
          )
      )
    )
  on conflict (order_id,order_item_id) do update
    set product_id=excluded.product_id,
        quantity=excluded.quantity,
        unit_price=excluded.unit_price,
        line_total=excluded.line_total,
        updated_at=now()
    where public.order_separation_items_v1.state='pending'
      and not exists(
        select 1 from public.order_separation_completions_v1 c
        where c.order_id=public.order_separation_items_v1.order_id
      );

  get diagnostics v_inserted=row_count;
  select count(*) into v_count
  from public.order_separation_items_v1 s
  join public.order_items oi on oi.id=s.order_item_id
  where s.order_id=p_order_id
    and not (
      coalesce(oi.metadata->>'history_kind','') in ('basket','basket_mold')
      and exists(
        select 1 from public.order_items c
        where c.order_id=p_order_id
          and coalesce(c.metadata->>'history_kind','') in ('basket_component','basket_mold_component')
          and (
            (
              nullif(oi.metadata->>'basket_id','') is not null
              and nullif(c.metadata->>'basket_id','')=nullif(oi.metadata->>'basket_id','')
            )
            or lower(trim(coalesce(nullif(c.metadata->>'basket_name',''),nullif(c.metadata->>'parent_basket_name',''),'')))
               = lower(trim(coalesce(nullif(oi.metadata->>'basket_name',''),oi.name_snapshot,'')))
          )
      )
    );
  if v_count=0 and coalesce(jsonb_array_length(coalesce(v_order.checkout_snapshot->'separation_plan','[]'::jsonb)),0)=0 then
    return jsonb_build_object('ok',false,'error','order_has_no_items');
  end if;
  return jsonb_build_object('ok',true,'status','initialized','rows_touched',v_inserted,'item_count',v_count,'order_updated_at',v_order.updated_at);
end;
$function$


CREATE OR REPLACE FUNCTION public.ops2_get_order_separation_v2(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  where s.order_id=p_order_id
    and not (
      coalesce(oi.metadata->>'history_kind','') in ('basket','basket_mold')
      and exists(
        select 1 from public.order_items c
        where c.order_id=p_order_id
          and coalesce(c.metadata->>'history_kind','') in ('basket_component','basket_mold_component')
          and (
            (
              nullif(oi.metadata->>'basket_id','') is not null
              and nullif(c.metadata->>'basket_id','')=nullif(oi.metadata->>'basket_id','')
            )
            or lower(trim(coalesce(nullif(c.metadata->>'basket_name',''),nullif(c.metadata->>'parent_basket_name',''),'')))
               = lower(trim(coalesce(nullif(oi.metadata->>'basket_name',''),oi.name_snapshot,'')))
          )
      )
    );

  select
    count(*) filter(where s.state='pending'),
    count(*) filter(where s.state='separated'),
    count(*) filter(where s.state='missing'),
    round(coalesce(sum(s.line_total) filter(where s.state='missing'),0)::numeric,2)
  into v_pending,v_separated,v_missing,v_live_missing_subtotal
  from public.order_separation_items_v1 s
  join public.order_items oi on oi.id=s.order_item_id
  where s.order_id=p_order_id
    and not (
      coalesce(oi.metadata->>'history_kind','') in ('basket','basket_mold')
      and exists(
        select 1 from public.order_items c
        where c.order_id=p_order_id
          and coalesce(c.metadata->>'history_kind','') in ('basket_component','basket_mold_component')
          and (
            (
              nullif(oi.metadata->>'basket_id','') is not null
              and nullif(c.metadata->>'basket_id','')=nullif(oi.metadata->>'basket_id','')
            )
            or lower(trim(coalesce(nullif(c.metadata->>'basket_name',''),nullif(c.metadata->>'parent_basket_name',''),'')))
               = lower(trim(coalesce(nullif(oi.metadata->>'basket_name',''),oi.name_snapshot,'')))
          )
      )
    );

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
$function$


CREATE OR REPLACE FUNCTION public.ops2_refresh_order_public_snapshot_v1(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  select round(coalesce(sum(s.line_total),0)::numeric,2)
  into v_live_missing_subtotal
  from public.order_separation_items_v1 s
  join public.order_items oi on oi.id=s.order_item_id
  where s.order_id=p_order_id
    and s.state='missing'
    and not (
      coalesce(oi.metadata->>'history_kind','') in ('basket','basket_mold')
      and exists(
        select 1 from public.order_items c
        where c.order_id=p_order_id
          and coalesce(c.metadata->>'history_kind','') in ('basket_component','basket_mold_component')
          and (
            (
              nullif(oi.metadata->>'basket_id','') is not null
              and nullif(c.metadata->>'basket_id','')=nullif(oi.metadata->>'basket_id','')
            )
            or lower(trim(coalesce(nullif(c.metadata->>'basket_name',''),nullif(c.metadata->>'parent_basket_name',''),'')))
               = lower(trim(coalesce(nullif(oi.metadata->>'basket_name',''),oi.name_snapshot,'')))
          )
      )
    );

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
      where x.item->>'type' in ('basket','basket_mold')
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
      where oi.order_id=p_order_id
        and oi.quantity>0
        and not (
          coalesce(oi.metadata->>'history_kind','') in ('basket','basket_mold')
          and exists(
            select 1
            from public.order_items c
            where c.order_id=p_order_id
              and coalesce(c.metadata->>'history_kind','') in ('basket_component','basket_mold_component')
              and (
                (
                  nullif(oi.metadata->>'basket_id','') is not null
                  and nullif(c.metadata->>'basket_id','')=nullif(oi.metadata->>'basket_id','')
                )
                or lower(trim(coalesce(nullif(c.metadata->>'basket_name',''),nullif(c.metadata->>'parent_basket_name',''),'')))
                   = lower(trim(coalesce(nullif(oi.metadata->>'basket_name',''),oi.name_snapshot,'')))
              )
          )
        )
    ),'[]'::jsonb)
  )) into v_snapshot;

  insert into public.order_public_snapshots_v1(order_id,snapshot,refreshed_at)
  values(p_order_id,v_snapshot,now())
  on conflict(order_id) do update
    set snapshot=excluded.snapshot,refreshed_at=now();

  return v_snapshot;
end;
$function$


CREATE OR REPLACE FUNCTION public.ops2_fiscal_dispatch_preflight_v1(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  o public.orders%rowtype;
  s public.order_separation_completions_v1%rowtype;
  readiness jsonb;
  item_sum numeric(14,2):=0;
  expected_total numeric(14,2):=0;
  link_status text;
  link_meta jsonb:='{}'::jsonb;
  runtime_meta jsonb:='{}'::jsonb;
  target_verified_id bigint:=0;
  blockers text[]:='{}';
  v_item_count integer:=0;
  v_pending integer:=0;
begin
  select * into o from public.orders where id=p_order_id;
  if not found then
    return jsonb_build_object('ok',false,'ready',false,'blockers',jsonb_build_array('order_not_found'));
  end if;

  readiness:=public.refresh_order_fiscal_readiness_v1(o.id);
  select * into s from public.order_separation_completions_v1 where order_id=o.id;

  select
    count(*),
    count(*) filter(where si.state='pending'),
    round(coalesce(sum(si.line_total) filter(where si.state='separated'),0)::numeric,2)
  into v_item_count,v_pending,item_sum
  from public.order_separation_items_v1 si
  join public.order_items oi on oi.id=si.order_item_id
  where si.order_id=o.id
    and not (
      coalesce(oi.metadata->>'history_kind','') in ('basket','basket_mold')
      and exists(
        select 1 from public.order_items c
        where c.order_id=o.id
          and coalesce(c.metadata->>'history_kind','') in ('basket_component','basket_mold_component')
          and (
            (
              nullif(oi.metadata->>'basket_id','') is not null
              and nullif(c.metadata->>'basket_id','')=nullif(oi.metadata->>'basket_id','')
            )
            or lower(trim(coalesce(nullif(c.metadata->>'basket_name',''),nullif(c.metadata->>'parent_basket_name',''),'')))
               = lower(trim(coalesce(nullif(oi.metadata->>'basket_name',''),oi.name_snapshot,'')))
          )
      )
    );

  expected_total:=round((coalesce(o.fiscal_subtotal,0)+coalesce(o.other_expenses,0)-coalesce(o.discount,0))::numeric,2);

  if o.status<>'ready' then blockers:=array_append(blockers,'order_not_ready'); end if;
  if s.id is null or s.completed_at is null then blockers:=array_append(blockers,'separation_not_completed'); end if;
  if s.id is not null and coalesce((s.metadata->>'stock_applied')::boolean,false) is not true then blockers:=array_append(blockers,'separation_stock_not_applied'); end if;
  if v_item_count=0 then blockers:=array_append(blockers,'separation_items_missing'); end if;
  if v_pending>0 then blockers:=array_append(blockers,'separation_has_pending_items'); end if;
  if s.id is not null and abs(round(coalesce(s.final_total,0)::numeric,2)-round(coalesce(o.total,0)::numeric,2))>0.01 then blockers:=array_append(blockers,'final_total_mismatch'); end if;
  if abs(item_sum-round(coalesce(o.fiscal_subtotal,0)::numeric,2))>0.01 then blockers:=array_append(blockers,'fiscal_subtotal_item_sum_mismatch'); end if;
  if abs(round(coalesce(o.total,0)::numeric,2)-expected_total)>0.01 then blockers:=array_append(blockers,'canonical_total_not_balanced'); end if;
  if coalesce(o.other_expenses,0)<0 then blockers:=array_append(blockers,'negative_other_expenses'); end if;
  if coalesce(o.discount,0)<0 then blockers:=array_append(blockers,'negative_discount'); end if;
  if coalesce(readiness->>'fiscal_status','blocked')<>'ready' and coalesce(readiness->>'block_reason','')<>'' then
    blockers:=array_append(blockers,coalesce(readiness->>'block_reason','fiscal_not_ready'));
  end if;

  select status,coalesce(metadata,'{}'::jsonb)
    into link_status,link_meta
    from public.bling_hub_entity_links_v2
   where source_system='vitrine_qx' and entity_type='order' and source_id=o.id::text
   limit 1;
  if coalesce(link_status,'')<>'matched' and o.bling_order_id is null then blockers:=array_append(blockers,'bling_order_not_linked'); end if;

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
    'canonical_total',round(coalesce(o.total,0)::numeric,2),'final_total',round(coalesce(s.final_total,o.total,0)::numeric,2),
    'recomposed_total',expected_total,'basket_hidden_adjustment',round(coalesce(o.basket_hidden_adjustment,0)::numeric,2),
    'separation_v4',s.id is not null,'separation_completed_at',s.completed_at,
    'bling_link_status',link_status,'bling_target_key',link_meta->>'ops2_target_key',
    'bling_target_status_id',link_meta->>'ops2_target_status_id','readiness',readiness
  );
end;
$function$



-- Clean only ACTIVE/incomplete separations. Completed history is preserved.
delete from public.order_separation_items_v1 s
using public.order_items oi
where s.order_item_id=oi.id
  and coalesce(oi.metadata->>'history_kind','') in ('basket','basket_mold')
  and not exists(
    select 1 from public.order_separation_completions_v1 c where c.order_id=s.order_id
  )
  and exists(
    select 1
    from public.order_items c
    where c.order_id=s.order_id
      and coalesce(c.metadata->>'history_kind','') in ('basket_component','basket_mold_component')
      and (
        (
          nullif(oi.metadata->>'basket_id','') is not null
          and nullif(c.metadata->>'basket_id','')=nullif(oi.metadata->>'basket_id','')
        )
        or lower(trim(coalesce(nullif(c.metadata->>'basket_name',''),nullif(c.metadata->>'parent_basket_name',''),'')))
           = lower(trim(coalesce(nullif(oi.metadata->>'basket_name',''),oi.name_snapshot,'')))
      )
  );

-- Refresh customer snapshots so commercial basket rows never render as physical products.
do $$
declare
  r record;
begin
  for r in
    select distinct oi.order_id
    from public.order_items oi
    where coalesce(oi.metadata->>'history_kind','') in ('basket','basket_mold')
      and exists(
        select 1
        from public.order_items c
        where c.order_id=oi.order_id
          and coalesce(c.metadata->>'history_kind','') in ('basket_component','basket_mold_component')
      )
  loop
    perform public.ops2_refresh_order_public_snapshot_v1(r.order_id);
  end loop;
end
$$;
