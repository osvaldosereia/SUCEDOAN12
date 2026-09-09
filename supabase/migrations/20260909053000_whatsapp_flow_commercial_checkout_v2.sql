begin;

create or replace function public.get_whatsapp_flow_basket_editor_v1(p_basket_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  b public.basket_templates%rowtype;
  v_items jsonb;
  v_selection jsonb;
  v_summary text;
begin
  select * into b from public.basket_templates where id=p_basket_id and is_active=true and is_whatsapp_active=true;
  if not found then raise exception 'basket_not_available'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id::text,
    'title',left(p.name,72),
    'description',case
      when not bi.quantity_editable then 'Qtd. fixa: '||trim(to_char(bi.quantity,'FM999990D##'))
      when bi.removable then 'Atual: '||trim(to_char(bi.quantity,'FM999990D##'))||' · pode retirar'
      else 'Atual: '||trim(to_char(bi.quantity,'FM999990D##'))
    end
  ) order by bi.sort_order,p.name),'[]'::jsonb),
  coalesce(jsonb_agg(jsonb_build_object('product_id',p.id,'quantity',bi.quantity) order by bi.sort_order,p.name),'[]'::jsonb),
  coalesce(string_agg(trim(to_char(bi.quantity,'FM999990D##'))||' × '||p.name,E'\n' order by bi.sort_order,p.name),'')
  into v_items,v_selection,v_summary
  from public.basket_template_items bi
  join public.products p on p.id=bi.product_id
  where bi.basket_id=b.id;

  return jsonb_build_object(
    'basket_id',b.id,
    'basket_name',b.name,
    'basket_price','R$ '||replace(to_char(b.base_price,'FM999999990.00'),'.',','),
    'items',v_items,
    'selection',v_selection,
    'summary',v_summary,
    'actions',jsonb_build_array(
      jsonb_build_object('id','edit','title','Alterar um item'),
      jsonb_build_object('id','continue','title','Concluir personalização')
    ),
    'quantities',(
      select jsonb_agg(jsonb_build_object('id',g::text,'title',g::text) order by g)
      from generate_series(0,20) g
    ),
    'policy',jsonb_build_object('component_prices_visible',false,'backend_validation_required',true)
  );
end;
$$;

create or replace function public.patch_whatsapp_flow_basket_selection_v1(
  p_basket_id uuid,
  p_selection jsonb,
  p_product_id uuid,
  p_quantity numeric
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_base jsonb;
  v_next jsonb:='[]'::jsonb;
  x jsonb;
  v_found boolean:=false;
  v_valid jsonb;
begin
  if jsonb_typeof(coalesce(p_selection,'null'::jsonb))<>'array' then
    v_base:=public.get_whatsapp_flow_basket_editor_v1(p_basket_id)->'selection';
  else
    v_base:=p_selection;
  end if;
  for x in select value from jsonb_array_elements(v_base) loop
    if coalesce(x->>'product_id','')=p_product_id::text then
      v_next:=v_next||jsonb_build_array(jsonb_build_object('product_id',p_product_id,'quantity',p_quantity));
      v_found:=true;
    else
      v_next:=v_next||jsonb_build_array(jsonb_build_object('product_id',x->>'product_id','quantity',x->>'quantity'));
    end if;
  end loop;
  if not v_found then raise exception 'basket_component_not_found'; end if;
  v_valid:=public.validate_basket_flow_selection_v1(p_basket_id,v_next);
  if not coalesce((v_valid->>'valid')::boolean,false) then return v_valid; end if;
  return jsonb_build_object('valid',true,'selection',v_valid->'normalized','summary',(
    select coalesce(string_agg(trim(to_char((e->>'quantity')::numeric,'FM999990D##'))||' × '||coalesce(e->>'name',''),E'\n'),'')
    from jsonb_array_elements(v_valid->'normalized') e where (e->>'quantity')::numeric>0
  ));
end;
$$;

create or replace function public.format_whatsapp_flow_cart_review_v1(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_cart jsonb:=public.get_whatsapp_sales_cart_v1(p_conversation_id);
  v_summary text;
  v_total numeric;
begin
  if not coalesce((v_cart->>'exists')::boolean,false) then
    return jsonb_build_object('exists',false,'summary','Nenhum pedido iniciado.','total','R$ 0,00','cart',v_cart);
  end if;
  select coalesce(string_agg(trim(to_char((e->>'quantity')::numeric,'FM999990D##'))||' × '||coalesce(e->>'name',''),E'\n'),'')
    into v_summary from jsonb_array_elements(coalesce(v_cart->'items','[]'::jsonb)) e
   where coalesce((e->>'quantity')::numeric,0)>0;
  v_total:=coalesce((v_cart->>'total')::numeric,0);
  return jsonb_build_object(
    'exists',true,
    'summary',v_summary,
    'total','R$ '||replace(to_char(v_total,'FM999999990.00'),'.',','),
    'pricing_note','A cesta possui preço comercial próprio. Os componentes da cesta não exibem preço individual.',
    'cart',v_cart
  );
end;
$$;

create or replace function public.finalize_whatsapp_flow_commercial_order_v1(
  p_session_id uuid,
  p_expected_state_version integer,
  p_operation_key text,
  p_payment_method text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  a public.automation_config%rowtype;
  s public.experience_sessions%rowtype;
  c public.conversations%rowtype;
  v_cart jsonb;
  v_customer jsonb;
  v_address jsonb;
  v_order jsonb;
  v_method text:=lower(trim(coalesce(p_payment_method,'')));
  v_key text:=trim(coalesce(p_operation_key,''));
begin
  select * into a from public.automation_config where id=1;
  if not coalesce(a.whatsapp_flow_commercial_write_enabled,false) then raise exception 'whatsapp_flow_commercial_write_disabled'; end if;
  if not a.experience_orchestrator_enabled then raise exception 'experience_orchestrator_disabled'; end if;
  if not a.whatsapp_flow_data_exchange_enabled then raise exception 'whatsapp_flow_data_exchange_disabled'; end if;
  if not a.whatsapp_flow_send_enabled then raise exception 'whatsapp_flow_send_disabled'; end if;
  if v_key !~ '^[A-Za-z0-9:_-]{8,180}$' then raise exception 'invalid_operation_key'; end if;
  if v_method not in ('pix','dinheiro','cartao_entrega') then raise exception 'invalid_payment_method'; end if;

  select * into s from public.experience_sessions where id=p_session_id for update;
  if not found or s.status not in ('offered','open') or s.expires_at<=now() then raise exception 'experience_session_inactive'; end if;
  if s.flow_state_version is distinct from p_expected_state_version then raise exception 'flow_state_version_conflict'; end if;
  select * into c from public.conversations where id=s.conversation_id for update;
  if not found then raise exception 'conversation_not_found'; end if;
  if c.human_required or c.mode='human' then raise exception 'conversation_requires_human'; end if;

  v_customer:=public.get_whatsapp_basket_customer_status_v1(c.id);
  if not coalesce((v_customer->>'registered')::boolean,false) then raise exception 'customer_registration_incomplete'; end if;
  v_address:=v_customer->'address';
  v_cart:=public.get_whatsapp_sales_cart_v1(c.id);
  if not coalesce((v_cart->>'exists')::boolean,false) then raise exception 'cart_not_started'; end if;

  v_order:=public.confirm_cart_order_v2((v_cart->>'cart_id')::uuid,v_address,'flow-order:'||v_key);
  update public.experience_sessions
     set context=coalesce(context,'{}'::jsonb)||jsonb_build_object(
       'flow_payment_method',v_method,
       'flow_checkout_notes',nullif(left(trim(coalesce(p_notes,'')),1000),''),
       'flow_order_id',v_order->>'order_id',
       'flow_order_confirmed_at',now()
     ),
     status='completed',
     completed_at=coalesce(completed_at,now()),
     updated_at=now()
   where id=s.id;

  return jsonb_build_object(
    'ok',true,
    'order',v_order,
    'payment_method',v_method,
    'next_step','send_location_in_chat',
    'bling_queued',false
  );
end;
$$;

create or replace function public.process_whatsapp_flow_nfm_reply_v1(
  p_conversation_id uuid,
  p_message_id uuid,
  p_response jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_token text:=trim(coalesce(p_response->>'flow_token',''));
  v_resolved jsonb;
  v_session uuid;
  v_definition text;
  v_action text:=lower(trim(coalesce(p_response->>'action',p_response->>'result','completed')));
  v_order_id text;
begin
  if v_token='' then return jsonb_build_object('ok',false,'reason','flow_token_missing'); end if;
  v_resolved:=public.resolve_whatsapp_flow_token_v1(v_token);
  if not coalesce((v_resolved->>'ok')::boolean,false) then return v_resolved; end if;
  if (v_resolved->>'conversation_id')::uuid is distinct from p_conversation_id then return jsonb_build_object('ok',false,'reason','flow_conversation_mismatch'); end if;
  v_session:=(v_resolved->>'session_id')::uuid;
  v_definition:=coalesce(v_resolved->>'definition_slug','');
  if v_definition<>'flow-cestas-comercial-v1' then return jsonb_build_object('ok',false,'reason','unsupported_flow_definition'); end if;

  select context->>'flow_order_id' into v_order_id from public.experience_sessions where id=v_session;
  insert into public.experience_events(conversation_id,session_id,definition_id,event_type,interface_type,event_data)
  select es.conversation_id,es.id,es.definition_id,'flow_nfm_reply','whatsapp_flow',jsonb_build_object(
    'message_id',p_message_id,
    'action',v_action,
    'has_order',v_order_id is not null,
    'return_to_chat',true
  ) from public.experience_sessions es where es.id=v_session;

  return jsonb_build_object(
    'ok',true,
    'session_id',v_session,
    'action',v_action,
    'order_id',v_order_id,
    'return_to_chat',true,
    'reply_text',case when v_order_id is not null then 'Pedido confirmado. Agora envie sua localização pelo WhatsApp para confirmar o ponto da entrega. 📍' else 'Recebi suas escolhas. Vamos continuar por aqui.' end
  );
end;
$$;

revoke all on function public.get_whatsapp_flow_basket_editor_v1(uuid) from public,anon,authenticated;
revoke all on function public.patch_whatsapp_flow_basket_selection_v1(uuid,jsonb,uuid,numeric) from public,anon,authenticated;
revoke all on function public.format_whatsapp_flow_cart_review_v1(uuid) from public,anon,authenticated;
revoke all on function public.finalize_whatsapp_flow_commercial_order_v1(uuid,integer,text,text,text) from public,anon,authenticated;
revoke all on function public.process_whatsapp_flow_nfm_reply_v1(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_basket_editor_v1(uuid) to service_role;
grant execute on function public.patch_whatsapp_flow_basket_selection_v1(uuid,jsonb,uuid,numeric) to service_role;
grant execute on function public.format_whatsapp_flow_cart_review_v1(uuid) to service_role;
grant execute on function public.finalize_whatsapp_flow_commercial_order_v1(uuid,integer,text,text,text) to service_role;
grant execute on function public.process_whatsapp_flow_nfm_reply_v1(uuid,uuid,jsonb) to service_role;

commit;