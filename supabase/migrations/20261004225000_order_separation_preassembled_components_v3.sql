-- Pedidos V3 — cestas pré-montadas também precisam passar pela conferência item a item.
--
-- Regra:
-- 1. A tela de separação mostra a quantidade comercial COMPLETA do item, inclusive
--    componentes já pertencentes a um lote/cesta pré-montado. Isso permite marcar
--    SEPARADO/FALTOU e calcular corretamente o abatimento ao cliente.
-- 2. A baixa das reservas AVULSAS continua considerando apenas a quantidade que
--    excede `preassembled_units`, evitando dupla baixa do estoque já imobilizado no lote.

create or replace function public.ops2_init_order_separation_v2(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_order public.orders%rowtype;
  v_inserted integer:=0;
  v_count integer:=0;
begin
  if p_order_id is null then
    return jsonb_build_object('ok',false,'error','invalid_order_id');
  end if;

  select * into v_order
  from public.orders
  where id=p_order_id;

  if not found then
    return jsonb_build_object('ok',false,'error','order_not_found');
  end if;

  if v_order.status not in ('confirmed','processing') then
    return jsonb_build_object('ok',false,'error','order_not_in_separation','status',v_order.status);
  end if;

  if exists(
    select 1
    from public.order_separation_completions_v1
    where order_id=p_order_id
  ) then
    select count(*) into v_count
    from public.order_separation_items_v1
    where order_id=p_order_id;

    return jsonb_build_object(
      'ok',true,
      'status','already_completed',
      'item_count',v_count,
      'order_updated_at',v_order.updated_at
    );
  end if;

  -- A separação é uma conferência comercial/física de TODOS os itens que irão
  -- ao cliente. `preassembled_units` não deve esconder componentes da tela.
  insert into public.order_separation_items_v1(
    order_id,
    order_item_id,
    product_id,
    state,
    quantity,
    unit_price,
    line_total,
    created_at,
    updated_at
  )
  select
    oi.order_id,
    oi.id,
    oi.product_id,
    'pending',
    oi.quantity,
    oi.unit_price,
    oi.line_total,
    now(),
    now()
  from public.order_items oi
  where oi.order_id=p_order_id
    and oi.quantity>0
  on conflict (order_id,order_item_id) do update
    set product_id=excluded.product_id,
        quantity=excluded.quantity,
        unit_price=excluded.unit_price,
        line_total=excluded.line_total,
        updated_at=now()
    where public.order_separation_items_v1.state='pending'
      and not exists(
        select 1
        from public.order_separation_completions_v1 c
        where c.order_id=public.order_separation_items_v1.order_id
      );

  get diagnostics v_inserted=row_count;

  select count(*) into v_count
  from public.order_separation_items_v1
  where order_id=p_order_id;

  if v_count=0
     and coalesce(jsonb_array_length(coalesce(v_order.checkout_snapshot->'separation_plan','[]'::jsonb)),0)=0 then
    return jsonb_build_object('ok',false,'error','order_has_no_items');
  end if;

  return jsonb_build_object(
    'ok',true,
    'status','initialized',
    'rows_touched',v_inserted,
    'item_count',v_count,
    'order_updated_at',v_order.updated_at
  );
end;
$function$;

create or replace function public.ops2_apply_order_separation_stock_v2(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
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
      'ok',true,
      'status','already_applied',
      'physical_stock_changed',false,
      'phase',v_completion.phase,
      'metadata',v_completion.metadata
    );
  end if;

  select coalesce(metadata->>'ops2_stock_authority','legacy_shadow')
  into v_authority
  from public.bling_hub_runtime_v2
  where id=1;

  if coalesce(v_authority,'legacy_shadow')<>'bling' then
    return jsonb_build_object(
      'ok',false,
      'error','separation_requires_bling_stock_authority',
      'stock_authority',v_authority
    );
  end if;

  -- A linha de separação contém a quantidade comercial total para permitir
  -- conferência/FALTOU. Para reservas avulsas, descontamos a parte que já está
  -- imobilizada em cesta/lote pré-montado. Assim uma cesta + 1 extra gera baixa
  -- apenas do extra, e uma cesta sem extra não cria baixa avulsa duplicada.
  for r in
    select
      vr.id,
      vr.product_id,
      vr.quantity,
      coalesce(d.deliverable_loose_qty,0) as deliverable_qty
    from public.vitrine_stock_reservations vr
    left join (
      select
        s.product_id,
        sum(
          case
            when coalesce(oi.metadata->>'history_kind','')='basket_component'
              then greatest(
                0,
                s.quantity - coalesce(nullif(oi.metadata->>'preassembled_units','')::numeric,0)
              )
            else s.quantity
          end
        )::numeric as deliverable_loose_qty
      from public.order_separation_items_v1 s
      join public.order_items oi on oi.id=s.order_item_id
      where s.order_id=p_order_id
        and s.state='separated'
        and s.product_id is not null
      group by s.product_id
    ) d on d.product_id=vr.product_id
    where vr.order_id=p_order_id
    order by vr.product_id
    for update of vr
  loop
    v_deliverable_qty:=coalesce(r.deliverable_qty,0);

    if v_deliverable_qty<=0 then
      update public.vitrine_stock_reservations
      set status='released',
          released_at=v_now,
          consumed_at=null,
          updated_at=v_now
      where id=r.id;
    else
      update public.vitrine_stock_reservations
      set quantity=v_deliverable_qty,
          status='consumed',
          consumed_at=v_now,
          released_at=null,
          updated_at=v_now
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
  where s.order_id=p_order_id
    and s.state='missing';

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
$function$;
