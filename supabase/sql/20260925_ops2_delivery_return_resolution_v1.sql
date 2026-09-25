-- Dona Antonia Operations 2.0
-- Resolve returned-delivery review only for two safe whole-order cases:
-- redelivery or cancellation after confirming all goods are physically intact.

create or replace function public.ops_resolve_delivery_return_review_v1(
  p_case_id uuid,
  p_action text,
  p_operator_label text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_case public.order_delivery_return_cases%rowtype;
  v_order public.orders%rowtype;
  v_action text:=lower(trim(coalesce(p_action,'')));
  v_payment_count integer;
  v_release jsonb;
  v_attention uuid;
  v_fiscal_attention uuid;
begin
  if v_action not in ('redelivery','cancel_intact') then
    raise exception 'invalid_return_review_action';
  end if;

  select * into v_case
  from public.order_delivery_return_cases
  where id=p_case_id
  for update;

  if not found then raise exception 'delivery_return_case_not_found'; end if;

  if v_case.status<>'returned_review' then
    raise exception 'delivery_return_not_in_review';
  end if;

  select * into v_order
  from public.orders
  where id=v_case.order_id
  for update;

  if not found then raise exception 'order_not_found'; end if;
  if v_order.status<>'ready' then raise exception 'order_not_ready_for_return_resolution'; end if;

  select count(*) into v_payment_count
  from public.order_payment_settlements
  where order_id=v_case.order_id
    and status in ('captured','synced','needs_review');

  if v_payment_count>0 then
    raise exception 'return_has_captured_payment';
  end if;

  if v_action='redelivery' then
    update public.order_delivery_return_cases
       set status='closed',
           final_disposition='redelivery',
           closed_at=now(),
           returned_by=coalesce(returned_by,left(nullif(trim(coalesce(p_operator_label,'')),''),80)),
           resolution='Retorno revisado e liberado para nova tentativa de entrega.'
     where id=v_case.id;

    select id into v_attention
    from public.ops_attention
    where idempotency_key='delivery-return-review:'||v_case.id::text
      and status in ('open','acknowledged')
    limit 1;

    if v_attention is not null then
      perform public.ops_resolve_attention_v1(
        v_attention,
        'Mercadoria revisada e liberada para reentrega.',
        'delivery-return:'||v_case.id::text
      );
    end if;

    perform public.ops_record_event_v1(
      'delivery','delivery.return_review_resolved_redelivery',
      'Retorno revisado e liberado para reentrega.',
      'human','order',v_case.order_id::text,v_case.order_id::text,
      null,left(nullif(trim(coalesce(p_operator_label,'')),''),80),
      'dona_antonia','info',
      jsonb_build_object('case_id',v_case.id,'stock_restored',false,'order_status','ready'),
      null,'delivery-return-review-redelivery:'||v_case.id::text,now()
    );

    return jsonb_build_object(
      'case_id',v_case.id,
      'order_id',v_case.order_id,
      'action','redelivery',
      'order_status','ready',
      'stock_restored',false
    );
  end if;

  -- cancel_intact is allowed only after the operator confirms that ALL goods
  -- physically returned intact. The legacy local-stock release is therefore safe.
  v_release:=public.release_vitrine_order_stock_v1(v_case.order_id);

  if coalesce((v_release->>'ok')::boolean,false) is not true then
    raise exception 'stock_restore_failed';
  end if;

  update public.orders
     set status='cancelled',
         cancelled_at=coalesce(cancelled_at,now()),
         updated_at=now()
   where id=v_case.order_id;

  update public.order_delivery_return_cases
     set status='closed',
         final_disposition='cancelled',
         closed_at=now(),
         resolution='Cliente desistiu/recusou; mercadoria retornou íntegra e estoque local foi restaurado.'
   where id=v_case.id;

  select id into v_attention
  from public.ops_attention
  where idempotency_key='delivery-return-review:'||v_case.id::text
    and status in ('open','acknowledged')
  limit 1;

  if v_attention is not null then
    perform public.ops_resolve_attention_v1(
      v_attention,
      'Retorno íntegro confirmado; pedido cancelado comercialmente e estoque local restaurado.',
      'delivery-return:'||v_case.id::text
    );
  end if;

  v_fiscal_attention:=public.ops_open_attention_v1(
    'delivery_return_fiscal_review',
    'Pedido cancelado após sair para entrega: revisar retorno fiscal no Bling.',
    'order',v_case.order_id::text,v_case.order_id::text,
    'high','owner',
    'Verificar se houve NF-e autorizada. Se houve, tratar retorno/devolução fiscal; não apagar a venda original.',
    jsonb_build_object(
      'case_id',v_case.id,
      'reason_code',v_case.reason_code,
      'stock_restored_local',coalesce((v_release->>'restored_physical_stock')::boolean,false),
      'automatic_fiscal_action',false
    ),
    'dona_antonia',
    'delivery-return-fiscal-review:'||v_case.id::text,
    null
  );

  perform public.ops_record_event_v1(
    'delivery','delivery.return_review_cancelled_intact',
    'Retorno íntegro confirmado; pedido cancelado e estoque local restaurado.',
    'human','order',v_case.order_id::text,v_case.order_id::text,
    null,left(nullif(trim(coalesce(p_operator_label,'')),''),80),
    'dona_antonia','warning',
    jsonb_build_object(
      'case_id',v_case.id,
      'stock_release',v_release,
      'fiscal_attention_id',v_fiscal_attention,
      'automatic_fiscal_action',false
    ),
    null,'delivery-return-cancel-intact:'||v_case.id::text,now()
  );

  return jsonb_build_object(
    'case_id',v_case.id,
    'order_id',v_case.order_id,
    'action','cancel_intact',
    'order_status','cancelled',
    'stock_restored',coalesce((v_release->>'restored_physical_stock')::boolean,false),
    'fiscal_review_required',true,
    'fiscal_attention_id',v_fiscal_attention
  );
end;
$$;

revoke all on function public.ops_resolve_delivery_return_review_v1(uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.ops_resolve_delivery_return_review_v1(uuid,text,text)
  to service_role;
