begin;

create or replace function public.match_whatsapp_product_vocabulary_v1(p_message text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  q text:=public.canonicalize_whatsapp_product_query_v1(p_message);
  qn text:=translate(lower(trim(coalesce(q,''))),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc');
  r record;
  best record;
  sim real;
  mode text;
begin
  if qn='' then return jsonb_build_object('matched',false,'canonical_query',''); end if;
  if qn ~ '(^| )(cadastro|meus dados|meu cadastro|endereco|telefone|cpf|cnpj)( |$)' then
    return jsonb_build_object('matched',false,'canonical_query',qn,'reason','non_product_customer_data_term');
  end if;

  for r in
    select t.section_key,t.term_key,t.term_title,t.search_query,
           translate(lower(trim(coalesce(t.search_query,''))),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc') as term_norm
    from public.whatsapp_flow_search_terms t
    where t.enabled=true and nullif(trim(coalesce(t.search_query,'')),'') is not null
  loop
    sim:=0; mode:=null;
    if qn=r.term_norm or (' '||qn||' ') like '% '||r.term_norm||' %' then
      sim:=1; mode:='exact_or_phrase';
    elsif position(' ' in qn)=0 and position(' ' in r.term_norm)=0
      and length(qn)>=4 and abs(length(qn)-length(r.term_norm))<=2
      and left(qn,1)=left(r.term_norm,1)
    then
      sim:=extensions.word_similarity(qn,r.term_norm);
      if sim>=0.42 then mode:='fuzzy_single_token'; else sim:=0; end if;
    end if;
    if sim>0 and (best is null or sim>best.sim) then
      select r.section_key,r.term_key,r.term_title,r.search_query,r.term_norm,sim,mode into best;
    end if;
  end loop;

  if best is null then
    return jsonb_build_object('matched',false,'canonical_query',qn);
  end if;
  return jsonb_build_object(
    'matched',true,
    'canonical_query',qn,
    'section_key',best.section_key,
    'term_key',best.term_key,
    'term_title',best.term_title,
    'search_query',best.search_query,
    'match_mode',best.mode,
    'similarity',round(best.sim::numeric,4)
  );
end
$$;

revoke all on function public.match_whatsapp_product_vocabulary_v1(text) from public,anon,authenticated;
grant execute on function public.match_whatsapp_product_vocabulary_v1(text) to service_role;

create or replace function public.resolve_whatsapp_agent_core_topic_v4(p_message text,p_stage text,p_awaiting text,p_interactive_id text)
returns text
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  base text:=public.resolve_whatsapp_agent_core_topic_v3(p_message,p_stage,p_awaiting,p_interactive_id);
  q text:=public.service_norm_text_v1(p_message);
  vocab jsonb;
begin
  if base not in ('general','product_search') then return base; end if;
  if q ~ '(^| )(cadastro|meu cadastro|meus dados)( |$)' then return 'general'; end if;
  vocab:=public.match_whatsapp_product_vocabulary_v1(p_message);
  if coalesce((vocab->>'matched')::boolean,false) then return 'product_search'; end if;
  return base;
end
$$;

revoke all on function public.resolve_whatsapp_agent_core_topic_v4(text,text,text,text) from public,anon,authenticated;
grant execute on function public.resolve_whatsapp_agent_core_topic_v4(text,text,text,text) to service_role;

create or replace function public.build_whatsapp_agent_core_packet_v1(p_conversation_id uuid,p_message_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  cfg public.agent_core_runtime_config%rowtype;
  base jsonb;
  msg text; stage text; awaiting text; interactive_id text; topic text;
  selective jsonb; intelligence jsonb; tools jsonb:='[]'::jsonb; hist jsonb:='[]'::jsonb;
  max_hist integer; v_historical jsonb; v_is_historical boolean:=false; v_family text;
begin
  select * into cfg from public.agent_core_runtime_config where id=1;
  if not found or not cfg.enabled or cfg.execution_mode='off' then return jsonb_build_object('enabled',false,'execution_mode','off'); end if;
  base:=public.build_whatsapp_sales_context_v1(p_conversation_id,p_message_id);
  msg:=coalesce(base#>>'{message,text}',''); stage:=coalesce(base#>>'{conversation,stage}',''); awaiting:=coalesce(base#>>'{sales_state,awaiting}',''); interactive_id:=coalesce(base#>>'{message,interactive,id}','');
  topic:=public.resolve_whatsapp_agent_core_topic_v4(msg,stage,awaiting,interactive_id);
  max_hist:=greatest(0,least(cfg.max_history_messages,8));
  if jsonb_typeof(base->'history')='array' then select coalesce(jsonb_agg(value),'[]'::jsonb) into hist from (select value from jsonb_array_elements(base->'history') with ordinality x(value,ord) order by ord limit max_hist) q; end if;
  selective:=public.get_agent_core_selective_memory_v1(p_conversation_id);
  tools:=public.get_whatsapp_agent_core_toolset_v1();
  intelligence:=coalesce(public.get_service_intelligence_compact_v3('whatsapp',msg,null,stage),'{}'::jsonb)
    || jsonb_build_object('conversation_summary',coalesce(selective->>'summary',''),'knowledge_text_matches',public.search_service_knowledge_text_v1(msg,3),'memory_policy',jsonb_build_object('declared_precedence',true,'sensitive_attributes_excluded',true),'product_vocabulary',public.match_whatsapp_product_vocabulary_v1(msg));

  select public.is_agent_core_stateless_historical_replay_job_v2(j.id) into v_historical
  from public.ai_jobs j where j.conversation_id=p_conversation_id and j.message_id=p_message_id order by j.created_at desc limit 1;
  v_is_historical:=coalesce((v_historical->>'safe')::boolean,false);
  v_family:=coalesce(v_historical->>'allowed_tool_family','');
  if v_is_historical then
    base:=jsonb_set(base,'{conversation,mode}','"ai"'::jsonb,true);
    base:=jsonb_set(base,'{cart}',jsonb_build_object('exists',false,'items','[]'::jsonb),true);
    base:=jsonb_set(base,'{sales_state}','{}'::jsonb,true);
    selective:=jsonb_build_object('summary','','memories','[]'::jsonb);
    if v_family='catalog_search' then
      select coalesce(jsonb_agg(x),'[]'::jsonb) into tools from jsonb_array_elements(tools) x where x->>'name' in ('wa_search_products','wa_get_product','wa_get_policy');
    elsif v_family='basket_catalog' then
      select coalesce(jsonb_agg(x),'[]'::jsonb) into tools from jsonb_array_elements(tools) x where x->>'name' in ('wa_list_baskets','wa_get_policy');
    else tools:='[]'::jsonb; end if;
  end if;

  return jsonb_build_object('enabled',true,'agent',jsonb_build_object('version',cfg.agent_version,'execution_mode',cfg.execution_mode,'planner_model',cfg.planner_model,'escalation_model',cfg.escalation_model,'reasoning_effort',cfg.reasoning_effort,'max_tool_calls',cfg.max_tool_calls,'prompt_cache_key_prefix',cfg.prompt_cache_key_prefix,'prompt_cache_ttl',cfg.prompt_cache_ttl),'topic',topic,'message',base->'message','conversation',base->'conversation','customer',case when v_is_historical then null else base->'customer' end,'cart',base->'cart','sales_state',base->'sales_state','history',hist,'conversation_summary',case when v_is_historical then '' else coalesce(selective->>'summary','') end,'customer_memory',case when v_is_historical then '[]'::jsonb else coalesce(selective->'memories','[]'::jsonb) end,'intelligence',intelligence,'toolset',tools,'truth_sources',jsonb_build_array('counter_verified','supabase_transactional_backend'),'rules',jsonb_build_object('human_handoff_precedence',true,'no_invented_catalog',true,'explicit_confirmation_for_commitments',true,'basket_component_prices_hidden',true,'declared_memory_precedence',true,'global_learning_requires_human_review',true,'state_aware_topic',true,'product_vocabulary_separate_from_availability',true),'metadata',jsonb_build_object('historical_replay',v_is_historical,'historical_state_neutral',v_is_historical));
end
$$;

revoke all on function public.build_whatsapp_agent_core_packet_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.build_whatsapp_agent_core_packet_v1(uuid,uuid) to service_role;

commit;