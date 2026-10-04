-- Pedidos V3 — a conclusão local da separação precisa chegar a READY antes
-- de qualquer tentativa de sincronização do estado Verificado no Bling.
--
-- Esta função permanece idempotente: em retomadas onde stock_applied=true,
-- ela não reaplica reserva/estoque; apenas garante a promoção local pendente.

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
  v_order_status text;
  r record;
  v_deliverable_qty numeric := 0;
begin
  if p_order_id is null then
    return jsonb_build_object('ok',false,'error','invalid_order_id');
  end if;

  select status into v_order_status
  from public.orders
  where id=p_order_id
  for update;

  if not found then
    return jsonb_build_object('ok',false,'error','order_not_found');
  end if;

  select * into v_completion
  from public.order_separation_completions_v1
  where order_id=p_order_id
  for update;

  if not found then
    return jsonb_build_object('ok',false,'error','separation_completion_not_prepared');
  end if;

  -- Retomada idempotente: o estoque já foi aplicado numa tentativa anterior.
  -- Não repete a operação; apenas conclui a transição local que pode ter ficado
  -- pendente antes do gate externo do Bling.
  if coalesce((v_completion.metadata->>'stock_applied')::boolean,false) then
    if v_order_status in ('confirmed','processing') then
      update public.orders
      set status='ready',updated_at=v_now
      where id=p_order_id;
      v_order_status:='ready';
    end if;

    return jsonb_build_object(
      'ok',true,
      'status','already_applied',
      'physical_stock_changed',false,
      'phase',v_completion.phase,
      'local_order_status',v_order_status,
      'metadata',v_completion.metadata
    );
  end if;

  if v_order_status not in ('confirmed','processing','ready') then
    return jsonb_build_object(
      'ok',false,
      'error','order_not_in_separation',
      'status',v_order_status
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

  -- A linha de separação contém a quantidade comercial total. Reservas avulsas
  -- consomem somente o excedente fora de cestas/lotes pré-montados.
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

  -- Fonte da correção: a separação local terminou. O pedido precisa estar READY
  -- antes da chamada externa target_key=verified feita pelo orquestrador.
  if v_order_status in ('confirmed','processing') then
    update public.orders
    set status='ready',updated_at=v_now
    where id=p_order_id;
    v_order_status:='ready';
  end if;

  return jsonb_build_object(
    'ok',true,
    'status','stock_applied',
    'stock_authority',v_authority,
    'physical_stock_changed',false,
    'local_order_status',v_order_status,
    'missing_components',v_missing_components
  );
end;
$function$;
