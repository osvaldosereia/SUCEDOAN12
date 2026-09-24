create or replace function public.capture_customer_location_pin_v1(
  p_customer_id uuid,
  p_conversation_id uuid,
  p_catalog_session_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_provider_message_id text default null,
  p_captured_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_now timestamptz:=coalesce(p_captured_at,now());
  v_maps_url text;
  v_address_id uuid;
  v_order_id uuid;
  v_delivery jsonb;
begin
  if p_customer_id is null then
    return jsonb_build_object('ok',false,'error','customer_required','side_effect_performed',false);
  end if;
  if p_latitude is null or p_longitude is null
     or p_latitude < -90 or p_latitude > 90
     or p_longitude < -180 or p_longitude > 180 then
    return jsonb_build_object('ok',false,'error','invalid_coordinates','side_effect_performed',false);
  end if;

  v_maps_url:='https://www.google.com/maps/search/?api=1&query='||
    trim(to_char(p_latitude,'FM999990.99999999'))||','||
    trim(to_char(p_longitude,'FM999990.99999999'));

  select a.id into v_address_id
    from public.customer_addresses a
   where a.customer_id=p_customer_id
     and a.is_active=true
   order by a.is_default desc,a.updated_at desc,a.created_at desc
   limit 1
   for update;

  if v_address_id is not null then
    update public.customer_addresses
       set latitude=p_latitude,
           longitude=p_longitude,
           google_maps_url=v_maps_url,
           last_confirmed_at=v_now,
           updated_at=now()
     where id=v_address_id;
  end if;

  select o.id,o.delivery_address
    into v_order_id,v_delivery
    from public.orders o
   where o.customer_id=p_customer_id
     and o.status not in ('delivered','cancelled','returned')
     and (
       (p_catalog_session_id is not null and o.catalog_session_id=p_catalog_session_id)
       or
       (p_conversation_id is not null and o.conversation_id=p_conversation_id)
     )
   order by
     case when p_catalog_session_id is not null and o.catalog_session_id=p_catalog_session_id then 0 else 1 end,
     o.created_at desc
   limit 1
   for update;

  if v_order_id is not null then
    v_delivery:=coalesce(v_delivery,'{}'::jsonb)||
      jsonb_build_object(
        'latitude',p_latitude,
        'longitude',p_longitude,
        'google_maps_url',v_maps_url,
        'coordinate_source','customer_pin',
        'coordinate_confidence',1.0,
        'coordinate_confirmed_at',v_now,
        'coordinate_provider_message_id',nullif(trim(coalesce(p_provider_message_id,'')),'')
      );
    update public.orders
       set delivery_address=v_delivery,
           updated_at=now()
     where id=v_order_id;
  end if;

  return jsonb_build_object(
    'ok',true,
    'customer_id',p_customer_id,
    'address_id',v_address_id,
    'address_updated',v_address_id is not null,
    'order_id',v_order_id,
    'order_updated',v_order_id is not null,
    'latitude',p_latitude,
    'longitude',p_longitude,
    'google_maps_url',v_maps_url,
    'coordinate_source','customer_pin',
    'side_effect_performed',(v_address_id is not null or v_order_id is not null)
  );
end;
$fn$;

revoke all on function public.capture_customer_location_pin_v1(uuid,uuid,uuid,double precision,double precision,text,timestamptz)
  from public,anon,authenticated;
grant execute on function public.capture_customer_location_pin_v1(uuid,uuid,uuid,double precision,double precision,text,timestamptz)
  to service_role;

comment on function public.capture_customer_location_pin_v1(uuid,uuid,uuid,double precision,double precision,text,timestamptz)
  is 'Persiste o pin de localizacao enviado pelo cliente no WhatsApp/PapoAI e o copia para o pedido operacional vinculado a conversa/sessao, preservando provenance.';
