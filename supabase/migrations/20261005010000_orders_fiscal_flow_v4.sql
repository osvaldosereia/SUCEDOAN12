-- Pedidos V4 — Fiscal antes da saída, pagamento real na entrega.
-- Fluxo canônico: ready/SEPARADO -> NF-e autorizada -> out_for_delivery -> delivered + settlement.
-- Não habilita emissão fiscal automaticamente; apenas corrige os invariantes do banco.

alter table public.order_fiscal_controls
  add column if not exists dispatch_started_at timestamptz,
  add column if not exists dispatch_started_by text,
  add column if not exists dispatch_idempotency_key text;

create or replace function public.refresh_order_fiscal_readiness_v1(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  o public.orders%rowtype;
  c public.order_fiscal_controls%rowtype;
  s public.order_separation_completions_v1%rowtype;
  v_items integer:=0;
  v_pending integer:=0;
  v_linked boolean:=false;
  next_status text:='blocked';
  reason text:=null;
  ready_at timestamptz:=null;
begin
  select * into o from public.orders where id=p_order_id;
  if not found then
    return jsonb_build_object('ok',false,'error','order_not_found','external_side_effect',false);
  end if;

  insert into public.order_fiscal_controls(order_id)
  values(o.id)
  on conflict(order_id) do nothing;

  select * into c from public.order_fiscal_controls where order_id=o.id for update;
  select * into s from public.order_separation_completions_v1 where order_id=o.id;
  select count(*),count(*) filter(where state='pending')
    into v_items,v_pending
    from public.order_separation_items_v1
   where order_id=o.id;
  select exists(
    select 1 from public.bling_hub_entity_links_v2 l
     where l.source_system='vitrine_qx'
       and l.entity_type='order'
       and l.source_id=o.id::text
       and l.status='matched'
  ) into v_linked;
  v_linked:=v_linked or o.bling_order_id is not null;

  if o.status='cancelled' then
    next_status:='cancelled'; reason:='order_cancelled';
  elsif o.status='returned' then
    next_status:='blocked'; reason:='order_returned';
  elsif o.status in ('out_for_delivery','delivered') then
    if c.dispatch_fiscal_status in ('authorized','not_required') then
      next_status:='ready'; reason:=null; ready_at:=coalesce(c.fiscal_ready_at,c.dispatch_fiscal_authorized_at,now());
    else
      next_status:='blocked'; reason:='fiscal_authorization_missing_legacy_state';
    end if;
  elsif o.status<>'ready' then
    next_status:='blocked'; reason:='separation_not_completed';
  elsif s.id is null or s.completed_at is null then
    next_status:='blocked'; reason:='separation_not_completed';
  elsif coalesce((s.metadata->>'stock_applied')::boolean,false) is not true then
    next_status:='blocked'; reason:='separation_stock_not_applied';
  elsif v_items=0 then
    next_status:='blocked'; reason:='separation_items_missing';
  elsif v_pending>0 then
    next_status:='blocked'; reason:='separation_has_pending_items';
  elsif coalesce(s.final_total,0)<=0 or coalesce(o.total,0)<=0 then
    next_status:='blocked'; reason:='invalid_final_total';
  elsif abs(coalesce(s.final_total,0)-coalesce(o.total,0))>0.01 then
    next_status:='review_required'; reason:='final_total_mismatch';
  elsif o.customer_id is null then
    next_status:='blocked'; reason:='customer_missing';
  elsif coalesce(nullif(trim(o.delivery_address->>'street'),''),'')=''
     or coalesce(nullif(trim(o.delivery_address->>'city'),''),'')=''
     or coalesce(nullif(trim(o.delivery_address->>'state'),''),'')='' then
    next_status:='blocked'; reason:='delivery_address_incomplete';
  elsif not v_linked then
    next_status:='blocked'; reason:='bling_order_not_linked';
  else
    next_status:='ready'; reason:=null; ready_at:=coalesce(c.fiscal_ready_at,now());
  end if;

  update public.order_fiscal_controls
     set fiscal_status=next_status,
         fiscal_block_reason=reason,
         fiscal_ready_at=case when next_status='ready' then ready_at else null end,
         fiscal_version=4,
         updated_at=now()
   where order_id=o.id;

  return jsonb_build_object(
    'ok',true,
    'order_id',o.id,
    'order_status',o.status,
    'fiscal_status',next_status,
    'block_reason',reason,
    'fiscal_ready_at',case when next_status='ready' then ready_at else null end,
    'separation_completed',s.id is not null and s.completed_at is not null,
    'stock_applied',coalesce((s.metadata->>'stock_applied')::boolean,false),
    'pending_items',v_pending,
    'final_total',coalesce(s.final_total,o.total),
    'bling_order_linked',v_linked,
    'payment_status',c.payment_status,
    'payment_required_for_invoice',false,
    'external_side_effect',false
  );
end;
$function$;

create or replace function public.preview_bling_invoice_eligibility_v1(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  o public.orders%rowtype;
  c public.order_fiscal_controls%rowtype;
  r jsonb;
  v_reconcile_only boolean:=false;
begin
  select * into o from public.orders where id=p_order_id;
  if not found then
    return jsonb_build_object('ok',false,'eligible',false,'error','order_not_found','external_side_effect',false);
  end if;

  r:=public.refresh_order_fiscal_readiness_v1(o.id);
  select * into c from public.order_fiscal_controls where order_id=o.id;
  v_reconcile_only:=o.status in ('out_for_delivery','delivered') or c.dispatch_fiscal_status in ('authorized','not_required');

  return jsonb_build_object(
    'ok',true,
    'eligible',(o.status='ready' and c.fiscal_status='ready'),
    'reconcile_only',v_reconcile_only,
    'reason',c.fiscal_block_reason,
    'order_status',o.status,
    'payment_status',c.payment_status,
    'fiscal_status',c.fiscal_status,
    'fiscal_version',c.fiscal_version,
    'dispatch_fiscal_status',c.dispatch_fiscal_status,
    'bling_invoice_id',c.bling_invoice_id,
    'bling_invoice_number',c.bling_invoice_number,
    'readiness',r,
    'external_side_effect',false
  );
end;
$function$;

create or replace function public.ops2_fiscal_dispatch_preflight_v1(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
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
  select count(*),count(*) filter(where state='pending'),round(coalesce(sum(line_total) filter(where state='separated'),0)::numeric,2)
    into v_item_count,v_pending,item_sum
    from public.order_separation_items_v1
   where order_id=o.id;

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
$function$;

create or replace function public.check_order_dispatch_fiscal_gate_v1(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  cfg public.fiscal_runtime_config%rowtype;
  o public.orders%rowtype;
  c public.order_fiscal_controls%rowtype;
  gate_mode text:='observe';
  authorization_required boolean:=true;
  authorized boolean:=false;
  fiscal_allowed boolean:=true;
  authority text:='legacy_shadow';
  physical_state text:=null;
  physical_allowed boolean:=true;
  allowed boolean:=true;
  reason text:=null;
begin
  select * into o from public.orders where id=p_order_id;
  if not found then return jsonb_build_object('ok',false,'error','order_not_found','allowed',false,'external_side_effect',false); end if;

  select * into cfg from public.fiscal_runtime_config where id=1;
  if found then
    gate_mode:=coalesce(cfg.dispatch_gate_mode,'observe');
    authorization_required:=coalesce(cfg.require_fiscal_authorization_before_dispatch,true);
  end if;

  insert into public.order_fiscal_controls(order_id) values(o.id) on conflict(order_id) do nothing;
  select * into c from public.order_fiscal_controls where order_id=o.id;
  authorized:=c.dispatch_fiscal_status in ('authorized','not_required');
  fiscal_allowed:=not (gate_mode='enforce' and authorization_required) or authorized;

  select coalesce(r.metadata->>'ops2_stock_authority','legacy_shadow') into authority
    from public.bling_hub_runtime_v2 r where r.id=1;
  if coalesce(authority,'legacy_shadow')='bling' then
    select s.state into physical_state from public.bling_order_stock_controls_v2 s where s.source_order_id=o.id;
    physical_allowed:=coalesce(physical_state,'')='launched';
  end if;

  allowed:=fiscal_allowed and physical_allowed;
  if not fiscal_allowed then reason:='fiscal_authorization_required_before_dispatch';
  elsif not physical_allowed then reason:='bling_physical_stock_launch_required_before_dispatch';
  elsif authorized then reason:=null;
  elsif gate_mode='off' or not authorization_required then reason:='dispatch_fiscal_gate_off';
  else reason:='fiscal_authorization_pending_observe'; end if;

  return jsonb_build_object(
    'ok',true,'order_id',o.id,'order_status',o.status,'mode',gate_mode,
    'authorization_required',authorization_required,'allowed',allowed,'authorized',authorized,
    'dispatch_fiscal_status',c.dispatch_fiscal_status,'authorized_at',c.dispatch_fiscal_authorized_at,
    'source',c.dispatch_fiscal_source,'reason',coalesce(c.dispatch_fiscal_reason,reason),
    'bling_invoice_id',c.bling_invoice_id,'bling_invoice_number',c.bling_invoice_number,'sefaz_status',c.sefaz_status,
    'stock_authority',authority,'physical_stock_state',physical_state,'physical_stock_ready',physical_allowed,
    'external_side_effect',false
  );
end;
$function$;

-- A checagem canônica acima agora inclui autorização fiscal + baixa física Bling.
-- Remove apenas o trigger duplicado; mantém a função antiga disponível para auditoria/histórico.
drop trigger if exists trg_ops_enforce_fiscal_before_dispatch_v1 on public.orders;

create or replace function public.enforce_order_dispatch_fiscal_gate_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  gate jsonb;
begin
  if new.status in ('out_for_delivery','delivered')
     and old.status not in ('out_for_delivery','delivered') then
    gate:=public.check_order_dispatch_fiscal_gate_v1(new.id);
    if coalesce((gate->>'allowed')::boolean,false) is not true then
      raise exception 'fiscal_dispatch_not_authorized:%',new.id
        using errcode='P0001',detail=coalesce(gate::text,'{}'),hint='Authorize o documento fiscal e conclua a baixa física antes da saída.';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_orders_fiscal_dispatch_gate_v1 on public.orders;
create trigger trg_orders_fiscal_dispatch_gate_v1
before update of status on public.orders
for each row
when (old.status is distinct from new.status)
execute function public.enforce_order_dispatch_fiscal_gate_trigger_v1();

create or replace function public.ops4_start_dispatch_v1(
  p_order_id uuid,
  p_operator_label text default null,
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  o public.orders%rowtype;
  s public.order_separation_completions_v1%rowtype;
  c public.order_fiscal_controls%rowtype;
  gate jsonb;
  v_now timestamptz:=now();
  v_key text;
begin
  if p_order_id is null then raise exception 'invalid_order'; end if;
  select * into o from public.orders where id=p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;

  insert into public.order_fiscal_controls(order_id) values(o.id) on conflict(order_id) do nothing;
  select * into c from public.order_fiscal_controls where order_id=o.id for update;

  if o.status='out_for_delivery' then
    return jsonb_build_object('ok',true,'order_id',o.id,'status',o.status,'dispatch_started_at',c.dispatch_started_at,'already_started',true);
  end if;
  if o.status<>'ready' then raise exception 'order_not_ready_for_dispatch'; end if;

  select * into s from public.order_separation_completions_v1 where order_id=o.id;
  if s.id is null or s.completed_at is null then raise exception 'separation_not_completed'; end if;
  if coalesce((s.metadata->>'stock_applied')::boolean,false) is not true then raise exception 'separation_stock_not_applied'; end if;
  if exists(select 1 from public.order_separation_items_v1 where order_id=o.id and state='pending') then raise exception 'separation_has_pending_items'; end if;
  if c.dispatch_fiscal_status not in ('authorized','not_required') then raise exception 'fiscal_authorization_required_before_dispatch'; end if;

  gate:=public.check_order_dispatch_fiscal_gate_v1(o.id);
  if coalesce((gate->>'allowed')::boolean,false) is not true then
    raise exception '%',coalesce(gate->>'reason','dispatch_not_allowed');
  end if;

  v_key:=coalesce(nullif(trim(coalesce(p_idempotency_key,'')),''),'dispatch-v4:'||o.id::text);
  update public.order_fiscal_controls
     set dispatch_started_at=coalesce(dispatch_started_at,v_now),
         dispatch_started_by=coalesce(dispatch_started_by,left(nullif(trim(coalesce(p_operator_label,'')),''),80)),
         dispatch_idempotency_key=coalesce(dispatch_idempotency_key,v_key),
         delivery_status='out_for_delivery',
         updated_at=v_now
   where order_id=o.id;

  update public.orders set status='out_for_delivery',updated_at=v_now where id=o.id;

  begin
    perform public.ops_record_event_v1(
      'order','order.out_for_delivery','Pedido saiu para entrega.','human','order',o.id::text,o.id::text,
      null,left(nullif(trim(coalesce(p_operator_label,'')),''),80),'dona_antonia','info',
      jsonb_build_object('flow','orders_v4','dispatch_fiscal_status',gate->>'dispatch_fiscal_status','bling_invoice_id',gate->>'bling_invoice_id'),
      null,'order-dispatch-v4:'||o.id::text,now()
    );
  exception when others then null;
  end;

  return jsonb_build_object('ok',true,'order_id',o.id,'status','out_for_delivery','dispatch_started_at',v_now,'already_started',false,'gate',gate);
end;
$function$;

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
  v_control public.order_fiscal_controls%rowtype;
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
  if v_method not in ('pix','cash','credit_card','food_card','meal_card','other') then raise exception 'invalid_payment_method'; end if;

  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  v_expected:=round(coalesce(v_order.total,0)*100)::bigint;
  if v_expected<=0 then raise exception 'invalid_order_total'; end if;
  if p_amount_cents is null or p_amount_cents<>v_expected then raise exception 'payment_total_mismatch'; end if;

  select * into v_completion from public.order_separation_completions_v1 where order_id=p_order_id;
  select * into v_control from public.order_fiscal_controls where order_id=p_order_id;

  if v_order.status<>'delivered' then
    if v_order.status<>'out_for_delivery' then raise exception 'order_not_out_for_delivery'; end if;
    if v_completion.id is null or v_completion.completed_at is null then raise exception 'separation_not_completed'; end if;
    if v_control.order_id is null or v_control.dispatch_fiscal_status not in ('authorized','not_required') then raise exception 'fiscal_authorization_required_before_delivery'; end if;
    if v_control.dispatch_started_at is null then raise exception 'dispatch_not_started'; end if;
  end if;

  select * into v_existing from public.order_payment_settlements where order_id=p_order_id;
  if found then
    select method,amount_cents into v_existing_method,v_existing_amount
      from public.order_payment_parts where settlement_id=v_existing.id order by sequence limit 1;
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
    if v_order.status='delivered' then raise exception 'delivered_order_without_settlement'; end if;
    v_key:=coalesce(nullif(trim(coalesce(p_idempotency_key,'')),''),'delivery-v4:'||p_order_id::text);
    insert into public.order_payment_settlements(
      order_id,status,expected_total_cents,captured_total_cents,planned_method,
      operator_label,source,bling_sync_state,idempotency_key,metadata,captured_at
    ) values(
      p_order_id,'captured',v_expected,v_expected,v_order.payment_method,
      left(nullif(trim(coalesce(p_operator_label,'')),''),80),'delivery','blocked_homologation',v_key,
      jsonb_build_object('captured_order_status',v_order.status,'flow','orders_v4'),v_now
    ) returning id into v_settlement_id;
    insert into public.order_payment_parts(settlement_id,sequence,method,amount_cents,detail)
    values(v_settlement_id,1,v_method,v_expected,'{}'::jsonb);
  end if;

  if v_order.status<>'delivered' then
    update public.orders set status='delivered',delivered_at=coalesce(delivered_at,v_now),updated_at=v_now where id=p_order_id;
    update public.order_fiscal_controls
       set delivery_status='delivered',delivery_confirmed_at=coalesce(delivery_confirmed_at,v_now),updated_at=v_now
     where order_id=p_order_id;
  end if;

  perform public.ops2_refresh_order_public_snapshot_v1(p_order_id);
  begin
    perform public.ops_record_event_v1(
      'order','order.delivered','Entrega e pagamento confirmados.','human','order',p_order_id::text,p_order_id::text,
      null,left(nullif(trim(coalesce(p_operator_label,'')),''),80),'dona_antonia','info',
      jsonb_build_object('settlement_id',v_settlement_id,'payment_method',v_method,'amount_cents',v_expected,'flow','orders_v4'),
      null,'order-delivered-v4:'||p_order_id::text,now()
    );
  exception when others then null;
  end;

  return jsonb_build_object(
    'ok',true,'order_id',p_order_id,'status','delivered','delivered_at',coalesce(v_order.delivered_at,v_now),
    'settlement_id',v_settlement_id,'payment_method',v_method,'amount_cents',v_expected,
    'already_delivered',v_order.status='delivered'
  );
end;
$function$;

revoke all on function public.refresh_order_fiscal_readiness_v1(uuid) from public,anon,authenticated;
revoke all on function public.preview_bling_invoice_eligibility_v1(uuid) from public,anon,authenticated;
revoke all on function public.ops2_fiscal_dispatch_preflight_v1(uuid) from public,anon,authenticated;
revoke all on function public.check_order_dispatch_fiscal_gate_v1(uuid) from public,anon,authenticated;
revoke all on function public.ops4_start_dispatch_v1(uuid,text,text) from public,anon,authenticated;
revoke all on function public.ops3_complete_delivery_v1(uuid,text,bigint,text,text) from public,anon,authenticated;

grant execute on function public.refresh_order_fiscal_readiness_v1(uuid) to service_role;
grant execute on function public.preview_bling_invoice_eligibility_v1(uuid) to service_role;
grant execute on function public.ops2_fiscal_dispatch_preflight_v1(uuid) to service_role;
grant execute on function public.check_order_dispatch_fiscal_gate_v1(uuid) to service_role;
grant execute on function public.ops4_start_dispatch_v1(uuid,text,text) to service_role;
grant execute on function public.ops3_complete_delivery_v1(uuid,text,bigint,text,text) to service_role;
