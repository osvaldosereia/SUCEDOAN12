-- Dona Antonia Operations 2.0
-- Failed delivery / physical return flow.
-- Keeps goods allocated until the physical return is confirmed.

create table if not exists public.order_delivery_return_cases (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  attempt_number integer not null check (attempt_number>=1),
  reason_code text not null
    check (reason_code in ('customer_absent','address_not_found','reschedule','payment_failed','customer_refused','vehicle_route','other')),
  reason_label text not null,
  note text,
  status text not null default 'returning'
    check (status in ('returning','returned_redelivery','returned_review','closed')),
  recommended_disposition text not null
    check (recommended_disposition in ('redelivery','review')),
  final_disposition text
    check (final_disposition is null or final_disposition in ('redelivery','review','cancelled','other')),
  failed_at timestamptz not null default now(),
  failed_by text,
  returned_at timestamptz,
  returned_by text,
  closed_at timestamptz,
  resolution text,
  resolution_ref text,
  idempotency_key text unique,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists order_delivery_return_cases_order_idx
  on public.order_delivery_return_cases(order_id,failed_at desc);

create unique index if not exists order_delivery_return_cases_one_active_uidx
  on public.order_delivery_return_cases(order_id)
  where status in ('returning','returned_review');

alter table public.order_delivery_return_cases enable row level security;

create or replace function public.ops_register_failed_delivery_v1(
  p_order_id uuid,
  p_reason_code text,
  p_note text default null,
  p_operator_label text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_order public.orders%rowtype;
  v_code text:=lower(trim(coalesce(p_reason_code,'')));
  v_label text;
  v_recommended text;
  v_attempt integer;
  v_case_id uuid;
  v_existing uuid;
  v_payment_count integer;
begin
  select * into v_order
  from public.orders
  where id=p_order_id
  for update;

  if not found then raise exception 'order_not_found'; end if;
  if v_order.status<>'out_for_delivery' then raise exception 'order_not_in_delivery'; end if;

  select count(*) into v_payment_count
  from public.order_payment_settlements
  where order_id=p_order_id and status in ('captured','synced','needs_review');

  if v_payment_count>0 then
    raise exception 'payment_already_captured';
  end if;

  select id into v_existing
  from public.order_delivery_return_cases
  where order_id=p_order_id
    and status in ('returning','returned_review')
  limit 1;

  if v_existing is not null then
    return jsonb_build_object(
      'case_id',v_existing,
      'order_id',p_order_id,
      'already_open',true
    );
  end if;

  v_label:=case v_code
    when 'customer_absent' then 'Cliente ausente'
    when 'address_not_found' then 'Endereço não encontrado'
    when 'reschedule' then 'Cliente pediu reagendamento'
    when 'payment_failed' then 'Problema no pagamento'
    when 'customer_refused' then 'Cliente recusou/desistiu'
    when 'vehicle_route' then 'Veículo / rota'
    when 'other' then 'Outro'
    else null
  end;

  if v_label is null then raise exception 'invalid_delivery_failure_reason'; end if;

  v_recommended:=case
    when v_code in ('payment_failed','customer_refused','other') then 'review'
    else 'redelivery'
  end;

  select coalesce(max(attempt_number),0)+1 into v_attempt
  from public.order_delivery_return_cases
  where order_id=p_order_id;

  insert into public.order_delivery_return_cases(
    order_id,attempt_number,reason_code,reason_label,note,status,
    recommended_disposition,failed_by,idempotency_key,metadata
  ) values (
    p_order_id,v_attempt,v_code,v_label,
    left(nullif(trim(coalesce(p_note,'')),''),500),
    'returning',v_recommended,
    left(nullif(trim(coalesce(p_operator_label,'')),''),80),
    'delivery-return:'||p_order_id::text||':'||v_attempt::text,
    jsonb_build_object(
      'stock_already_consumed',true,
      'return_stock_to_general_automatically',false
    )
  )
  returning id into v_case_id;

  perform public.ops_record_event_v1(
    'delivery','delivery.failed',
    'Entrega não concluída: '||v_label||'.',
    'human','order',p_order_id::text,p_order_id::text,
    null,left(nullif(trim(coalesce(p_operator_label,'')),''),80),
    'dona_antonia','warning',
    jsonb_build_object(
      'case_id',v_case_id,
      'attempt_number',v_attempt,
      'reason_code',v_code,
      'recommended_disposition',v_recommended,
      'stock_stays_consumed',true
    ),
    null,'delivery-failed:'||v_case_id::text,now()
  );

  return jsonb_build_object(
    'case_id',v_case_id,
    'order_id',p_order_id,
    'attempt_number',v_attempt,
    'reason_code',v_code,
    'reason_label',v_label,
    'status','returning',
    'recommended_disposition',v_recommended,
    'already_open',false
  );
end;
$$;

create or replace function public.ops_confirm_delivery_return_v1(
  p_case_id uuid,
  p_disposition text,
  p_operator_label text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_case public.order_delivery_return_cases%rowtype;
  v_order public.orders%rowtype;
  v_disp text:=lower(trim(coalesce(p_disposition,'')));
  v_attention_id uuid;
begin
  select * into v_case
  from public.order_delivery_return_cases
  where id=p_case_id
  for update;

  if not found then raise exception 'delivery_return_case_not_found'; end if;

  if v_case.status<>'returning' then
    return jsonb_build_object(
      'case_id',v_case.id,
      'order_id',v_case.order_id,
      'status',v_case.status,
      'already_returned',true
    );
  end if;

  if v_disp not in ('redelivery','review') then
    raise exception 'invalid_return_disposition';
  end if;

  select * into v_order
  from public.orders
  where id=v_case.order_id
  for update;

  if not found then raise exception 'order_not_found'; end if;
  if v_order.status<>'out_for_delivery' then raise exception 'order_not_in_delivery'; end if;

  if v_disp='redelivery' then
    update public.order_delivery_return_cases
       set status='returned_redelivery',
           final_disposition='redelivery',
           returned_at=now(),
           returned_by=left(nullif(trim(coalesce(p_operator_label,'')),''),80),
           closed_at=now(),
           resolution='Mercadoria retornou e permanece alocada ao pedido para reentrega.'
     where id=v_case.id;

    update public.orders
       set status='ready',
           updated_at=now()
     where id=v_case.order_id;

    perform public.ops_record_event_v1(
      'delivery','delivery.returned_for_redelivery',
      'Mercadoria retornou ao depósito e o pedido ficou pronto para reentrega.',
      'human','order',v_case.order_id::text,v_case.order_id::text,
      null,left(nullif(trim(coalesce(p_operator_label,'')),''),80),
      'dona_antonia','info',
      jsonb_build_object(
        'case_id',v_case.id,
        'attempt_number',v_case.attempt_number,
        'stock_restored',false,
        'stock_remains_allocated',true
      ),
      null,'delivery-returned-redelivery:'||v_case.id::text,now()
    );

    return jsonb_build_object(
      'case_id',v_case.id,
      'order_id',v_case.order_id,
      'status','returned_redelivery',
      'order_status','ready',
      'dispatch_blocked',false
    );
  end if;

  update public.order_delivery_return_cases
     set status='returned_review',
         final_disposition='review',
         returned_at=now(),
         returned_by=left(nullif(trim(coalesce(p_operator_label,'')),''),80),
         resolution='Mercadoria retornou e aguarda inspeção / decisão comercial-fiscal.'
   where id=v_case.id;

  update public.orders
     set status='ready',
         updated_at=now()
   where id=v_case.order_id;

  v_attention_id:=public.ops_open_attention_v1(
    'delivery_return_review',
    'Retorno de entrega precisa de revisão antes de nova saída.',
    'order',v_case.order_id::text,v_case.order_id::text,
    'high','supervisor',
    'Inspecionar a mercadoria. Não reenviar nem devolver ao estoque geral antes de resolver o retorno.',
    jsonb_build_object(
      'case_id',v_case.id,
      'attempt_number',v_case.attempt_number,
      'reason_code',v_case.reason_code,
      'reason_label',v_case.reason_label,
      'stock_restored',false
    ),
    'dona_antonia',
    'delivery-return-review:'||v_case.id::text,
    null
  );

  perform public.ops_record_event_v1(
    'delivery','delivery.returned_for_review',
    'Mercadoria retornou e ficou bloqueada para revisão.',
    'human','order',v_case.order_id::text,v_case.order_id::text,
    null,left(nullif(trim(coalesce(p_operator_label,'')),''),80),
    'dona_antonia','warning',
    jsonb_build_object(
      'case_id',v_case.id,
      'attempt_number',v_case.attempt_number,
      'attention_id',v_attention_id,
      'stock_restored',false,
      'dispatch_blocked',true
    ),
    null,'delivery-returned-review:'||v_case.id::text,now()
  );

  return jsonb_build_object(
    'case_id',v_case.id,
    'order_id',v_case.order_id,
    'status','returned_review',
    'order_status','ready',
    'dispatch_blocked',true,
    'attention_id',v_attention_id
  );
end;
$$;

create or replace function public.get_ops_delivery_returns_summary_v1(p_limit integer default 50)
returns jsonb
language sql
security definer
set search_path=public
stable
as $$
  select jsonb_build_object(
    'returning',count(*) filter (where status='returning'),
    'review',count(*) filter (where status='returned_review'),
    'cases',coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',id,'order_id',order_id,'attempt_number',attempt_number,
          'reason_code',reason_code,'reason_label',reason_label,'note',note,
          'status',status,'recommended_disposition',recommended_disposition,
          'final_disposition',final_disposition,'failed_at',failed_at,
          'returned_at',returned_at,'failed_by',failed_by,'returned_by',returned_by,
          'dispatch_blocked',(status='returned_review')
        ) order by failed_at desc
      ) filter (where rn<=greatest(1,least(100,coalesce(p_limit,50)))),
      '[]'::jsonb
    )
  )
  from (
    select c.*,row_number() over(order by failed_at desc) rn
    from public.order_delivery_return_cases c
    where status in ('returning','returned_review')
  ) x;
$$;

revoke all on function public.ops_register_failed_delivery_v1(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.ops_confirm_delivery_return_v1(uuid,text,text) from public,anon,authenticated;
revoke all on function public.get_ops_delivery_returns_summary_v1(integer) from public,anon,authenticated;

grant execute on function public.ops_register_failed_delivery_v1(uuid,text,text,text) to service_role;
grant execute on function public.ops_confirm_delivery_return_v1(uuid,text,text) to service_role;
grant execute on function public.get_ops_delivery_returns_summary_v1(integer) to service_role;

create or replace function public.get_ops_control_tower_summary_v1()
returns jsonb
language sql
security definer
set search_path=public
stable
as $$
  select jsonb_build_object(
    'generated_at', now(),
    'orders', jsonb_build_object(
      'awaiting', (select count(*) from public.orders where status='storefront_received'),
      'confirmed', (select count(*) from public.orders where status='confirmed'),
      'ready', (select count(*) from public.orders where status='ready'),
      'delivered', (select count(*) from public.orders where status='delivered'),
      'cancelled', (select count(*) from public.orders where status='cancelled')
    ),
    'delivery', jsonb_build_object(
      'returning', (select count(*) from public.order_delivery_return_cases where status='returning'),
      'return_review', (select count(*) from public.order_delivery_return_cases where status='returned_review')
    ),
    'whatsapp', jsonb_build_object(
      'human_required', (select count(*) from public.conversations where channel='whatsapp' and human_required=true),
      'human_mode', (select count(*) from public.conversations where channel='whatsapp' and mode='human')
    ),
    'inventory', jsonb_build_object(
      'active_products', (select count(*) from public.products where is_active=true),
      'zero_or_negative', (select count(*) from public.products where is_active=true and coalesce(stock,0)<=0),
      'expires_90d', (select count(*) from public.products where is_active=true and validity_date is not null and validity_date between current_date and current_date+90),
      'expired', (select count(*) from public.products where is_active=true and validity_date is not null and validity_date<current_date),
      'count_differences_pending', (select count(*) from public.ops_inventory_counts where reconciliation_state='pending_erp_reconciliation'),
      'incidents_open', (select count(*) from public.ops_inventory_incidents where status in ('open','review'))
    ),
    'payments', jsonb_build_object(
      'captured_unsynced', (select count(*) from public.order_payment_settlements where status in ('captured','needs_review') and bling_sync_state in ('blocked_homologation','pending','failed')),
      'sync_failed', (select count(*) from public.order_payment_settlements where status in ('captured','needs_review') and bling_sync_state='failed')
    ),
    'attention', jsonb_build_object(
      'open', (select count(*) from public.ops_attention where status in ('open','acknowledged')),
      'critical', (select count(*) from public.ops_attention where status in ('open','acknowledged') and priority='critical'),
      'high', (select count(*) from public.ops_attention where status in ('open','acknowledged') and priority='high')
    ),
    'approvals', jsonb_build_object(
      'pending', (select count(*) from public.ops_approvals where status='pending')
    ),
    'printing', jsonb_build_object(
      'pending', (select count(*) from public.ops_print_jobs where status='pending'),
      'failed', (select count(*) from public.ops_print_jobs where status='failed'),
      'claimed', (select count(*) from public.ops_print_jobs where status='claimed'),
      'presented', (select count(*) from public.ops_print_jobs where status='presented'),
      'printed', (select count(*) from public.ops_print_jobs where status='printed')
    )
  );
$$;
