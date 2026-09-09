-- V28 hardening: preserve a server-only product id for image caching, extend nfm_reply
-- completion support to the V5 candidate, and persist Meta validation metadata.

create or replace function public.get_whatsapp_flow_nav_product_detail_v1(
  p_product_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_product jsonb;
  v_stock integer;
  v_qty jsonb;
  v_meta text;
begin
  v_product:=public.get_whatsapp_sellable_product_v1(p_product_id);
  if v_product is null then return jsonb_build_object('ok',false,'reason','product_not_sellable'); end if;
  v_stock:=greatest(0,floor(coalesce((v_product->>'stock')::numeric,0))::integer);
  if v_stock<1 then return jsonb_build_object('ok',false,'reason','product_out_of_stock'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',g::text,'title',case when g=1 then '1 unidade' else g::text||' unidades' end) order by g),'[]'::jsonb)
    into v_qty from generate_series(1,least(6,v_stock)) g;
  v_meta:=concat_ws(' · ',nullif(trim(coalesce(v_product->>'brand','')),''),nullif(trim(coalesce(v_product->>'packaging','')),''));
  return jsonb_build_object(
    'ok',true,
    'product_id',p_product_id::text,
    'product_name',left(coalesce(v_product->>'name','Produto'),120),
    'product_price','R$ '||replace(to_char(coalesce((v_product->>'price')::numeric,0),'FM999999990.00'),'.',','),
    'product_meta',left(coalesce(v_meta,''),120),
    'product_description','Confira o produto e escolha a quantidade antes de adicionar ao pedido.',
    'product_image_url',left(coalesce(v_product->>'image_url',''),2000),
    'product_image_base64','',
    'has_product_image',false,
    'quantity_options',v_qty,
    'init_values',jsonb_build_object('quantity','1'),
    'stock',v_stock
  );
end;
$$;
revoke all on function public.get_whatsapp_flow_nav_product_detail_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_nav_product_detail_v1(uuid) to service_role;

create or replace function public.process_whatsapp_flow_nfm_reply_v1(
  p_conversation_id uuid,
  p_message_id uuid,
  p_response jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_token text:=trim(coalesce(p_response->>'flow_token',''));
  v_hash text;
  s public.experience_sessions%rowtype;
  d public.experience_definitions%rowtype;
  v_definition text;
  v_action text:=lower(trim(coalesce(p_response->>'action',p_response->>'result','completed')));
  v_order_id uuid;
  v_order public.orders%rowtype;
  v_duplicate boolean:=false;
begin
  if length(v_token)<32 or length(v_token)>200 then return jsonb_build_object('ok',false,'reason','invalid_flow_token'); end if;
  v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');
  select * into s from public.experience_sessions where flow_token_hash=v_hash;
  if not found then return jsonb_build_object('ok',false,'reason','flow_session_not_found'); end if;
  if s.conversation_id is distinct from p_conversation_id then return jsonb_build_object('ok',false,'reason','flow_conversation_mismatch'); end if;
  if s.status not in ('offered','open','completed') then return jsonb_build_object('ok',false,'reason','flow_session_inactive','session_id',s.id); end if;
  select * into d from public.experience_definitions where id=s.definition_id;
  if not found then return jsonb_build_object('ok',false,'reason','flow_definition_not_found'); end if;
  v_definition:=coalesce(d.slug,'');
  if v_definition not in ('flow-cestas-comercial-v1','flow-cestas-comercial-v2','flow-cestas-comercial-v3','flow-cestas-comercial-v4','flow-cestas-comercial-v5') then
    return jsonb_build_object('ok',false,'reason','unsupported_flow_definition');
  end if;
  if p_message_id is not null then
    select exists(select 1 from public.experience_events e where e.session_id=s.id and e.event_type='flow_nfm_reply' and e.event_data->>'message_id'=p_message_id::text) into v_duplicate;
  end if;
  begin v_order_id:=nullif(trim(coalesce(s.context->>'flow_order_id','')),'')::uuid; exception when others then v_order_id:=null; end;
  if v_order_id is not null then
    select * into v_order from public.orders where id=v_order_id and conversation_id=p_conversation_id and status='confirmed' and confirmed_at is not null and coalesce(total,0)>0;
    if not found then v_order_id:=null; end if;
  end if;
  if not v_duplicate then
    insert into public.experience_events(conversation_id,session_id,definition_id,event_type,interface_type,event_data)
    values(p_conversation_id,s.id,s.definition_id,'flow_nfm_reply','whatsapp_flow',jsonb_build_object(
      'message_id',p_message_id,'action',v_action,'definition_slug',v_definition,
      'session_status',s.status,'has_confirmed_order',v_order_id is not null,
      'order_id',v_order_id,'return_to_chat',true
    ));
  end if;
  return jsonb_build_object(
    'ok',true,'session_id',s.id,'definition_slug',v_definition,'action',v_action,
    'order_id',v_order_id,'return_to_chat',true,'duplicate',v_duplicate,
    'location_required',(v_order_id is not null and not v_duplicate),
    'reply_text',case when v_duplicate then null when v_order_id is not null
      then 'Pedido confirmado. Agora envie sua localização pelo WhatsApp para confirmar o ponto da entrega. 📍'
      else 'Recebi suas escolhas. Vamos continuar por aqui.' end
  );
end;
$$;
revoke all on function public.process_whatsapp_flow_nfm_reply_v1(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.process_whatsapp_flow_nfm_reply_v1(uuid,uuid,jsonb) to service_role;

update public.experience_definitions
set provider_id='1562977688342506',
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'meta_flow_name','Dona Antônia - Cestas Comercial V5 Homologação',
      'meta_validation_success',true,
      'meta_validation_errors','[]'::jsonb,
      'candidate_not_live',true,
      'default_for_new_sessions',false
    ),
    updated_at=now()
where slug='flow-cestas-comercial-v5';
