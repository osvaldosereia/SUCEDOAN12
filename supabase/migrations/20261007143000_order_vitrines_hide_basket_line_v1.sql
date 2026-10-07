-- Evita que a linha comercial da cesta apareça como produto nas vitrines.
-- Mantém a cesta como agrupador comercial, mas a separação e o snapshot público exibem
-- somente os componentes físicos quando eles existem.

create or replace function public.ops2_init_order_separation_v2(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
    select count(*) into v_count from public.order_separation_items_v1 where order_id=p_order_id;
    return jsonb_build_object('ok',true,'status','already_completed','item_count',v_count,'order_updated_at',v_order.updated_at);
  end if;

  -- Remove linhas comerciais da cesta já inicializadas quando os componentes reais existem.
  delete from public.order_separation_items_v1 s
  using public.order_items oi
  where s.order_id=p_order_id
    and s.order_item_id=oi.id
    and oi.order_id=p_order_id
    and coalesce(oi.metadata->>'history_kind','')='basket'
    and exists(
      select 1
      from public.order_items c
      where c.order_id=p_order_id
        and coalesce(c.metadata->>'history_kind','')='basket_component'
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
      coalesce(oi.metadata->>'history_kind','')='basket'
      and exists(
        select 1
        from public.order_items c
        where c.order_id=p_order_id
          and coalesce(c.metadata->>'history_kind','')='basket_component'
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
  select count(*) into v_count from public.order_separation_items_v1 where order_id=p_order_id;
  if v_count=0 and coalesce(jsonb_array_length(coalesce(v_order.checkout_snapshot->'separation_plan','[]'::jsonb)),0)=0 then
    return jsonb_build_object('ok',false,'error','order_has_no_items');
  end if;
  return jsonb_build_object('ok',true,'status','initialized','rows_touched',v_inserted,'item_count',v_count,'order_updated_at',v_order.updated_at);
end;
$function$;

create or replace function public.ops2_refresh_order_public_snapshot_v1(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
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
      where oi.order_id=p_order_id
        and oi.quantity>0
        and not (
          coalesce(oi.metadata->>'history_kind','')='basket'
          and exists(
            select 1
            from public.order_items c
            where c.order_id=p_order_id
              and coalesce(c.metadata->>'history_kind','')='basket_component'
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
$function$;

-- Limpa duplicatas apenas de separações ainda não concluídas.
delete from public.order_separation_items_v1 s
using public.order_items oi
where s.order_item_id=oi.id
  and coalesce(oi.metadata->>'history_kind','')='basket'
  and not exists(
    select 1 from public.order_separation_completions_v1 c where c.order_id=s.order_id
  )
  and exists(
    select 1
    from public.order_items c
    where c.order_id=s.order_id
      and coalesce(c.metadata->>'history_kind','')='basket_component'
      and (
        (
          nullif(oi.metadata->>'basket_id','') is not null
          and nullif(c.metadata->>'basket_id','')=nullif(oi.metadata->>'basket_id','')
        )
        or lower(trim(coalesce(nullif(c.metadata->>'basket_name',''),nullif(c.metadata->>'parent_basket_name',''),'')))
           = lower(trim(coalesce(nullif(oi.metadata->>'basket_name',''),oi.name_snapshot,'')))
      )
  );

-- Regenera snapshots dos pedidos que possuem cesta + componentes.
do $$
declare
  r record;
begin
  for r in
    select distinct oi.order_id
    from public.order_items oi
    where coalesce(oi.metadata->>'history_kind','')='basket'
      and exists(
        select 1
        from public.order_items c
        where c.order_id=oi.order_id
          and coalesce(c.metadata->>'history_kind','')='basket_component'
      )
  loop
    perform public.ops2_refresh_order_public_snapshot_v1(r.order_id);
  end loop;
end
$$;
