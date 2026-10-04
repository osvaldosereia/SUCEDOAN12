-- Pedidos V3: fluxo operacional Confirmado -> Separado -> Entregue -> Fiscal.
-- Mantém estados técnicos legados para compatibilidade, mas consolida os invariantes novos no banco.

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
begin
  select * into v_order from public.orders where id=p_order_id;
  if not found then return null; end if;

  select * into v_completion
  from public.order_separation_completions_v1
  where order_id=p_order_id;

  select jsonb_strip_nulls(jsonb_build_object(
    'version',3,
    'order_id',v_order.id::text,
    'order_number',v_order.order_number,
    'created_at',v_order.created_at,
    'total',v_order.total,
    'subtotal',v_order.subtotal,
    'original_total',coalesce(v_completion.original_total,v_order.total),
    'missing_subtotal',coalesce(v_completion.missing_subtotal,0),
    'final_total',coalesce(v_completion.final_total,v_order.total),
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

-- O pagamento precisa existir para QUALQUER transição nova para delivered,
-- inclusive o novo caminho ready -> delivered.
create or replace function public.ops_enforce_delivery_payment_before_delivered_v1()
returns trigger
language plpgsql
security invoker
set search_path=public
as $function$
declare
  v_expected bigint;
  v_valid integer:=0;
  v_return_open integer:=0;
begin
  if new.status='delivered' and old.status is distinct from 'delivered' then
    v_expected:=round(coalesce(new.total,0)*100)::bigint;

    select count(*) into v_return_open
    from public.order_delivery_return_cases
    where order_id=new.id and status in ('returning','returned_review');
    if v_return_open>0 then raise exception 'delivery_return_open'; end if;

    select count(*) into v_valid
    from public.order_payment_settlements s
    where s.order_id=new.id
      and s.source='delivery'
      and s.status in ('captured','synced','needs_review')
      and s.expected_total_cents=v_expected
      and s.captured_total_cents=v_expected
      and exists(
        select 1 from public.order_payment_parts p
        where p.settlement_id=s.id
        group by p.settlement_id
        having sum(p.amount_cents)=v_expected
      );

    if v_valid<>1 then raise exception 'delivery_payment_required_before_delivered'; end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_ops_enforce_delivery_payment_before_delivered_v1 on public.orders;
create trigger trg_ops_enforce_delivery_payment_before_delivered_v1
before update of status on public.orders
for each row execute function public.ops_enforce_delivery_payment_before_delivered_v1();

revoke all on function public.ops_enforce_delivery_payment_before_delivered_v1() from public,anon,authenticated;
grant execute on function public.ops_enforce_delivery_payment_before_delivered_v1() to service_role;

-- O lote/cesta pré-montado passa a ser consumido quando a separação realmente
-- conclui em ready. Mantém out_for_delivery apenas como compatibilidade histórica.
create or replace function public.sync_basket_allocations_from_order_status_v1()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  r record;
begin
  if new.status='cancelled' and old.status is distinct from 'cancelled' then
    for r in
      select id,lot_id,quantity from public.basket_stock_allocations
      where order_id=new.id and status='allocated'
      for update
    loop
      update public.basket_stock_allocations
         set status='released',released_at=now()
       where id=r.id;
      update public.basket_stock_lots
         set quantity_available=least(quantity_built,quantity_available+r.quantity),
             status='ready',updated_at=now()
       where id=r.lot_id;
    end loop;
  elsif new.status in ('ready','out_for_delivery')
        and old.status is distinct from new.status then
    update public.basket_stock_allocations
       set status='consumed',consumed_at=coalesce(consumed_at,now())
     where order_id=new.id and status='allocated';
  end if;
  return new;
end;
$function$;

-- Operação única para a entrega: registra o recebimento real e conclui o pedido.
create or replace function public.ops3_complete_delivery_v1(
  p_order_id uuid,
  p_method text,
  p_amount_cents bigint,
  p_operator_label text default null,
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_order public.orders%rowtype;
  v_completion public.order_separation_completions_v1%rowtype;
  v_existing public.order_payment_settlements%rowtype;
  v_existing_method text;
  v_existing_amount bigint;
  v_expected bigint;
  v_method text:=lower(trim(coalesce(p_method,'')));
  v_key text;
  v_settlement_id uuid;
  v_now timestamptz:=now();
begin
  if p_order_id is null then raise exception 'invalid_order'; end if;
  if v_method not in ('pix','cash','credit_card','food_card','meal_card','other') then
    raise exception 'invalid_payment_method';
  end if;

  select * into v_order
  from public.orders
  where id=p_order_id
  for update;
  if not found then raise exception 'order_not_found'; end if;

  v_expected:=round(coalesce(v_order.total,0)*100)::bigint;
  if v_expected<=0 then raise exception 'invalid_order_total'; end if;
  if p_amount_cents is null or p_amount_cents<>v_expected then
    raise exception 'payment_total_mismatch';
  end if;

  select * into v_completion
  from public.order_separation_completions_v1
  where order_id=p_order_id;

  if v_order.status<>'delivered' then
    if v_order.status not in ('ready','out_for_delivery') then
      raise exception 'order_not_ready_for_delivery';
    end if;
    if v_completion.id is null or v_completion.completed_at is null then
      raise exception 'separation_not_completed';
    end if;
  end if;

  select * into v_existing
  from public.order_payment_settlements
  where order_id=p_order_id;

  if found then
    select method,amount_cents
      into v_existing_method,v_existing_amount
    from public.order_payment_parts
    where settlement_id=v_existing.id
    order by sequence
    limit 1;

    if v_existing.status not in ('captured','synced','needs_review')
       or v_existing.expected_total_cents<>v_expected
       or v_existing.captured_total_cents<>v_expected
       or v_existing_method is distinct from v_method
       or v_existing_amount is distinct from v_expected
       or (select count(*) from public.order_payment_parts where settlement_id=v_existing.id)<>1 then
      raise exception 'payment_already_captured';
    end if;
    v_settlement_id:=v_existing.id;
  else
    v_key:=coalesce(nullif(trim(coalesce(p_idempotency_key,'')),''),'delivery-v3:'||p_order_id::text);

    insert into public.order_payment_settlements(
      order_id,status,expected_total_cents,captured_total_cents,planned_method,
      operator_label,source,bling_sync_state,idempotency_key,metadata,captured_at
    ) values(
      p_order_id,'captured',v_expected,v_expected,v_order.payment_method,
      left(nullif(trim(coalesce(p_operator_label,'')),''),80),
      'delivery','blocked_homologation',v_key,
      jsonb_build_object('captured_order_status',v_order.status,'flow','orders_v3'),v_now
    ) returning id into v_settlement_id;

    insert into public.order_payment_parts(settlement_id,sequence,method,amount_cents,detail)
    values(v_settlement_id,1,v_method,v_expected,'{}'::jsonb);
  end if;

  if v_order.status<>'delivered' then
    update public.orders
    set status='delivered',
        delivered_at=coalesce(delivered_at,v_now),
        updated_at=v_now
    where id=p_order_id;
  end if;

  perform public.ops2_refresh_order_public_snapshot_v1(p_order_id);

  begin
    perform public.ops_record_event_v1(
      'order','order.delivered',
      'Entrega e pagamento confirmados.',
      'human','order',p_order_id::text,p_order_id::text,
      null,left(nullif(trim(coalesce(p_operator_label,'')),''),80),
      'dona_antonia','info',
      jsonb_build_object(
        'settlement_id',v_settlement_id,
        'payment_method',v_method,
        'amount_cents',v_expected,
        'flow','orders_v3'
      ),
      null,'order-delivered-v3:'||p_order_id::text,now()
    );
  exception when others then null;
  end;

  return jsonb_build_object(
    'ok',true,
    'order_id',p_order_id,
    'status','delivered',
    'delivered_at',coalesce(v_order.delivered_at,v_now),
    'settlement_id',v_settlement_id,
    'payment_method',v_method,
    'amount_cents',v_expected,
    'already_delivered',v_order.status='delivered'
  );
end;
$function$;

revoke all on function public.ops3_complete_delivery_v1(uuid,text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.ops3_complete_delivery_v1(uuid,text,bigint,text,text) to service_role;


-- Reabertura segura: somente confirmado e antes de qualquer marcação da separação.
create or replace function public.ops3_reopen_order_v1(p_order_id uuid,p_operator_label text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_order public.orders%rowtype;
  v_release jsonb;
  v_started integer:=0;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.status<>'confirmed' then raise exception 'order_not_confirmed'; end if;
  if exists(select 1 from public.order_separation_completions_v1 where order_id=p_order_id) then raise exception 'separation_already_started'; end if;
  select count(*) into v_started from public.order_separation_items_v1 where order_id=p_order_id and state<>'pending';
  if v_started>0 then raise exception 'separation_already_started'; end if;
  v_release:=public.release_vitrine_order_stock_v1(p_order_id);
  if coalesce((v_release->>'ok')::boolean,false) is not true then raise exception 'stock_release_failed'; end if;
  delete from public.order_separation_items_v1 where order_id=p_order_id and state='pending';
  delete from public.order_separation_assignments_v1 where order_id=p_order_id;
  update public.orders set status='storefront_received',confirmed_at=null,updated_at=now() where id=p_order_id;
  perform public.ops2_refresh_order_public_snapshot_v1(p_order_id);
  return jsonb_build_object('ok',true,'order_id',p_order_id,'status','storefront_received','stock_release',v_release);
end;
$function$;
revoke all on function public.ops3_reopen_order_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.ops3_reopen_order_v1(uuid,text) to service_role;
