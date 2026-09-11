create or replace function public.handle_whatsapp_flow_commercial_exchange_v26(
  p_session_id uuid,
  p_conversation_id uuid,
  p_action text,
  p_screen text default null,
  p_data jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  s public.experience_sessions%rowtype;
  d public.experience_definitions%rowtype;
  c public.conversations%rowtype;
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
begin
  -- V45: AI contributes only intent text. Product identity, price and stock
  -- continue to come exclusively from deterministic Supabase queries.
  if not (
    p_action='data_exchange'
    and coalesce(p_screen,'') ~ '^(MENU|TERMOS)_[A-L]$'
    and v_trigger='ai_intent_open_v1'
    and v_intent<>''
  ) then
    return public.handle_whatsapp_flow_commercial_exchange_v25(
      p_session_id,p_conversation_id,p_action,p_screen,p_data
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
      'ok',true,'session_id',s.id,'state_version',s.flow_state_version,
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
      'ok',true,'session_id',s.id,'state_version',s.flow_state_version,
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
    'ok',true,'session_id',s.id,'state_version',v_next_version,
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
$$;

revoke all on function public.handle_whatsapp_flow_commercial_exchange_v26(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.handle_whatsapp_flow_commercial_exchange_v26(uuid,uuid,text,text,jsonb) to service_role;

create or replace function public.get_whatsapp_flow_v45_ai_intent_data_exchange_readiness_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  cfg public.automation_config%rowtype;
  d public.experience_definitions%rowtype;
  fn text:=lower(coalesce(pg_get_functiondef('public.handle_whatsapp_flow_commercial_exchange_v26(uuid,uuid,text,text,jsonb)'::regprocedure),''));
  smoke jsonb;
  checks jsonb;
begin
  select * into cfg from public.automation_config where id=1;
  select * into d from public.experience_definitions where slug='flow-cestas-comercial-v8-stable' limit 1;
  smoke:=public.get_whatsapp_flow_intent_products_v1('sabonete',20);
  checks:=jsonb_build_array(
    jsonb_build_object('name','rollout_locked','ok',coalesce(cfg.whatsapp_live_canary_percent,0)=1 and not cfg.experience_orchestrator_enabled and not cfg.whatsapp_flow_data_exchange_enabled and not cfg.whatsapp_flow_send_enabled and not cfg.whatsapp_flow_commercial_write_enabled and not cfg.bling_order_sync_enabled),
    jsonb_build_object('name','candidate_isolated','ok',d.slug='flow-cestas-comercial-v8-stable' and d.status='ready' and coalesce((d.metadata->>'customer_exposure')::boolean,true)=false and coalesce((d.metadata->>'candidate_not_live')::boolean,false)=true),
    jsonb_build_object('name','owner_allowlist_guard','ok',position('whatsapp_test_allowlist' in fn)>0 and position('controlled_live_homologation' in fn)>0),
    jsonb_build_object('name','intent_is_hint_only','ok',position('get_whatsapp_flow_intent_products_v1' in fn)>0 and position('commercial_truth' in fn)>0),
    jsonb_build_object('name','bounded_subset','ok',position('v_count>20' in replace(fn,' ',''))>0 and coalesce((smoke->>'ok')::boolean,false) and coalesce((smoke->>'product_count')::int,0) between 1 and 20),
    jsonb_build_object('name','v25_fallback_preserved','ok',position('handle_whatsapp_flow_commercial_exchange_v25' in fn)>0)
  );
  return jsonb_build_object(
    'ok',not exists(select 1 from jsonb_array_elements(checks) x where coalesce((x->>'ok')::boolean,false)=false),
    'checks',checks,
    'smoke_product_count',coalesce((smoke->>'product_count')::int,0),
    'gates',jsonb_build_object(
      'whatsapp_live_canary_percent',cfg.whatsapp_live_canary_percent,
      'experience_orchestrator_enabled',cfg.experience_orchestrator_enabled,
      'whatsapp_flow_data_exchange_enabled',cfg.whatsapp_flow_data_exchange_enabled,
      'whatsapp_flow_send_enabled',cfg.whatsapp_flow_send_enabled,
      'whatsapp_flow_commercial_write_enabled',cfg.whatsapp_flow_commercial_write_enabled,
      'bling_order_sync_enabled',cfg.bling_order_sync_enabled
    )
  );
end;
$$;

revoke all on function public.get_whatsapp_flow_v45_ai_intent_data_exchange_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v45_ai_intent_data_exchange_readiness_v1() to service_role;

update public.experience_definitions
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'commercial_handler','handle_whatsapp_flow_commercial_exchange_v26',
  'handler_version','v26',
  'ai_intent_data_exchange','v45-owner-only',
  'ai_intent_trigger','ai_intent_open_v1',
  'ai_intent_max_products',20,
  'ai_intent_catalog_authority','backend_deterministic'
),
config=coalesce(config,'{}'::jsonb)||jsonb_build_object('handler_version','v26'),
updated_at=now()
where slug='flow-cestas-comercial-v8-stable';