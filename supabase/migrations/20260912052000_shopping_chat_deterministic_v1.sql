begin;

create table if not exists public.shopping_chat_deterministic_config (
  id smallint primary key default 1 check (id=1),
  enabled boolean not null default true,
  greeting_text text not null default 'Oi! Aqui você escolhe tudo de forma rápida. Toque em uma opção abaixo.',
  unknown_text text not null default 'Escolha uma das opções abaixo para eu continuar.',
  payment_text text not null default 'O pagamento é feito na entrega. Aceitamos PIX, dinheiro, cartão de crédito e cartão alimentação/refeição.',
  delivery_text text not null default 'Entregamos em Cuiabá e Várzea Grande.',
  human_text text not null default 'Certo. Uma atendente vai continuar com você por aqui.',
  composer_enabled boolean not null default false,
  media_input_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.shopping_chat_deterministic_config(id) values(1) on conflict(id) do nothing;

create table if not exists public.shopping_chat_trigger_events (
  id uuid primary key default gen_random_uuid(),
  catalog_session_id uuid references public.catalog_sessions(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  trigger text not null,
  from_state text,
  to_state text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists shopping_chat_trigger_events_session_idx on public.shopping_chat_trigger_events(catalog_session_id,created_at desc);
create index if not exists shopping_chat_trigger_events_conversation_idx on public.shopping_chat_trigger_events(conversation_id,created_at desc);
create index if not exists shopping_chat_trigger_events_trigger_idx on public.shopping_chat_trigger_events(trigger,created_at desc);

alter table public.shopping_chat_deterministic_config enable row level security;
alter table public.shopping_chat_trigger_events enable row level security;
revoke all on public.shopping_chat_deterministic_config from anon,authenticated;
revoke all on public.shopping_chat_trigger_events from anon,authenticated;
grant select,insert,update,delete on public.shopping_chat_deterministic_config to service_role;
grant select,insert,update,delete on public.shopping_chat_trigger_events to service_role;

create or replace function public.deterministic_chat_start_session_v1()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_conversation uuid; v_session public.catalog_sessions%rowtype;
begin
  insert into public.conversations(whatsapp_account_id,customer_id,wa_contact_e164,source,status,stage,response_preference,mode,channel,automation_cohort,referral)
  values(null,null,null,'website','open','menu','text','human','web','human_control',jsonb_build_object('entry_channel','website','automation','deterministic')) returning id into v_conversation;
  insert into public.catalog_sessions(customer_id,conversation_id,cart_id,kind,title,status,expires_at,metadata,experience,current_view,last_activity_at)
  values(null,v_conversation,null,'browse','Atendimento Dona Antônia','open',now()+interval '24 hours',jsonb_build_object('entry_channel','website','shopping_mode','deterministic','state','MENU'),'shopping_room','home',now()) returning * into v_session;
  insert into public.shopping_chat_trigger_events(catalog_session_id,conversation_id,trigger,from_state,to_state,payload) values(v_session.id,v_conversation,'OPEN_CHAT',null,'MENU','{}'::jsonb);
  return jsonb_build_object('token',v_session.public_token,'expires_at',v_session.expires_at,'conversation_id',v_conversation);
end $$;

create or replace function public.deterministic_chat_identify_customer_v1(p_public_token text,p_name text,p_phone text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_session public.catalog_sessions%rowtype; v_name text:=nullif(trim(coalesce(p_name,'')),''); v_phone text:=public.canonical_phone_br(p_phone); v_variants text[]:=public.phone_variants_br(p_phone); v_customer public.customers%rowtype; v_phone_matches uuid[];
begin
  select * into v_session from public.catalog_sessions where public_token=p_public_token and status='open' and expires_at>now() for update;
  if not found then raise exception 'room_unavailable'; end if;
  if v_name is null or length(v_name)<2 then raise exception 'customer_name_required'; end if;
  if v_phone is null or coalesce(array_length(v_variants,1),0)=0 then raise exception 'valid_whatsapp_required'; end if;
  select array_agg(distinct id) into v_phone_matches from (
    select c.id from public.customers c where public.normalize_phone_digits(c.primary_whatsapp_e164)=any(v_variants)
    union select cp.customer_id id from public.customer_phones cp where public.normalize_phone_digits(cp.phone_e164)=any(v_variants)
  ) q;
  if coalesce(array_length(v_phone_matches,1),0)=1 then select * into v_customer from public.customers where id=v_phone_matches[1] for update;
  elsif coalesce(array_length(v_phone_matches,1),0)>1 then raise exception 'ambiguous_customer_phone';
  else insert into public.customers(name,primary_whatsapp_e164,preferred_reply,is_active) values(v_name,v_phone,'text',true) returning * into v_customer; end if;
  update public.customers set name=coalesce(v_name,name),primary_whatsapp_e164=coalesce(primary_whatsapp_e164,v_phone),preferred_reply='text',updated_at=now() where id=v_customer.id returning * into v_customer;
  insert into public.customer_phones(customer_id,phone_e164,source,is_primary,verified_at) values(v_customer.id,v_phone,'manual',true,now())
  on conflict (phone_e164) do update set is_primary=(public.customer_phones.customer_id=excluded.customer_id),verified_at=case when public.customer_phones.customer_id=excluded.customer_id then now() else public.customer_phones.verified_at end;
  update public.conversations set customer_id=v_customer.id,wa_contact_e164=v_phone,mode='human',channel='web',updated_at=now() where id=v_session.conversation_id;
  update public.carts set customer_id=v_customer.id,updated_at=now() where conversation_id=v_session.conversation_id and status='draft';
  update public.catalog_sessions set customer_id=v_customer.id,last_activity_at=now() where id=v_session.id;
  insert into public.shopping_chat_trigger_events(catalog_session_id,conversation_id,customer_id,trigger,from_state,to_state,payload) values(v_session.id,v_session.conversation_id,v_customer.id,'CUSTOMER_IDENTIFIED','CHECKOUT','CHECKOUT',jsonb_build_object('phone',v_phone));
  return jsonb_build_object('id',v_customer.id,'name',v_customer.name,'phone',v_phone);
end $$;

create or replace function public.deterministic_chat_save_address_v1(p_public_token text,p_address jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_session public.catalog_sessions%rowtype; v_id uuid; v_street text:=nullif(trim(coalesce(p_address->>'street','')),''); v_number text:=nullif(trim(coalesce(p_address->>'number','')),''); v_neighborhood text:=nullif(trim(coalesce(p_address->>'neighborhood','')),''); v_city text:=nullif(trim(coalesce(p_address->>'city','')),''); v_lat numeric; v_lng numeric;
begin
  select * into v_session from public.catalog_sessions where public_token=p_public_token and status='open' and expires_at>now();
  if not found then raise exception 'room_unavailable'; end if;
  if v_session.customer_id is null then raise exception 'customer_identification_required'; end if;
  if v_street is null or v_number is null or v_neighborhood is null or v_city is null then raise exception 'delivery_address_required'; end if;
  begin v_lat:=nullif(p_address->>'latitude','')::numeric; exception when others then v_lat:=null; end;
  begin v_lng:=nullif(p_address->>'longitude','')::numeric; exception when others then v_lng:=null; end;
  update public.customer_addresses set is_default=false,updated_at=now() where customer_id=v_session.customer_id and is_default=true;
  insert into public.customer_addresses(customer_id,label,street,block,number,complement,neighborhood,city,state,postal_code,reference,google_maps_url,latitude,longitude,is_default,is_active,last_confirmed_at)
  values(v_session.customer_id,coalesce(nullif(trim(p_address->>'label'),''),'Entrega'),v_street,nullif(trim(p_address->>'block'),''),v_number,nullif(trim(p_address->>'complement'),''),v_neighborhood,v_city,upper(coalesce(nullif(trim(p_address->>'state'),''),'MT')),nullif(regexp_replace(coalesce(p_address->>'postal_code',''),'[^0-9]','','g'),''),nullif(trim(p_address->>'reference'),''),nullif(trim(p_address->>'google_maps_url'),''),v_lat,v_lng,true,true,now()) returning id into v_id;
  insert into public.shopping_chat_trigger_events(catalog_session_id,conversation_id,customer_id,trigger,from_state,to_state,payload) values(v_session.id,v_session.conversation_id,v_session.customer_id,'ADDRESS_SAVED','WAITING_ADDRESS','CHECKOUT',jsonb_build_object('address_id',v_id));
  return jsonb_build_object('id',v_id,'saved',true);
end $$;

create or replace function public.deterministic_chat_checkout_preview_v1(p_public_token text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_session public.catalog_sessions%rowtype; v_cart public.carts%rowtype; v_customer public.customers%rowtype; v_items jsonb; v_addresses jsonb; v_basket jsonb;
begin
  select * into v_session from public.catalog_sessions where public_token=p_public_token and status='open' and expires_at>now(); if not found then raise exception 'room_unavailable'; end if;
  if v_session.cart_id is null then raise exception 'room_cart_unavailable'; end if;
  perform public.recalculate_cart(v_session.cart_id); select * into v_cart from public.carts where id=v_session.cart_id and status='draft'; if not found then raise exception 'cart_not_editable'; end if;
  if v_session.customer_id is not null then select * into v_customer from public.customers where id=v_session.customer_id; end if;
  select coalesce(jsonb_agg(jsonb_build_object('product_id',p.id,'name',p.name,'image_url',p.image_url,'quantity',ci.quantity,'unit_price',case when ci.source='basket' then null else coalesce(p.price,ci.unit_price,0) end,'line_total',case when ci.source='basket' then null else ci.quantity*coalesce(p.price,ci.unit_price,0) end,'source',ci.source,'removable',coalesce((ci.metadata->>'removable')::boolean,true),'quantity_editable',coalesce((ci.metadata->>'quantity_editable')::boolean,true)) order by ci.created_at),'[]'::jsonb)
  into v_items from public.cart_items ci join public.products p on p.id=ci.product_id where ci.cart_id=v_cart.id and ci.quantity>0;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'label',a.label,'street',a.street,'block',a.block,'number',a.number,'complement',a.complement,'neighborhood',a.neighborhood,'city',a.city,'state',a.state,'postal_code',a.postal_code,'reference',a.reference,'google_maps_url',a.google_maps_url,'latitude',a.latitude,'longitude',a.longitude,'is_default',a.is_default) order by a.is_default desc,a.updated_at desc),'[]'::jsonb)
  into v_addresses from public.customer_addresses a where a.customer_id=v_session.customer_id and a.is_active=true;
  select case when b.id is null then null else jsonb_build_object('id',b.id,'name',b.name,'image_url',b.image_url,'commercial_price',b.base_price) end into v_basket from public.basket_templates b where b.id=v_cart.basket_id;
  update public.catalog_sessions set checkout_started_at=coalesce(checkout_started_at,now()),last_activity_at=now(),current_view='checkout',metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('state','CHECKOUT') where id=v_session.id;
  return jsonb_build_object('cart',jsonb_build_object('id',v_cart.id,'total',v_cart.total,'fiscal_subtotal',v_cart.fiscal_subtotal,'other_expenses',v_cart.other_expenses,'discount',v_cart.discount,'version',v_cart.version),'basket',v_basket,'items',v_items,'customer',case when v_session.customer_id is null then null else jsonb_build_object('id',v_customer.id,'name',v_customer.name,'phone',v_customer.primary_whatsapp_e164) end,'requires_identification',(v_session.customer_id is null or v_customer.name is null or v_customer.primary_whatsapp_e164 is null),'requires_document',false,'addresses',v_addresses);
end $$;

create or replace function public.deterministic_chat_confirm_order_v1(p_public_token text,p_delivery_address jsonb default '{}'::jsonb,p_payment_method text default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_session public.catalog_sessions%rowtype; v_cart public.carts%rowtype; v_customer public.customers%rowtype; v_order public.orders%rowtype; v_address jsonb:=coalesce(p_delivery_address,'{}'::jsonb); v_order_id uuid:=gen_random_uuid(); v_order_number text; v_payment text:=nullif(trim(coalesce(p_payment_method,'')),'');
begin
  if v_payment not in ('pix','credit_card','meal_card','cash') then raise exception 'payment_method_required'; end if;
  select * into v_session from public.catalog_sessions where public_token=p_public_token and status='open' and expires_at>now() for update; if not found then raise exception 'room_unavailable'; end if;
  if v_session.cart_id is null then raise exception 'room_cart_unavailable'; end if; if v_session.customer_id is null then raise exception 'customer_identification_required'; end if;
  select * into v_customer from public.customers where id=v_session.customer_id; if not found or v_customer.name is null or v_customer.primary_whatsapp_e164 is null then raise exception 'customer_identification_required'; end if;
  if v_address='{}'::jsonb then select jsonb_build_object('id',a.id,'street',a.street,'block',a.block,'number',a.number,'complement',a.complement,'neighborhood',a.neighborhood,'city',a.city,'state',a.state,'postal_code',a.postal_code,'reference',a.reference,'google_maps_url',a.google_maps_url,'latitude',a.latitude,'longitude',a.longitude) into v_address from public.customer_addresses a where a.customer_id=v_session.customer_id and a.is_active=true order by a.is_default desc,a.updated_at desc limit 1; end if;
  if coalesce(v_address->>'street','')='' or coalesce(v_address->>'number','')='' or coalesce(v_address->>'neighborhood','')='' or coalesce(v_address->>'city','')='' then raise exception 'delivery_address_required'; end if;
  select * into v_order from public.orders where cart_id=v_session.cart_id limit 1; if found then return jsonb_build_object('order_id',v_order.id,'order_number',v_order.order_number,'status',v_order.status,'total',v_order.total,'idempotent_replay',true,'delivery_address',v_order.delivery_address); end if;
  perform public.recalculate_cart(v_session.cart_id); select * into v_cart from public.carts where id=v_session.cart_id for update; if not found or v_cart.status<>'draft' then raise exception 'cart_not_confirmable'; end if; if v_cart.pricing_status<>'ready' then raise exception 'pricing_not_ready'; end if; if not exists(select 1 from public.cart_items where cart_id=v_cart.id and quantity>0) then raise exception 'empty_cart'; end if;
  v_order_number:='DA-'||to_char(clock_timestamp() at time zone 'America/Cuiaba','YYMMDD')||'-'||upper(substr(replace(v_order_id::text,'-',''),1,8));
  insert into public.orders(id,customer_id,conversation_id,whatsapp_account_id,cart_id,basket_id,status,total,subtotal,currency,delivery_address,customer_snapshot,confirmed_at,fiscal_subtotal,other_expenses,discount,sync_status,idempotency_key,payment_method,phone_e164,source,order_number)
  values(v_order_id,v_session.customer_id,v_session.conversation_id,null,v_cart.id,v_cart.basket_id,'storefront_received',v_cart.total,v_cart.total,'BRL',v_address,jsonb_build_object('id',v_customer.id,'name',v_customer.name,'phone',v_customer.primary_whatsapp_e164),null,v_cart.fiscal_subtotal,v_cart.other_expenses,v_cart.discount,'local','deterministic-chat:'||v_session.id::text,v_payment,v_customer.primary_whatsapp_e164,'deterministic_chat',v_order_number) returning * into v_order;
  insert into public.order_items(order_id,product_id,sku_snapshot,name_snapshot,quantity,unit_price,line_total,metadata)
  select v_order.id,p.id,p.sku,p.name,ci.quantity,coalesce(p.price,ci.unit_price,0),ci.quantity*coalesce(p.price,ci.unit_price,0),ci.metadata||jsonb_build_object('source',ci.source,'commercial_delta',ci.commercial_delta) from public.cart_items ci join public.products p on p.id=ci.product_id where ci.cart_id=v_cart.id and ci.quantity>0;
  update public.orders set status='confirmed',confirmed_at=now(),sync_status='local',sync_error=null,updated_at=now() where id=v_order.id returning * into v_order;
  update public.carts set status='converted',updated_at=now() where id=v_cart.id;
  update public.catalog_sessions set status='closed',closed_at=now(),completed_at=now(),last_activity_at=now(),current_view='success',metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('state','ORDER_CONFIRMED','payment_method',v_payment) where id=v_session.id;
  update public.conversations set stage='order_confirmed',status='waiting_customer',mode='human',updated_at=now() where id=v_session.conversation_id;
  insert into public.order_status_events(order_id,from_status,to_status,source,event_key,metadata) values(v_order.id,'storefront_received','confirmed','deterministic_chat','deterministic-chat-confirmed:'||v_order.id::text,jsonb_build_object('cart_id',v_cart.id));
  insert into public.shopping_chat_trigger_events(catalog_session_id,conversation_id,customer_id,trigger,from_state,to_state,payload) values(v_session.id,v_session.conversation_id,v_session.customer_id,'ORDER_CONFIRMED','CHECKOUT','ORDER_CONFIRMED',jsonb_build_object('order_id',v_order.id,'order_number',v_order.order_number));
  return jsonb_build_object('order_id',v_order.id,'order_number',v_order.order_number,'status',v_order.status,'total',v_order.total,'idempotent_replay',false,'delivery_address',v_address);
end $$;

revoke all on function public.deterministic_chat_start_session_v1() from public,anon,authenticated;
revoke all on function public.deterministic_chat_identify_customer_v1(text,text,text) from public,anon,authenticated;
revoke all on function public.deterministic_chat_save_address_v1(text,jsonb) from public,anon,authenticated;
revoke all on function public.deterministic_chat_checkout_preview_v1(text) from public,anon,authenticated;
revoke all on function public.deterministic_chat_confirm_order_v1(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.deterministic_chat_start_session_v1() to service_role;
grant execute on function public.deterministic_chat_identify_customer_v1(text,text,text) to service_role;
grant execute on function public.deterministic_chat_save_address_v1(text,jsonb) to service_role;
grant execute on function public.deterministic_chat_checkout_preview_v1(text) to service_role;
grant execute on function public.deterministic_chat_confirm_order_v1(text,jsonb,text) to service_role;

commit;
