begin;

alter table public.orders
  add column if not exists payment_method text;

alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
  check (payment_method is null or payment_method in ('pix','credit_card','meal_card','cash'));

create or replace function public.room_start_for_conversation_v1(
  p_conversation_id uuid,
  p_entry_intent text default 'baskets',
  p_entry_message text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  c public.conversations%rowtype;
  s public.catalog_sessions%rowtype;
  v_cart uuid;
  v_customer_name text;
  v_intent text:=left(lower(trim(coalesce(p_entry_intent,'baskets'))),60);
  v_message text:=left(trim(coalesce(p_entry_message,'')),500);
begin
  select * into c
  from public.conversations
  where id=p_conversation_id and status<>'closed'
  for update;
  if not found then raise exception 'conversation_not_found'; end if;

  select id into v_cart
  from public.carts
  where conversation_id=c.id and status='draft'
  order by updated_at desc
  limit 1;

  select * into s
  from public.catalog_sessions
  where conversation_id=c.id
    and experience='shopping_room'
    and status='open'
    and expires_at>now()
  order by created_at desc
  limit 1
  for update;

  if not found then
    insert into public.catalog_sessions(
      customer_id,conversation_id,cart_id,kind,title,status,expires_at,
      metadata,experience,current_view,last_activity_at
    ) values (
      c.customer_id,c.id,v_cart,'personalized','Compra Dona Antônia','open',now()+interval '48 hours',
      jsonb_build_object(
        'entry_source','whatsapp',
        'entry_intent',v_intent,
        'entry_message',v_message,
        'light_chat',true
      ),
      'shopping_room',case when v_intent like 'basket%' then 'baskets' else 'home' end,now()
    ) returning * into s;
  else
    update public.catalog_sessions
       set customer_id=coalesce(c.customer_id,s.customer_id),
           cart_id=coalesce(s.cart_id,v_cart),
           expires_at=greatest(s.expires_at,now()+interval '24 hours'),
           last_activity_at=now(),
           current_view=case when v_intent like 'basket%' then 'baskets' else coalesce(s.current_view,'home') end,
           metadata=coalesce(s.metadata,'{}'::jsonb)||jsonb_build_object(
             'entry_source','whatsapp',
             'entry_intent',v_intent,
             'entry_message',v_message,
             'light_chat',true,
             'reopened_at',now()
           )
     where id=s.id
     returning * into s;
  end if;

  if c.customer_id is not null then
    select name into v_customer_name from public.customers where id=c.customer_id;
  end if;

  insert into public.catalog_events(catalog_session_id,customer_id,event_type,event_data)
  values(s.id,s.customer_id,'catalog_open',jsonb_build_object('source','whatsapp_chat_handoff','intent',v_intent));

  return jsonb_build_object(
    'ok',true,
    'session_id',s.id,
    'token',s.public_token,
    'url','https://donaantonia.com.br/comprar/?s='||s.public_token,
    'customer_name',v_customer_name,
    'entry_intent',v_intent
  );
end;
$$;

revoke all on function public.room_start_for_conversation_v1(uuid,text,text) from public,anon,authenticated;
grant execute on function public.room_start_for_conversation_v1(uuid,text,text) to service_role;

create or replace function public.route_whatsapp_basket_fallback_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  m public.messages%rowtype;
  st public.whatsapp_sales_state%rowtype;
  iid text:=''; normalized text:=''; awaiting text:=''; v_reset boolean:=false;
  v_basket_id uuid; v_basket jsonb; v_body text; v_interactive jsonb; v_queue jsonb;
  v_room jsonb; v_name text; v_first_name text; v_room_url text;
begin
  if new.job_type<>'conversation' or new.status<>'pending' then return new; end if;
  select * into m from public.messages where id=new.message_id and direction='inbound';
  if not found then return new; end if;

  iid:=coalesce(m.ai_interpretation->>'id','');
  normalized:=translate(lower(trim(regexp_replace(coalesce(m.body_text,m.transcript,''),'\\s+',' ','g'))),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc');

  -- Compatibilidade com botões antigos de cesta já emitidos.
  if iid like 'da_basket:%' then
    begin v_basket_id:=substring(iid from length('da_basket:')+1)::uuid; exception when others then return new; end;
    v_basket:=public.create_whatsapp_basket_session_v1(new.conversation_id,v_basket_id);
    v_body:='Você escolheu '||coalesce(v_basket->>'basket_name','essa cesta')||' — R$ '||replace(to_char(coalesce((v_basket->>'basket_price')::numeric,0),'FM999999990.00'),'.',',')||'. Quer finalizar o pedido ou personalizar?';
    v_interactive:=jsonb_build_object('type','button','body',jsonb_build_object('text',left(v_body,1024)),'action',jsonb_build_object('buttons',jsonb_build_array(
      jsonb_build_object('type','reply','reply',jsonb_build_object('id','da_basket_keep','title','Finalizar pedido')),
      jsonb_build_object('type','reply','reply',jsonb_build_object('id','da_basket_customize','title','Personalizar'))
    )));
    perform public.update_whatsapp_sales_state_v1(new.conversation_id,null,null,'basket_selected',null,'basket_personalization_choice');
    v_queue:=public.queue_whatsapp_sales_reply_v1(new.conversation_id,m.id,v_body,'interactive',null,v_interactive,'basket_personalization_choice',jsonb_build_object('basket_id',v_basket_id,'basket_name',v_basket->>'basket_name','basket_price',v_basket->'basket_price','basket_session_id',v_basket->>'session_id','cart_id',v_basket->>'cart_id','storefront_url',v_basket->>'url','fallback',true),1);
    new.status:='done'; new.result:=jsonb_build_object('deterministic',true,'action','basket_selected_followup','basket',v_basket,'queue',v_queue,'flow_fallback',true); new.updated_at:=now(); return new;
  end if;

  select * into st from public.whatsapp_sales_state where conversation_id=new.conversation_id;
  if found then awaiting:=coalesce(st.awaiting,''); end if;

  v_reset:=normalized ~ '(^| )(novo pedido|pedido novo|reiniciar( o)? pedido|recomecar( o)? pedido|comecar( um)? novo pedido|comecar de novo|quero (fazer )?(um )?pedido novo|quero (fazer )?outro pedido|nova compra)( |$)';
  if not v_reset and awaiting<>'' then return new; end if;
  if v_reset then
    perform public.reset_whatsapp_order_context_v1(new.conversation_id,m.id,'explicit_new_order');
  elsif normalized !~ '(^| )(cesta|cestas|cesta basica|cestas basicas)( |$)' then
    return new;
  end if;

  v_room:=public.room_start_for_conversation_v1(new.conversation_id,'baskets',coalesce(m.body_text,m.transcript,''));
  v_room_url:=coalesce(v_room->>'url','');
  if v_room_url='' then return new; end if;
  v_name:=trim(coalesce(v_room->>'customer_name',''));
  v_first_name:=case when v_name='' then '' else split_part(v_name,' ',1) end;

  v_body:=case when v_first_name<>''
    then 'Oi '||v_first_name||'! Aqui consigo te atender melhor e mais rápido. Já deixei nossas cestas abertas para você.'
    else 'Oi! Aqui consigo te atender melhor e mais rápido. Já deixei nossas cestas abertas para você.' end;

  v_interactive:=jsonb_build_object(
    'type','cta_url',
    'body',jsonb_build_object('text',left(v_body,1024)),
    'action',jsonb_build_object(
      'name','cta_url',
      'parameters',jsonb_build_object('display_text','Abrir cestas','url',v_room_url)
    )
  );

  v_queue:=public.queue_whatsapp_sales_reply_v1(
    new.conversation_id,m.id,v_body,'interactive',null,v_interactive,
    'shopping_room_basket_entry',
    jsonb_build_object('shopping_room',true,'room_session_id',v_room->>'session_id','entry_intent','baskets'),
    1
  );

  new.status:='done';
  new.result:=jsonb_build_object('deterministic',true,'action','shopping_room_basket_entry','room',v_room,'queue',v_queue);
  new.updated_at:=now();
  return new;
end;
$$;

revoke all on function public.route_whatsapp_basket_fallback_v1() from public,anon,authenticated;
grant execute on function public.route_whatsapp_basket_fallback_v1() to service_role;

commit;
