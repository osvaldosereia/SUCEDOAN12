begin;

-- Fecha a atribuição no pedido sem acoplar o checkout público ao motor de Marketing.
-- O último clique válido do cliente em até 7 dias é suficiente para reconstruir a jornada.

create or replace function public.marketing_attribute_order_v1(
  p_order_id uuid,
  p_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_order public.orders%rowtype;
  v_token text:=lower(btrim(coalesce(p_token,'')));
  v_hash text;
  v_clicked public.marketing_tracking_links_v1%rowtype;
  v_latest public.marketing_tracking_links_v1%rowtype;
  v_link public.marketing_tracking_links_v1%rowtype;
  v_kind text;
  v_order_commercial_id uuid;
  v_order_lot_id uuid;
  v_item_commercial_id uuid;
  v_item_lot_id uuid;
  v_offer_match boolean:=false;
  v_event_key text;
begin
  select * into v_order from public.orders where id=p_order_id;
  if not found then return jsonb_build_object('ok',false,'error','order_not_found'); end if;
  if v_order.confirmed_at is null then
    return jsonb_build_object('ok',false,'error','order_not_confirmed');
  end if;
  if v_order.cancelled_at is not null or v_order.returned_at is not null then
    return jsonb_build_object('ok',false,'error','order_not_attributable');
  end if;

  v_order_commercial_id:=v_order.basket_id;

  select
    case when coalesce(i.metadata->>'basket_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (i.metadata->>'basket_id')::uuid else null end,
    case when coalesce(i.metadata->>'basket_lot_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (i.metadata->>'basket_lot_id')::uuid else null end
  into v_item_commercial_id,v_item_lot_id
  from public.order_items i
  where i.order_id=v_order.id
    and ((i.metadata ? 'basket_id') or (i.metadata ? 'basket_lot_id'))
  order by i.created_at,i.id
  limit 1;

  v_order_commercial_id:=coalesce(v_order_commercial_id,v_item_commercial_id);
  v_order_lot_id:=v_item_lot_id;

  -- Quando o token chegou explicitamente, ele tem precedência.
  if v_token ~ '^[0-9a-f]{36}$' then
    v_hash:=encode(extensions.digest(convert_to(v_token,'UTF8'),'sha256'),'hex');
    select * into v_clicked
    from public.marketing_tracking_links_v1
    where token_hash=v_hash
      and first_opened_at is not null
      and first_opened_at<=v_order.created_at
      and first_opened_at>=v_order.created_at-interval '7 days'
      and customer_id is not distinct from v_order.customer_id
    limit 1;
    if found then v_link:=v_clicked; end if;
  end if;

  -- Caminho normal: reconstrói pelo cliente e pelo último clique rastreado.
  if v_link.id is null and v_order.customer_id is not null then
    select l.* into v_latest
    from public.marketing_tracking_links_v1 l
    where l.customer_id=v_order.customer_id
      and l.first_opened_at is not null
      and l.first_opened_at<=v_order.created_at
      and l.first_opened_at>=v_order.created_at-interval '7 days'
      and l.expires_at>=l.first_opened_at
    order by l.first_opened_at desc,l.created_at desc
    limit 1;
    if found then
      v_link:=v_latest;
      v_hash:=v_latest.token_hash;
    end if;
  end if;

  if v_link.id is null then
    return jsonb_build_object('ok',true,'attributed',false,'reason','no_marketing_touch_in_window');
  end if;

  v_offer_match:=(
    (v_link.commercial_id is not null and v_link.commercial_id=v_order_commercial_id)
    or (v_link.public_lot_id is not null and v_link.public_lot_id=v_order_lot_id)
  );
  v_kind:=case when v_offer_match then 'direct' else 'assisted' end;

  v_event_key:=format('strategy-order:%s:%s',v_link.strategy_id,v_order.id);
  insert into public.marketing_attribution_events_v1(
    strategy_id,campaign_id,customer_id,order_id,commercial_id,public_lot_id,event_type,
    attribution_kind,amount,token_hash,idempotency_key,occurred_at,metadata
  ) values (
    v_link.strategy_id,v_link.campaign_id,v_order.customer_id,v_order.id,
    coalesce(v_order_commercial_id,v_link.commercial_id),coalesce(v_order_lot_id,v_link.public_lot_id),
    'order_attributed',v_kind,greatest(coalesce(v_order.total,0),0),v_hash,v_event_key,
    v_order.confirmed_at,
    jsonb_build_object(
      'dispatch_id',v_link.dispatch_id,'offer_position',v_link.offer_position,
      'clicked_commercial_id',v_link.commercial_id,'clicked_public_lot_id',v_link.public_lot_id,
      'purchased_commercial_id',v_order_commercial_id,'purchased_public_lot_id',v_order_lot_id,
      'direct_offer_match',v_offer_match,'window_days',7
    )
  ) on conflict(idempotency_key) do nothing;

  update public.marketing_tracking_links_v1
  set attributed_order_id=coalesce(attributed_order_id,v_order.id),
      attribution_kind=coalesce(attribution_kind,v_kind),updated_at=now()
  where id=v_link.id;

  return jsonb_build_object(
    'ok',true,'attributed',true,'attribution_kind',v_kind,'strategy_id',v_link.strategy_id,
    'campaign_id',v_link.campaign_id,'order_id',v_order.id,'amount',v_order.total,
    'commercial_id',coalesce(v_order_commercial_id,v_link.commercial_id),
    'public_lot_id',coalesce(v_order_lot_id,v_link.public_lot_id)
  );
end;
$$;
revoke all on function public.marketing_attribute_order_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.marketing_attribute_order_v1(uuid,text) to service_role;

create or replace function public.marketing_attribute_order_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.customer_id is not null
     and new.confirmed_at is not null
     and new.cancelled_at is null
     and new.returned_at is null
     and (
       tg_op='INSERT'
       or old.customer_id is distinct from new.customer_id
       or old.confirmed_at is distinct from new.confirmed_at
     ) then
    perform public.marketing_attribute_order_v1(new.id,null);
  end if;
  return new;
exception when others then
  -- Marketing nunca pode impedir a criação/confirmação do pedido.
  return new;
end;
$$;
revoke all on function public.marketing_attribute_order_trigger_v1() from public,anon,authenticated;
grant execute on function public.marketing_attribute_order_trigger_v1() to service_role;

drop trigger if exists marketing_attribute_order_after_write_v1 on public.orders;
create trigger marketing_attribute_order_after_write_v1
after insert or update of customer_id,confirmed_at on public.orders
for each row execute function public.marketing_attribute_order_trigger_v1();

commit;
