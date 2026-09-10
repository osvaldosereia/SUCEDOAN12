-- Dona Antônia — fluxo mínimo de escolha da cesta + retorno seguro da vitrine.
-- Reaproveita carrinho, catálogo, checkout e fila WhatsApp já existentes.

create or replace function public.handle_whatsapp_flow_basket_choice_v1(
  p_session_id uuid,
  p_conversation_id uuid,
  p_action text,
  p_screen text default null,
  p_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  s public.experience_sessions%rowtype;
  v_baskets jsonb := '[]'::jsonb;
  v_basket_id uuid;
  v_basket jsonb;
  v_price text;
begin
  select * into s
  from public.experience_sessions
  where id=p_session_id
  for update;

  if not found or s.conversation_id is distinct from p_conversation_id then
    return jsonb_build_object('ok',false,'reason','flow_session_not_found');
  end if;
  if s.expires_at<=now() or s.status not in ('offered','open') then
    return jsonb_build_object('ok',false,'reason','flow_session_inactive','session_id',s.id);
  end if;

  if p_action='INIT' then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id',b.id::text,
        'title',left(b.display_name||' · R$ '||replace(to_char(b.base_price,'FM999999990.00'),'.',','),80),
        'description','Escolher esta cesta'
      )
      order by b.sort_order,b.display_name
    ),'[]'::jsonb)
    into v_baskets
    from public.get_whatsapp_simple_baskets_v1() b;

    update public.experience_sessions
       set flow_current_screen='CESTAS',
           flow_state_version=flow_state_version+1,
           updated_at=now()
     where id=s.id;

    return jsonb_build_object(
      'ok',true,
      'session_id',s.id,
      'response',jsonb_build_object(
        'screen','CESTAS',
        'data',jsonb_build_object(
          'intro','Escolha a cesta que você quer. Depois você decide se recebe assim ou se prefere personalizar.',
          'baskets',v_baskets
        )
      )
    );
  end if;

  if p_action='data_exchange'
     and coalesce(p_screen,'')='CESTAS'
     and coalesce(p_data->>'trigger','')='basket_selected' then
    if coalesce(s.flow_current_screen,'')<>'CESTAS' then
      return jsonb_build_object(
        'ok',false,'reason','flow_transition_invalid',
        'expected_screen',s.flow_current_screen,'received_screen',p_screen
      );
    end if;

    begin
      v_basket_id := (p_data->>'basket_id')::uuid;
    exception when others then
      return jsonb_build_object('ok',false,'reason','invalid_basket_id');
    end;

    v_basket := public.create_whatsapp_basket_session_v1(p_conversation_id,v_basket_id);
    v_price := 'R$ '||replace(to_char(coalesce((v_basket->>'basket_price')::numeric,0),'FM999999990.00'),'.',',');

    update public.experience_sessions
       set context=coalesce(context,'{}'::jsonb)||jsonb_build_object(
             'basket_id',v_basket_id,
             'basket_name',v_basket->>'basket_name',
             'basket_price',v_basket->'basket_price',
             'basket_storefront_url',v_basket->>'url',
             'basket_catalog_session_id',v_basket->>'session_id',
             'cart_id',v_basket->>'cart_id'
           ),
           cart_id=nullif(v_basket->>'cart_id','')::uuid,
           flow_current_screen='ESCOLHIDA',
           flow_state_version=flow_state_version+1,
           updated_at=now()
     where id=s.id;

    return jsonb_build_object(
      'ok',true,
      'session_id',s.id,
      'response',jsonb_build_object(
        'screen','ESCOLHIDA',
        'data',jsonb_build_object(
          'basket_name',coalesce(v_basket->>'basket_name','Cesta básica'),
          'basket_price',v_price,
          'message','Cesta selecionada. Volte ao WhatsApp e eu te pergunto se quer receber assim ou personalizar.'
        )
      )
    );
  end if;

  return jsonb_build_object(
    'ok',false,'reason','flow_action_not_handled',
    'session_id',s.id,'expected_screen',s.flow_current_screen
  );
end;
$$;

revoke all on function public.handle_whatsapp_flow_basket_choice_v1(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.handle_whatsapp_flow_basket_choice_v1(uuid,uuid,text,text,jsonb) to service_role;

-- Preserva o handler genérico antigo e adiciona somente o roteamento para o novo Flow.
alter function public.handle_whatsapp_flow_exchange_v1(text,text,text,jsonb,text,boolean)
  rename to handle_whatsapp_flow_exchange_legacy_v1;

create or replace function public.handle_whatsapp_flow_exchange_v1(
  p_flow_token text,
  p_action text,
  p_screen text default null,
  p_data jsonb default '{}'::jsonb,
  p_request_fingerprint text default null,
  p_is_replay boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  r jsonb;
  v_definition text;
begin
  r:=public.resolve_whatsapp_flow_token_v1(p_flow_token);
  if not coalesce((r->>'ok')::boolean,false) then
    return jsonb_build_object('ok',false,'reason',r->>'reason');
  end if;

  v_definition:=coalesce(r->>'definition_slug','');

  if v_definition='flow-cestas-escolha-v1' then
    return public.handle_whatsapp_flow_basket_choice_v1(
      (r->>'session_id')::uuid,
      (r->>'conversation_id')::uuid,
      p_action,
      p_screen,
      coalesce(p_data,'{}'::jsonb)
    );
  end if;

  return public.handle_whatsapp_flow_exchange_legacy_v1(
    p_flow_token,p_action,p_screen,p_data,p_request_fingerprint,p_is_replay
  );
end;
$$;

revoke all on function public.handle_whatsapp_flow_exchange_v1(text,text,text,jsonb,text,boolean) from public,anon,authenticated;
grant execute on function public.handle_whatsapp_flow_exchange_v1(text,text,text,jsonb,text,boolean) to service_role;

-- Checkout curto: reaproveita cadastro/endereço/resumo já existentes e reduz mensagens.
create or replace function public.start_whatsapp_basket_checkout_v2(
  p_conversation_id uuid,
  p_source_message_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  c public.conversations%rowtype;
  contact jsonb;
  summary text;
  prompt text;
  src uuid:=p_source_message_id;
  q jsonb;
begin
  select * into c
  from public.conversations
  where id=p_conversation_id
  for update;

  if not found then raise exception 'conversation_not_found'; end if;
  if c.mode='human' or c.human_required then
    return jsonb_build_object('ok',false,'reason','conversation_requires_human');
  end if;
  if c.service_window_expires_at<=now() then
    return jsonb_build_object('ok',false,'reason','conversation_service_window_closed');
  end if;

  if src is null then
    select id into src
    from public.messages
    where conversation_id=p_conversation_id and direction='inbound'
    order by created_at desc
    limit 1;
  end if;

  contact:=public.get_whatsapp_checkout_contact_v1(p_conversation_id);

  if coalesce((contact->>'base_complete')::boolean,false) is not true then
    perform public.update_whatsapp_sales_state_v1(
      p_conversation_id,null,null,'basket_customer_base_data',null,'basket_customer_base_data'
    );

    q:=public.queue_whatsapp_sales_reply_v1(
      p_conversation_id,src,
      E'Para finalizar, envie estes dados em uma única mensagem:\nNome | Rua | Quadra | Casa | Bairro | Cidade\n\nExemplo: Maria Silva | Rua A | 12 | 34 | Centro | Cuiabá',
      'text',null,null,'request_customer_base_data',contact,1
    );

    return jsonb_build_object(
      'ok',true,'step','customer_base_data','queued',true,'queue',q
    );
  end if;

  summary:=public.format_whatsapp_basket_checkout_summary_v1(p_conversation_id);
  prompt:=public.whatsapp_locator_prompt_v1(p_conversation_id);

  perform public.update_whatsapp_sales_state_v1(
    p_conversation_id,null,null,'basket_summary_sent',null,'basket_locator_confirmation'
  );

  q:=public.queue_whatsapp_sales_reply_v1(
    p_conversation_id,src,
    left(summary||E'\n\n'||prompt,4000),
    'text',null,null,'checkout_summary_and_locator',contact,1
  );

  return jsonb_build_object(
    'ok',true,'step','locator_confirmation','queued',true,'queue',q
  );
end;
$$;

revoke all on function public.start_whatsapp_basket_checkout_v2(uuid,uuid) from public,anon,authenticated;
grant execute on function public.start_whatsapp_basket_checkout_v2(uuid,uuid) to service_role;

-- A vitrine não tenta mais abrir o app WhatsApp. Ela salva e a continuação é enviada pelo backend.
create or replace function public.complete_whatsapp_basket_storefront_v1(
  p_public_token text,
  p_intent text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  s public.catalog_sessions%rowtype;
  v_intent text:=lower(trim(coalesce(p_intent,'')));
  v_flow text;
  src uuid;
  checkout jsonb;
  already boolean:=false;
begin
  if p_public_token !~* '^[a-f0-9]{64}$' then
    raise exception 'invalid_token';
  end if;

  select * into s
  from public.catalog_sessions
  where public_token=p_public_token
    and status='open'
    and expires_at>now()
  for update;

  if not found then raise exception 'catalog_session_unavailable'; end if;

  v_flow:=coalesce(s.metadata->>'flow','');
  if (v_flow='basket_basic_v1' and v_intent<>'order')
     or (v_flow='basket_extras_v1' and v_intent<>'extras_done')
     or v_flow not in ('basket_basic_v1','basket_extras_v1') then
    raise exception 'invalid_return_intent';
  end if;

  already :=
    coalesce(s.metadata->>'checkout_return_intent','')=v_intent
    and nullif(s.metadata->>'checkout_return_queued_at','') is not null;

  if already then
    return jsonb_build_object(
      'ok',true,'duplicate',true,'queued',true,
      'conversation_id',s.conversation_id,'intent',v_intent
    );
  end if;

  perform public.mark_whatsapp_basket_return_v1(p_public_token,v_intent);

  select id into src
  from public.messages
  where conversation_id=s.conversation_id and direction='inbound'
  order by created_at desc
  limit 1;

  checkout:=public.start_whatsapp_basket_checkout_v2(s.conversation_id,src);

  update public.catalog_sessions
     set metadata=metadata||jsonb_build_object(
           'checkout_return_intent',v_intent,
           'checkout_return_queued_at',now()
         ),
         current_view='returning',
         last_activity_at=now()
   where id=s.id;

  return jsonb_build_object(
    'ok',coalesce((checkout->>'ok')::boolean,false),
    'duplicate',false,
    'queued',coalesce((checkout->>'queued')::boolean,false),
    'conversation_id',s.conversation_id,
    'intent',v_intent,
    'next_step',checkout->>'step'
  );
end;
$$;

revoke all on function public.complete_whatsapp_basket_storefront_v1(text,text) from public,anon,authenticated;
grant execute on function public.complete_whatsapp_basket_storefront_v1(text,text) to service_role;

-- Pós-Flow: pergunta somente uma coisa, com dois botões.
alter function public.process_whatsapp_flow_nfm_reply_v1(uuid,uuid,jsonb)
  rename to process_whatsapp_flow_nfm_reply_legacy_v1;

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
  v_hash text;
  s public.experience_sessions%rowtype;
  d public.experience_definitions%rowtype;
  v_duplicate boolean:=false;
  v_body text;
  v_interactive jsonb;
  v_queue jsonb;
begin
  if length(v_token)<32 or length(v_token)>200 then
    return public.process_whatsapp_flow_nfm_reply_legacy_v1(
      p_conversation_id,p_message_id,p_response
    );
  end if;

  v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');

  select * into s
  from public.experience_sessions
  where flow_token_hash=v_hash;

  if not found then
    return public.process_whatsapp_flow_nfm_reply_legacy_v1(
      p_conversation_id,p_message_id,p_response
    );
  end if;

  select * into d from public.experience_definitions where id=s.definition_id;

  if not found or d.slug<>'flow-cestas-escolha-v1' then
    return public.process_whatsapp_flow_nfm_reply_legacy_v1(
      p_conversation_id,p_message_id,p_response
    );
  end if;

  if s.conversation_id is distinct from p_conversation_id then
    return jsonb_build_object('ok',false,'reason','flow_conversation_mismatch');
  end if;

  if p_message_id is not null then
    select exists(
      select 1
      from public.experience_events e
      where e.session_id=s.id
        and e.event_type='basket_choice_nfm_reply'
        and e.event_data->>'message_id'=p_message_id::text
    ) into v_duplicate;
  end if;

  if not v_duplicate then
    perform public.update_whatsapp_sales_state_v1(
      p_conversation_id,null,null,'basket_selected',null,'basket_personalization_choice'
    );

    v_body:='Você escolheu '||coalesce(s.context->>'basket_name','essa cesta')
      ||' — R$ '||replace(
        to_char(coalesce((s.context->>'basket_price')::numeric,0),'FM999999990.00'),
        '.',','
      )||'. Quer receber assim ou prefere personalizar?';

    v_interactive:=jsonb_build_object(
      'type','button',
      'body',jsonb_build_object('text',left(v_body,1024)),
      'action',jsonb_build_object(
        'buttons',jsonb_build_array(
          jsonb_build_object(
            'type','reply',
            'reply',jsonb_build_object('id','da_basket_keep','title','Quero assim')
          ),
          jsonb_build_object(
            'type','reply',
            'reply',jsonb_build_object('id','da_basket_customize','title','Personalizar')
          )
        )
      )
    );

    v_queue:=public.queue_whatsapp_sales_reply_v1(
      p_conversation_id,p_message_id,v_body,'interactive',null,v_interactive,
      'basket_personalization_choice',
      jsonb_build_object(
        'flow_session_id',s.id,
        'basket_id',s.context->>'basket_id',
        'basket_name',s.context->>'basket_name'
      ),
      1
    );

    insert into public.experience_events(
      conversation_id,session_id,definition_id,event_type,interface_type,event_data
    )
    values(
      p_conversation_id,s.id,s.definition_id,'basket_choice_nfm_reply','whatsapp_flow',
      jsonb_build_object(
        'message_id',p_message_id,
        'action',coalesce(p_response->>'action','basket_selected'),
        'followup','basket_personalization_choice',
        'queued',true
      )
    );
  end if;

  return jsonb_build_object(
    'ok',true,
    'session_id',s.id,
    'definition_slug',d.slug,
    'return_to_chat',false,
    'duplicate',v_duplicate,
    'followup_queued',not v_duplicate
  );
end;
$$;

revoke all on function public.process_whatsapp_flow_nfm_reply_v1(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.process_whatsapp_flow_nfm_reply_v1(uuid,uuid,jsonb) to service_role;

-- Responde aos dois botões sem depender de IA generativa.
create or replace function public.route_whatsapp_basket_personalization_choice_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  m public.messages%rowtype;
  st public.whatsapp_sales_state%rowtype;
  iid text:='';
  normalized text:='';
  flow jsonb;
  token text;
  url text;
  basket_name text;
  interactive jsonb;
  result jsonb;
begin
  if new.job_type<>'conversation' or new.status<>'pending' then return new; end if;

  select * into m
  from public.messages
  where id=new.message_id and direction='inbound';

  if not found then return new; end if;

  select * into st
  from public.whatsapp_sales_state
  where conversation_id=new.conversation_id;

  if not found or coalesce(st.awaiting,'')<>'basket_personalization_choice' then
    return new;
  end if;

  iid:=coalesce(m.ai_interpretation->>'id','');
  normalized:=translate(
    lower(trim(regexp_replace(coalesce(m.body_text,m.transcript,''),'\s+',' ','g'))),
    'áàãâäéèêëíìîïóòõôöúùûüç',
    'aaaaaeeeeiiiiooooouuuuc'
  );

  if iid='da_basket_keep'
     or normalized ~ '(^| )(quero assim|pode ser assim|sem alterar|sem personalizar|essa mesma|essa cesta)( |$)' then
    result:=public.start_whatsapp_basket_checkout_v2(new.conversation_id,m.id);
    new.status:='done';
    new.result:=jsonb_build_object(
      'deterministic',true,'action','basket_keep_and_checkout','checkout',result
    );
    new.updated_at:=now();
    return new;
  end if;

  if iid='da_basket_customize'
     or normalized ~ '(^| )(personalizar|quero personalizar|alterar cesta|mudar produtos|trocar produtos)( |$)' then
    flow:=public.get_whatsapp_basket_flow_state_v1(new.conversation_id);
    token:=flow->'basket_session'->>'token';
    basket_name:=coalesce(flow->'basket'->>'name','sua cesta');

    if token !~* '^[a-f0-9]{64}$' then
      return new;
    end if;

    url:='https://donaantonia.com.br/cesta/?t='||token;

    interactive:=jsonb_build_object(
      'type','cta_url',
      'body',jsonb_build_object(
        'text','Perfeito. Abra a cesta para trocar, retirar ou aumentar produtos. Quando terminar, eu continuo a finalização com você no WhatsApp.'
      ),
      'action',jsonb_build_object(
        'name','cta_url',
        'parameters',jsonb_build_object(
          'display_text','Personalizar',
          'url',url
        )
      )
    );

    perform public.update_whatsapp_sales_state_v1(
      new.conversation_id,null,null,'basket_storefront_opened',null,'basket_storefront_return'
    );

    perform public.queue_whatsapp_sales_reply_v1(
      new.conversation_id,m.id,
      'Perfeito. Abra a cesta para personalizar.',
      'interactive',null,interactive,'basket_storefront_link',
      jsonb_build_object('url',url,'basket_name',basket_name),1
    );

    new.status:='done';
    new.result:=jsonb_build_object(
      'deterministic',true,'action','basket_storefront_link','url',url
    );
    new.updated_at:=now();
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_01_whatsapp_basket_personalization_choice_v1 on public.ai_jobs;
create trigger trg_01_whatsapp_basket_personalization_choice_v1
before insert on public.ai_jobs
for each row execute function public.route_whatsapp_basket_personalization_choice_v1();

-- Intercepta intenção de cesta antes do Flow comercial antigo e usa o Flow curto.
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
begin
  if new.job_type<>'conversation' or new.status<>'pending' then return new; end if;

  select * into m
  from public.messages
  where id=new.message_id and direction='inbound';
  if not found then return new; end if;

  normalized:=translate(
    lower(trim(regexp_replace(coalesce(m.body_text,m.transcript,''),'\s+',' ','g'))),
    'áàãâäéèêëíìîïóòõôöúùûüç',
    'aaaaaeeeeiiiiooooouuuuc'
  );

  select coalesce(s.awaiting,'') into awaiting
  from public.whatsapp_sales_state s
  where s.conversation_id=new.conversation_id;
  if not found then awaiting:=''; end if;

  v_reset:=normalized ~ '(^| )(novo pedido|pedido novo|reiniciar( o)? pedido|recomecar( o)? pedido|comecar( um)? novo pedido|comecar de novo|quero (fazer )?(um )?pedido novo|quero (fazer )?outro pedido|nova compra)( |$)';

  if not v_reset and awaiting<>'' then return new; end if;

  if v_reset then
    perform public.reset_whatsapp_order_context_v1(new.conversation_id,m.id,'explicit_new_order');
  elsif normalized !~ '(^| )(cesta|cestas|cesta basica|cestas basicas)( |$)' then
    return new;
  end if;

  v_body:='Escolha sua cesta básica. Depois eu te pergunto se quer receber assim ou personalizar.';

  v_flow:=public.queue_whatsapp_flow_offer_v1(
    new.conversation_id,
    m.id,
    'flow-cestas-escolha-v1',
    null,
    v_body,
    jsonb_build_object(
      'entry_reason',case when v_reset then 'new_order_reset' else 'basket_intent' end,
      'experience','minimal_basket_choice_v1'
    )
  );

  new.status:='done';
  new.result:=jsonb_build_object(
    'deterministic',true,'action','basket_choice_flow','flow',v_flow
  );
  new.updated_at:=now();
  return new;
end;
$$;

drop trigger if exists trg_000_whatsapp_basket_choice_flow_v1 on public.ai_jobs;
create trigger trg_000_whatsapp_basket_choice_flow_v1
before insert on public.ai_jobs
for each row execute function public.route_whatsapp_basket_choice_flow_v1();

-- Ajusta a orientação da IA para o novo caminho, sem aumentar prompt base.
update public.service_guidance_rules
   set instruction=
     'Quando o cliente demonstrar intenção de comprar ou conhecer cestas básicas, use o Flow curto de escolha da cesta imediatamente, sem perguntas intermediárias. Depois da escolha, pergunte uma única vez se quer receber a cesta assim ou personalizar. Se quiser personalizar, envie o botão da vitrine contextual da cesta já selecionada; não monte alterações de cesta em texto. Se quiser receber assim, siga direto para o checkout no WhatsApp. A composição pode ser mostrada sem preços individuais. Nunca invente quantidade de cestas: use somente as ativas retornadas pelo sistema.',
       behavior_tags=array['mvp_whatsapp','basket','simple_flow','minimal_interactions','flow','storefront'],
       version_no=version_no+1,
       updated_at=now()
 where rule_key='basket_simple_sales_flow'
   and status='published';

insert into public.experience_definitions(
  slug,feature_key,experience_type,purpose,status,provider,provider_id,provider_version,schema_version,config,metadata
)
values(
  'flow-cestas-escolha-v1',
  'flow_basket_commercial',
  'whatsapp_flow',
  'Escolher rapidamente uma cesta e voltar ao WhatsApp para decidir entre receber como está ou personalizar na vitrine.',
  'draft',
  'meta_whatsapp',
  null,
  '7.1',
  1,
  jsonb_build_object(
    'data_api_version','3.0',
    'endpoint_uri','https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/whatsapp-flow-data-exchange-v1'
  ),
  jsonb_build_object(
    'candidate_not_live',true,
    'customer_exposure',false,
    'default_for_new_sessions',false,
    'source_flow_json','whatsapp/flows/flow-cestas-escolha-v1.json',
    'implementation_stage','backend_ready_before_meta_publish'
  )
)
on conflict (slug) do update set
  purpose=excluded.purpose,
  provider_version=excluded.provider_version,
  config=excluded.config,
  metadata=public.experience_definitions.metadata||excluded.metadata,
  updated_at=now();
