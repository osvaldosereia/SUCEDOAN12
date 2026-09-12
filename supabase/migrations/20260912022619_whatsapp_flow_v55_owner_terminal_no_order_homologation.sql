begin;

create or replace function public.handle_whatsapp_flow_commercial_exchange_v26(
  p_session_id uuid,
  p_conversation_id uuid,
  p_action text,
  p_screen text default null,
  p_data jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  s public.experience_sessions%rowtype;
  d public.experience_definitions%rowtype;
  c public.conversations%rowtype;
  a public.automation_config%rowtype;
  v_trigger text:=coalesce(p_data->>'trigger','');
  v_intent text:=left(trim(coalesce(p_data->>'ai_intent',p_data->>'intent','')),120);
  v_round text:='A';
  v_resolved jsonb;
  v_nav jsonb;
  v_query text;
  v_title text;
  v_product_ids jsonb;
  v_count integer:=0;
  v_next_version integer;
  v_base jsonb;
  v_preview jsonb;
  v_payment text:=lower(trim(coalesce(p_data->>'payment_method','')));
  v_payment_label text;
begin
  -- V55 keeps the V26 deterministic runtime, but allows the owner-only
  -- homologation to prove the terminal UI without creating a real order.
  if not (
    p_action='data_exchange'
    and coalesce(p_screen,'') ~ '^(MENU|TERMOS)_[A-L]$'
    and v_trigger='ai_intent_open_v1'
    and v_intent<>''
  ) then
    v_base:=public.handle_whatsapp_flow_commercial_exchange_v25(
      p_session_id,p_conversation_id,p_action,p_screen,p_data
    );

    if not coalesce((v_base->>'ok')::boolean,false)
       or coalesce(v_base#>>'{response,screen}','')<>'FALHA_FINALIZACAO' then
      return v_base;
    end if;

    select * into s
    from public.experience_sessions
    where id=p_session_id and conversation_id=p_conversation_id
    for update;
    if not found or s.status not in ('offered','open') or s.expires_at<=now() then return v_base; end if;

    select * into d from public.experience_definitions where id=s.definition_id;
    if not found
       or d.slug<>'flow-cestas-comercial-v8-stable'
       or d.status<>'ready'
       or coalesce((d.metadata->>'candidate_not_live')::boolean,false) is not true
       or coalesce((d.metadata->>'customer_exposure')::boolean,true) is not false
       or coalesce((d.metadata->>'created_for_owner_homologation')::boolean,false) is not true then
      return v_base;
    end if;

    if coalesce((s.context->>'homologation_test')::boolean,false) is not true
       or coalesce((s.context->>'requested_by_owner')::boolean,false) is not true
       or coalesce(s.context->>'test_recipient','')='' then
      return v_base;
    end if;

    select * into c from public.conversations where id=p_conversation_id;
    if not found or c.wa_contact_e164 is distinct from s.context->>'test_recipient' then return v_base; end if;
    if not exists(
      select 1 from public.whatsapp_test_allowlist w
      where w.phone_e164=c.wa_contact_e164
        and w.enabled
        and w.purpose='controlled_live_homologation'
        and (w.expires_at is null or w.expires_at>now())
    ) then return v_base; end if;

    select * into a from public.automation_config where id=1;
    if coalesce(a.whatsapp_live_canary_percent,0)<>1
       or coalesce(a.experience_orchestrator_enabled,false)
       or coalesce(a.whatsapp_flow_data_exchange_enabled,false)
       or coalesce(a.whatsapp_flow_send_enabled,false)
       or coalesce(a.whatsapp_flow_commercial_write_enabled,false)
       or coalesce(a.bling_order_sync_enabled,false) then
      return v_base;
    end if;

    if v_payment not in ('pix','dinheiro','cartao_entrega','cartao_alimentacao') then return v_base; end if;
    v_preview:=public.format_whatsapp_flow_session_preview_v2(p_session_id);
    if not coalesce((v_preview->>'ok')::boolean,false)
       or nullif(trim(coalesce(v_preview->>'total','')),'') is null
       or nullif(trim(coalesce(v_preview->>'summary','')),'') is null then
      return v_base;
    end if;

    v_payment_label:=case v_payment
      when 'pix' then 'PIX na entrega'
      when 'dinheiro' then 'Dinheiro na entrega'
      when 'cartao_entrega' then 'Cartão na entrega'
      when 'cartao_alimentacao' then 'Cartão alimentação/refeição na entrega'
      else 'Pagamento na entrega'
    end;

    update public.experience_sessions
       set context=coalesce(context,'{}'::jsonb)||jsonb_build_object(
             'homologation_terminal_preview',true,
             'homologation_terminal_preview_at',now(),
             'homologation_terminal_state_version',flow_state_version,
             'homologation_terminal_payment_method',v_payment,
             'homologation_terminal_total',v_preview->>'total',
             'homologation_terminal_no_order',true
           ),
           flow_current_screen='FINALIZAR',
           updated_at=now()
     where id=s.id;

    return jsonb_build_object(
      'ok',true,
      'session_id',s.id,
      'state_version',s.flow_state_version,
      'response',jsonb_build_object(
        'screen','FINALIZAR',
        'data',jsonb_build_object(
          'confirmation','Homologação validada sem criar pedido real.',
          'order_number','Teste de homologação',
          'final_summary',v_preview->>'summary',
          'final_total',v_preview->>'total',
          'final_total_label','Total: '||v_preview->>'total',
          'payment_label',v_payment_label,
          'next_step','Ao voltar para a conversa, envie sua localização para validarmos o ponto da entrega.',
          'write_enabled',false,
          'homologation_no_order',true
        )
      )
    );
  end if;

  if p_screen ~ '_(A|B|C|D|E|F|G|H|I|J|K|L)$' then v_round:=right(p_screen,1); end if;

  select * into s
  from public.experience_sessions
  where id=p_session_id and conversation_id=p_conversation_id
  for update;
  if not found then return jsonb_build_object('ok',false,'reason','flow_session_not_found'); end if;
  if s.expires_at<=now() or s.status not in ('offered','open') then
    return jsonb_build_object('ok',false,'reason','flow_session_inactive');
  end if;

  select * into d from public.experience_definitions where id=s.definition_id;
  if not found
     or d.slug<>'flow-cestas-comercial-v8-stable'
     or d.status<>'ready'
     or coalesce((d.metadata->>'candidate_not_live')::boolean,false) is not true
     or coalesce((d.metadata->>'customer_exposure')::boolean,true) is not false
     or coalesce((d.metadata->>'created_for_owner_homologation')::boolean,false) is not true then
    return jsonb_build_object('ok',false,'reason','ai_intent_candidate_only');
  end if;

  if coalesce((s.context->>'homologation_test')::boolean,false) is not true
     or coalesce((s.context->>'requested_by_owner')::boolean,false) is not true
     or coalesce(s.context->>'test_recipient','')='' then
    return jsonb_build_object('ok',false,'reason','ai_intent_owner_homologation_only');
  end if;

  select * into c from public.conversations where id=p_conversation_id;
  if not found or c.wa_contact_e164 is distinct from s.context->>'test_recipient' then
    return jsonb_build_object('ok',false,'reason','ai_intent_recipient_not_allowed');
  end if;
  if not exists(
    select 1 from public.whatsapp_test_allowlist w
    where w.phone_e164=c.wa_contact_e164
      and w.enabled
      and w.purpose='controlled_live_homologation'
      and (w.expires_at is null or w.expires_at>now())
  ) then
    return jsonb_build_object('ok',false,'reason','ai_intent_recipient_not_allowlisted');
  end if;

  if coalesce(s.flow_current_screen,'') not in ('MENU','TERMOS') then
    return jsonb_build_object(
      'ok',false,'reason','flow_transition_invalid',
      'expected_screen',coalesce(s.flow_current_screen,'MENU')
    );
  end if;

  v_resolved:=public.get_whatsapp_flow_intent_products_v1(v_intent,20);
  if not coalesce((v_resolved->>'ok')::boolean,false) then
    return jsonb_build_object(
      'ok',true,
      'session_id',s.id,
      'state_version',s.flow_state_version,
      'response',jsonb_build_object(
        'screen',p_screen,
        'data',jsonb_build_object(
          'message','Não encontrei um produto disponível para essa busca. Escolha uma seção ou outro tipo de produto.',
          'ai_intent_resolved',false
        )
      )
    );
  end if;

  v_query:=left(trim(coalesce(v_resolved->>'resolved_query','')),120);
  v_title:=left(trim(coalesce(v_resolved->>'term_title',v_resolved->>'section_title',v_intent)),70);
  if v_query='' then return jsonb_build_object('ok',false,'reason','ai_intent_query_empty'); end if;

  v_nav:=public.get_whatsapp_flow_nav_products_v1(
    p_conversation_id,'query',v_query,coalesce(nullif(v_title,''),v_intent),1,true
  );
  if not coalesce((v_nav->>'has_products')::boolean,false) then
    return jsonb_build_object(
      'ok',true,
      'session_id',s.id,
      'state_version',s.flow_state_version,
      'response',jsonb_build_object(
        'screen',p_screen,
        'data',jsonb_build_object(
          'message','Não há produto disponível para essa busca agora. Escolha outro tipo de produto.',
          'ai_intent_resolved',false
        )
      )
    );
  end if;

  v_product_ids:=coalesce(v_nav->'product_ids','[]'::jsonb);
  v_count:=case when jsonb_typeof(v_product_ids)='array' then jsonb_array_length(v_product_ids) else 0 end;
  if v_count<1 or v_count>20 then
    return jsonb_build_object('ok',false,'reason','ai_intent_product_subset_out_of_bounds','product_count',v_count);
  end if;

  v_next_version:=s.flow_state_version+1;
  update public.experience_sessions
     set context=coalesce(context,'{}'::jsonb)||jsonb_build_object(
       'flow_browse_mode','query',
       'flow_browse_key',v_query,
       'flow_query_title',coalesce(nullif(v_title,''),v_intent),
       'flow_products_page',1,
       'flow_product_option_ids',v_product_ids,
       'flow_ai_intent',v_intent,
       'flow_ai_intent_source',coalesce(v_resolved->>'query_source','backend')
     ),
     flow_current_screen='PRODUTOS',
     flow_state_version=v_next_version,
     updated_at=now()
   where id=s.id;

  return jsonb_build_object(
    'ok',true,
    'session_id',s.id,
    'state_version',v_next_version,
    'response',jsonb_build_object(
      'screen','PRODUTOS_'||v_round,
      'data',(v_nav-'product_ids'-'has_products'-'has_more'-'page_number')||jsonb_build_object(
        'ai_intent_resolved',true,
        'ai_intent',v_intent,
        'query_source',coalesce(v_resolved->>'query_source','backend'),
        'product_count',v_count,
        'full_catalog_loaded',false,
        'commercial_truth','backend_deterministic'
      )
    )
  );
end;
$function$;

revoke all on function public.handle_whatsapp_flow_commercial_exchange_v26(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.handle_whatsapp_flow_commercial_exchange_v26(uuid,uuid,text,text,jsonb) to service_role;

create or replace function public.process_whatsapp_flow_nfm_reply_legacy_v1(
  p_conversation_id uuid,
  p_message_id uuid,
  p_response jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_token text:=trim(coalesce(p_response->>'flow_token',''));
  v_hash text;
  s public.experience_sessions%rowtype;
  d public.experience_definitions%rowtype;
  c public.conversations%rowtype;
  a public.automation_config%rowtype;
  v_definition text;
  v_action text:=lower(trim(coalesce(p_response->>'action',p_response->>'result','completed')));
  v_order_id uuid;
  v_order public.orders%rowtype;
  v_duplicate boolean:=false;
  v_homologation_no_order boolean:=false;
  v_preview_at timestamptz;
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
  if v_definition not in ('flow-cestas-comercial-v1','flow-cestas-comercial-v2','flow-cestas-comercial-v3','flow-cestas-comercial-v4','flow-cestas-comercial-v5','flow-cestas-comercial-v6','flow-cestas-comercial-v7-diagnostico','flow-cestas-comercial-v8-stable') then return jsonb_build_object('ok',false,'reason','unsupported_flow_definition'); end if;
  if p_message_id is not null then select exists(select 1 from public.experience_events e where e.session_id=s.id and e.event_type='flow_nfm_reply' and e.event_data->>'message_id'=p_message_id::text) into v_duplicate; end if;
  begin v_order_id:=nullif(trim(coalesce(s.context->>'flow_order_id','')),'')::uuid; exception when others then v_order_id:=null; end;
  if v_order_id is not null then
    select * into v_order from public.orders where id=v_order_id and conversation_id=p_conversation_id and status='confirmed' and confirmed_at is not null and coalesce(total,0)>0;
    if not found then v_order_id:=null; end if;
  end if;

  if v_order_id is null and v_definition='flow-cestas-comercial-v8-stable' then
    begin v_preview_at:=nullif(s.context->>'homologation_terminal_preview_at','')::timestamptz; exception when others then v_preview_at:=null; end;
    select * into a from public.automation_config where id=1;
    select * into c from public.conversations where id=p_conversation_id;
    v_homologation_no_order:=
      coalesce((s.context->>'homologation_test')::boolean,false)
      and coalesce((s.context->>'requested_by_owner')::boolean,false)
      and coalesce((s.context->>'homologation_terminal_preview')::boolean,false)
      and coalesce((s.context->>'homologation_terminal_no_order')::boolean,false)
      and s.flow_current_screen='FINALIZAR'
      and v_preview_at is not null and v_preview_at>now()-interval '2 hours'
      and c.id is not null and c.wa_contact_e164 is not distinct from s.context->>'test_recipient'
      and exists(
        select 1 from public.whatsapp_test_allowlist w
        where w.phone_e164=c.wa_contact_e164 and w.enabled
          and w.purpose='controlled_live_homologation'
          and (w.expires_at is null or w.expires_at>now())
      )
      and coalesce(a.whatsapp_live_canary_percent,0)=1
      and not coalesce(a.experience_orchestrator_enabled,false)
      and not coalesce(a.whatsapp_flow_data_exchange_enabled,false)
      and not coalesce(a.whatsapp_flow_send_enabled,false)
      and not coalesce(a.whatsapp_flow_commercial_write_enabled,false)
      and not coalesce(a.bling_order_sync_enabled,false);
  end if;

  if not v_duplicate then
    insert into public.experience_events(conversation_id,session_id,definition_id,event_type,interface_type,event_data)
    values(p_conversation_id,s.id,s.definition_id,'flow_nfm_reply','whatsapp_flow',jsonb_build_object(
      'message_id',p_message_id,
      'action',v_action,
      'definition_slug',v_definition,
      'session_status',s.status,
      'has_confirmed_order',v_order_id is not null,
      'order_id',v_order_id,
      'homologation_no_order',v_homologation_no_order,
      'return_to_chat',true
    ));
  end if;

  return jsonb_build_object(
    'ok',true,
    'session_id',s.id,
    'definition_slug',v_definition,
    'action',v_action,
    'order_id',v_order_id,
    'return_to_chat',true,
    'duplicate',v_duplicate,
    'homologation_no_order',v_homologation_no_order,
    'location_required',((v_order_id is not null or v_homologation_no_order) and not v_duplicate),
    'reply_text',case
      when v_duplicate then null
      when v_order_id is not null then 'Pedido confirmado. Agora envie sua localização pelo WhatsApp para confirmar o ponto da entrega. 📍'
      when v_homologation_no_order then 'Homologação concluída sem criar pedido real. Agora envie sua localização pelo WhatsApp para validar o ponto da entrega. 📍'
      else 'Recebi suas escolhas. Vamos continuar por aqui.'
    end
  );
end;
$function$;

revoke all on function public.process_whatsapp_flow_nfm_reply_legacy_v1(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.process_whatsapp_flow_nfm_reply_legacy_v1(uuid,uuid,jsonb) to service_role;

create or replace function public.get_whatsapp_flow_v55_owner_terminal_no_order_readiness_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  a public.automation_config%rowtype;
  v54 jsonb;
  runtime_src text:=lower(coalesce(pg_get_functiondef('public.handle_whatsapp_flow_commercial_exchange_v26(uuid,uuid,text,text,jsonb)'::regprocedure),''));
  nfm_src text:=lower(coalesce(pg_get_functiondef('public.process_whatsapp_flow_nfm_reply_legacy_v1(uuid,uuid,jsonb)'::regprocedure),''));
  checks jsonb;
  ok boolean;
begin
  select * into a from public.automation_config where id=1;
  v54:=public.get_whatsapp_flow_v54_homologation_control_plane_v1();
  checks:=jsonb_build_array(
    jsonb_build_object('name','v54_control_green','ok',coalesce((v54->>'ok')::boolean,false)),
    jsonb_build_object('name','runtime_owner_terminal_preview_present','ok',position('homologation_terminal_preview' in runtime_src)>0 and position('falha_finalizacao' in runtime_src)>0),
    jsonb_build_object('name','runtime_owner_allowlist_guard_present','ok',position('controlled_live_homologation' in runtime_src)>0 and position('requested_by_owner' in runtime_src)>0),
    jsonb_build_object('name','runtime_no_real_order_finalize_call','ok',position('finalize_whatsapp_flow_commercial_order_v1' in runtime_src)=0 and position('confirm_cart_order' in runtime_src)=0),
    jsonb_build_object('name','nfm_owner_no_order_path_present','ok',position('homologation_no_order' in nfm_src)>0 and position('location_required' in nfm_src)>0),
    jsonb_build_object('name','nfm_no_order_requires_all_gates_off','ok',position('whatsapp_flow_commercial_write_enabled' in nfm_src)>0 and position('bling_order_sync_enabled' in nfm_src)>0),
    jsonb_build_object('name','global_gates_still_closed','ok',coalesce(a.whatsapp_live_canary_percent,0)=1 and not coalesce(a.experience_orchestrator_enabled,false) and not coalesce(a.whatsapp_flow_data_exchange_enabled,false) and not coalesce(a.whatsapp_flow_send_enabled,false) and not coalesce(a.whatsapp_flow_commercial_write_enabled,false) and not coalesce(a.bling_order_sync_enabled,false))
  );
  ok:=not exists(select 1 from jsonb_array_elements(checks) x where not coalesce((x->>'ok')::boolean,false));
  return jsonb_build_object(
    'ok',ok,
    'checks',checks,
    'runtime_handler','v26',
    'physical_next_required',v54->>'physical_next_required',
    'safe_to_launch_owner_v9',coalesce((v54->>'safe_to_launch_owner_v9')::boolean,false),
    'homologation_can_complete_without_real_order',true,
    'writes_performed',false,
    'gates',v54->'gates',
    'readiness_version','v55-owner-terminal-no-order'
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v55_owner_terminal_no_order_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v55_owner_terminal_no_order_readiness_v1() to service_role;

commit;
