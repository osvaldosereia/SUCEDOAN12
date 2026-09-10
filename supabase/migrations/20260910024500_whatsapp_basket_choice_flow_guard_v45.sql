create or replace function public.route_whatsapp_basket_choice_flow_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  m public.messages%rowtype;
  normalized text:='';
  awaiting text:='';
  v_reset boolean:=false;
  v_flow jsonb;
  v_body text;
  cfg public.automation_config%rowtype;
  d public.experience_definitions%rowtype;
begin
  if new.job_type<>'conversation' or new.status<>'pending' then return new; end if;
  select * into cfg from public.automation_config where id=1;
  select * into d from public.experience_definitions where slug='flow-cestas-escolha-v1';
  if not found
     or d.status not in ('ready','active')
     or nullif(d.provider_id,'') is null
     or coalesce(cfg.experience_orchestrator_enabled,false) is false
     or coalesce(cfg.whatsapp_flow_data_exchange_enabled,false) is false
     or coalesce(cfg.whatsapp_flow_send_enabled,false) is false then
    return new;
  end if;
  select * into m from public.messages where id=new.message_id and direction='inbound';
  if not found then return new; end if;
  normalized:=translate(lower(trim(regexp_replace(coalesce(m.body_text,m.transcript,''),'\s+',' ','g'))),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc');
  select coalesce(s.awaiting,'') into awaiting from public.whatsapp_sales_state s where s.conversation_id=new.conversation_id;
  if not found then awaiting:=''; end if;
  v_reset:=normalized ~ '(^| )(novo pedido|pedido novo|reiniciar( o)? pedido|recomecar( o)? pedido|comecar( um)? novo pedido|comecar de novo|quero (fazer )?(um )?pedido novo|quero (fazer )?outro pedido|nova compra)( |$)';
  if not v_reset and awaiting<>'' then return new; end if;
  if v_reset then
    perform public.reset_whatsapp_order_context_v1(new.conversation_id,m.id,'explicit_new_order');
  elsif normalized !~ '(^| )(cesta|cestas|cesta basica|cestas basicas)( |$)' then
    return new;
  end if;
  v_body:='Escolha sua cesta básica. Depois eu te pergunto se quer receber assim ou personalizar.';
  v_flow:=public.queue_whatsapp_flow_offer_v1(new.conversation_id,m.id,'flow-cestas-escolha-v1',null,v_body,jsonb_build_object('entry_reason',case when v_reset then 'new_order_reset' else 'basket_intent' end,'experience','minimal_basket_choice_v1'));
  new.status:='done';
  new.result:=jsonb_build_object('deterministic',true,'action','basket_choice_flow','flow',v_flow);
  new.updated_at:=now();
  return new;
end;
$$;

update public.service_guidance_rules
set instruction='Quando o cliente demonstrar intenção de comprar ou conhecer cestas básicas, abra imediatamente o seletor estruturado disponível, sem perguntas intermediárias. O caminho preferencial é o Flow curto de escolha da cesta; enquanto ele não estiver disponível, use a lista interativa estável. Depois da escolha, pergunte uma única vez se quer receber a cesta assim ou personalizar. Se quiser personalizar, envie o botão da vitrine contextual da cesta já selecionada; não monte alterações de cesta em texto. Se quiser receber assim, siga direto para o checkout no WhatsApp. A composição pode ser mostrada sem preços individuais. Nunca invente cestas: use somente as ativas retornadas pelo sistema.',
    behavior_tags=array['mvp_whatsapp','basket','simple_flow','minimal_interactions','flow','fallback_safe','storefront'],
    version_no=version_no+1,
    updated_at=now()
where rule_key='basket_simple_sales_flow' and status='published';
