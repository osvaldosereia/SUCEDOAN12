-- Post-order cross-sell reply / transaction / delivery guards
alter table public.post_order_cross_sell_config
  add column if not exists test_phone_suffix text;

alter table public.post_order_cross_sell_config
  add column if not exists delivery_contract_ready boolean not null default false;

CREATE OR REPLACE FUNCTION public.accept_post_order_cross_sell_v1(p_session_id uuid, p_positions integer[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_session public.post_order_cross_sell_sessions%rowtype;
  v_cfg public.post_order_cross_sell_config%rowtype;
  v_order public.orders%rowtype;
  v_positions integer[];
  v_items_count integer := 0;
  v_added integer := 0;
  v_new_total integer := 0;
  v_reserve jsonb;
  v_stock_consumed boolean := false;
begin
  select * into v_session
  from public.post_order_cross_sell_sessions
  where id=p_session_id
  for update;
  if not found then return jsonb_build_object('ok',false,'error','session_not_found'); end if;

  select * into v_cfg
  from public.post_order_cross_sell_config
  where organization_id=v_session.organization_id;
  if not found or not v_cfg.enabled or v_cfg.mode not in ('test','canary','live') then
    return jsonb_build_object('ok',false,'error','cross_sell_write_disabled');
  end if;

  if v_session.status not in ('sent','sent_test') then
    return jsonb_build_object('ok',false,'error','session_not_open');
  end if;
  if v_session.expires_at is null or v_session.expires_at<=now() then
    update public.post_order_cross_sell_sessions
       set status='expired',completed_at=now(),updated_at=now()
     where id=v_session.id;
    return jsonb_build_object('ok',false,'error','session_expired');
  end if;

  select * into v_order
  from public.orders
  where id=v_session.order_id and organization_id=v_session.organization_id
  for update;
  if not found then return jsonb_build_object('ok',false,'error','order_not_found'); end if;

  select exists(
    select 1 from public.order_stock_reservations
    where organization_id=v_session.organization_id
      and order_id=v_session.order_id
      and status='consumed'
  ) into v_stock_consumed;
  if v_stock_consumed then
    return jsonb_build_object('ok',false,'error','separation_already_started');
  end if;
  if v_order.status in ('cancelled','returned','delivered') then
    return jsonb_build_object('ok',false,'error','order_not_editable');
  end if;

  if v_cfg.mode='test' and coalesce(v_cfg.test_phone_suffix,'')<>'' then
    if right(regexp_replace(coalesce(v_order.whatsapp_phone_e164,''),'[^0-9]','','g'),length(v_cfg.test_phone_suffix))<>v_cfg.test_phone_suffix then
      return jsonb_build_object('ok',false,'error','test_phone_not_allowed');
    end if;
  end if;

  select coalesce(array_agg(distinct p order by p),'{}'::integer[])
    into v_positions
  from unnest(coalesce(p_positions,'{}'::integer[])) p
  where p between 1 and 10;

  if coalesce(array_length(v_positions,1),0)=0 then
    return jsonb_build_object('ok',false,'error','positions_required');
  end if;

  select count(*) into v_items_count
  from public.post_order_cross_sell_items i
  join public.products p on p.id=i.product_id
  where i.session_id=v_session.id
    and i.position=any(v_positions)
    and p.organization_id=v_session.organization_id
    and p.active=true
    and coalesce(p.stock_quantity,0)>0
    and i.offered_price_cents>0
    and (
      i.expiration_date_snapshot is null
      or p.expiration_date is not distinct from i.expiration_date_snapshot
    );

  if v_items_count<>array_length(v_positions,1) then
    return jsonb_build_object('ok',false,'error','one_or_more_items_unavailable');
  end if;

  select public.reserve_storefront_order_stock_v2(
    v_session.organization_id,
    v_session.order_id,
    coalesce(jsonb_agg(jsonb_build_object('product_id',i.product_id,'quantity',1)),'[]'::jsonb)
  )
  into v_reserve
  from public.post_order_cross_sell_items i
  where i.session_id=v_session.id and i.position=any(v_positions);

  if coalesce((v_reserve->>'ok')::boolean,false) is not true then
    return jsonb_build_object(
      'ok',false,
      'error',coalesce(v_reserve->>'error','stock_reservation_failed'),
      'stock',v_reserve
    );
  end if;

  insert into public.order_items(
    organization_id,order_id,item_kind,product_id,basket_id,name_snapshot,sku_snapshot,
    quantity,unit_price_cents,total_cents,metadata
  )
  select
    v_session.organization_id,v_session.order_id,'product',i.product_id,null,
    i.name_snapshot,i.sku_snapshot,1,i.offered_price_cents,i.offered_price_cents,
    jsonb_build_object(
      'source','post_order_cross_sell',
      'cross_sell_session_id',v_session.id,
      'cross_sell_position',i.position,
      'source_kind',i.source_kind,
      'discount_percent',i.discount_percent,
      'expiration_date_snapshot',i.expiration_date_snapshot
    )
  from public.post_order_cross_sell_items i
  where i.session_id=v_session.id
    and i.position=any(v_positions)
    and not exists(
      select 1 from public.order_items oi
      where oi.order_id=v_session.order_id
        and oi.product_id=i.product_id
        and coalesce(oi.metadata->>'cross_sell_session_id','')=v_session.id::text
    );

  get diagnostics v_items_count=row_count;

  select coalesce(sum(i.offered_price_cents),0)::integer
    into v_added
  from public.post_order_cross_sell_items i
  where i.session_id=v_session.id and i.position=any(v_positions);

  update public.post_order_cross_sell_items
  set accepted=true,accepted_quantity=1
  where session_id=v_session.id and position=any(v_positions);

  update public.orders
  set subtotal_cents=subtotal_cents+v_added,
      total_cents=total_cents+v_added
  where id=v_session.order_id
  returning total_cents into v_new_total;

  update public.post_order_cross_sell_sessions
  set status='accepted',
      selected_numbers=to_jsonb(v_positions),
      accepted_product_count=array_length(v_positions,1),
      added_revenue_cents=v_added,
      completed_at=now(),
      updated_at=now()
  where id=v_session.id;

  insert into public.post_order_cross_sell_events(
    organization_id,session_id,order_id,event_type,payload
  ) values(
    v_session.organization_id,v_session.id,v_session.order_id,'customer_accepted',
    jsonb_build_object(
      'positions',to_jsonb(v_positions),
      'added_revenue_cents',v_added,
      'new_total_cents',v_new_total
    )
  );

  return jsonb_build_object(
    'ok',true,
    'status','accepted',
    'positions',to_jsonb(v_positions),
    'added_count',array_length(v_positions,1),
    'added_revenue_cents',v_added,
    'new_total_cents',v_new_total
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.cancel_post_order_cross_sell_for_separation_v1(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_session public.post_order_cross_sell_sessions%rowtype;
  v_cancelled integer := 0;
begin
  for v_session in
    select *
    from public.post_order_cross_sell_sessions
    where order_id=p_order_id
      and status in ('sent','sent_test','prepared_for_delivery')
    order by created_at
    for update
  loop
    update public.post_order_cross_sell_sessions
       set status='cancelled',
           completed_at=now(),
           metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
             'cancel_reason','separation_started',
             'cancelled_at',now()
           ),
           updated_at=now()
     where id=v_session.id;

    insert into public.post_order_cross_sell_events(
      organization_id,session_id,order_id,event_type,payload
    ) values(
      v_session.organization_id,v_session.id,v_session.order_id,
      'session_cancelled',
      jsonb_build_object('reason','separation_started')
    );
    v_cancelled:=v_cancelled+1;
  end loop;

  return jsonb_build_object('ok',true,'cancelled_sessions',v_cancelled);
end;
$function$


CREATE OR REPLACE FUNCTION public.decline_post_order_cross_sell_v1(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_session public.post_order_cross_sell_sessions%rowtype;
begin
  select * into v_session
  from public.post_order_cross_sell_sessions
  where id=p_session_id
  for update;
  if not found then return jsonb_build_object('ok',false,'error','session_not_found'); end if;
  if v_session.status not in ('sent','sent_test') then
    return jsonb_build_object('ok',false,'error','session_not_open');
  end if;

  update public.post_order_cross_sell_sessions
  set status='declined',completed_at=now(),updated_at=now()
  where id=p_session_id;

  insert into public.post_order_cross_sell_events(
    organization_id,session_id,order_id,event_type,payload
  ) values(v_session.organization_id,v_session.id,v_session.order_id,'customer_declined','{}'::jsonb);

  return jsonb_build_object('ok',true,'status','declined');
end;
$function$


CREATE OR REPLACE FUNCTION public.mark_post_order_cross_sell_sent_v1(p_session_id uuid, p_delivery_ref text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_session public.post_order_cross_sell_sessions%rowtype;
  v_cfg public.post_order_cross_sell_config%rowtype;
begin
  select * into v_session
  from public.post_order_cross_sell_sessions
  where id=p_session_id
  for update;
  if not found then return jsonb_build_object('ok',false,'error','session_not_found'); end if;

  select * into v_cfg
  from public.post_order_cross_sell_config
  where organization_id=v_session.organization_id;
  if not found or not v_cfg.enabled or v_cfg.mode not in ('test','canary','live') then
    return jsonb_build_object('ok',false,'error','delivery_not_enabled');
  end if;
  if not v_session.eligible then
    return jsonb_build_object('ok',false,'error','session_not_eligible');
  end if;

  update public.post_order_cross_sell_sessions
  set status=case when v_cfg.mode='test' then 'sent_test' else 'sent' end,
      sent_at=coalesce(sent_at,now()),
      expires_at=now()+make_interval(secs=>v_cfg.response_window_seconds),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'delivery_ref',nullif(p_delivery_ref,''),
        'delivery_mode',v_cfg.mode,
        'sent_marked_at',now()
      ),
      updated_at=now()
  where id=p_session_id;

  insert into public.post_order_cross_sell_events(
    organization_id,session_id,order_id,event_type,payload
  ) values(
    v_session.organization_id,v_session.id,v_session.order_id,'message_sent',
    jsonb_build_object('mode',v_cfg.mode,'delivery_ref',nullif(p_delivery_ref,''))
  );

  return jsonb_build_object('ok',true,'session_id',p_session_id,'mode',v_cfg.mode);
end;
$function$


CREATE OR REPLACE FUNCTION public.parse_post_order_cross_sell_reply_v1(p_text text, p_max_position integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  v_text text := lower(coalesce(p_text,''));
  v_normalized text;
  v_positions integer[];
  v_max integer := greatest(1,least(coalesce(p_max_position,10),10));
  v_select_pattern text :=
    '^\s*(?:(?:quero|queria)\s+(?:(?:o|os)\s+)?|(?:coloca|coloque|adiciona|adicione|adicionar)\s+(?:(?:o|os)\s+)?|(?:pode\s+(?:colocar|adicionar))\s+(?:(?:o|os)\s+)?)?(?:10|[1-9])(?:\s*(?:,|e)\s*(?:10|[1-9]))*\s*[.!]?\s*$';
begin
  v_normalized := translate(
    v_text,
    'áàãâäéèêëíìîïóòõôöúùûüç',
    'aaaaaeeeeiiiiooooouuuuc'
  );
  v_normalized := regexp_replace(v_normalized,'\s+',' ','g');

  if v_normalized ~ '^\s*(nao|nao quero|pode fechar|pode finalizar|so isso|deixa assim|obrigado|obrigada)\s*[.!]?\s*$' then
    return jsonb_build_object('intent','decline','positions','[]'::jsonb,'normalized',trim(v_normalized));
  end if;

  if v_normalized ~ v_select_pattern then
    select coalesce(array_agg(distinct n order by n),'{}'::integer[])
      into v_positions
    from (
      select (m[1])::integer as n
      from regexp_matches(v_normalized,'(10|[1-9])','g') r(m)
    ) x
    where n between 1 and v_max;

    if coalesce(array_length(v_positions,1),0)>0 then
      return jsonb_build_object('intent','select','positions',to_jsonb(v_positions),'normalized',trim(v_normalized));
    end if;
  end if;

  return jsonb_build_object('intent','unknown','positions','[]'::jsonb,'normalized',trim(v_normalized));
end;
$function$


revoke all on function public.parse_post_order_cross_sell_reply_v1(text,integer) from public,anon,authenticated;
revoke all on function public.mark_post_order_cross_sell_sent_v1(uuid,text) from public,anon,authenticated;
revoke all on function public.decline_post_order_cross_sell_v1(uuid) from public,anon,authenticated;
revoke all on function public.accept_post_order_cross_sell_v1(uuid,integer[]) from public,anon,authenticated;
revoke all on function public.cancel_post_order_cross_sell_for_separation_v1(uuid) from public,anon,authenticated;
grant execute on function public.parse_post_order_cross_sell_reply_v1(text,integer) to service_role;
grant execute on function public.mark_post_order_cross_sell_sent_v1(uuid,text) to service_role;
grant execute on function public.decline_post_order_cross_sell_v1(uuid) to service_role;
grant execute on function public.accept_post_order_cross_sell_v1(uuid,integer[]) to service_role;
grant execute on function public.cancel_post_order_cross_sell_for_separation_v1(uuid) to service_role;
