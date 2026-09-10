begin;

create or replace function public.search_service_knowledge_text_v1(p_query text,p_limit integer default 4)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare nq text:=public.service_norm_text_v1(left(coalesce(p_query,''),240)); qs text; tsq tsquery; outv jsonb:='[]'::jsonb;
begin
  select string_agg(quote_literal(tok)||':*',' | ') into qs
  from (select distinct tok from regexp_split_to_table(nq,'\s+') tok where length(tok)>=3 limit 12) x;
  if coalesce(qs,'')='' then return '[]'::jsonb; end if;
  tsq:=to_tsquery('simple'::regconfig,qs);
  with ranked as (
    select k.knowledge_key,k.category,k.title,k.content,k.priority,
      ts_rank_cd(to_tsvector('simple'::regconfig,coalesce(k.title,'')||' '||coalesce(k.content,'')),tsq)
      + coalesce((select count(*)::real*0.25 from unnest(coalesce(k.keywords,'{}'::text[])) kw where nq like '%'||public.service_norm_text_v1(kw)||'%'),0) rank
    from public.service_knowledge_items k
    where k.status='published' and (k.valid_from is null or k.valid_from<=now()) and (k.valid_until is null or k.valid_until>now())
      and tsq @@ to_tsvector('simple'::regconfig,coalesce(k.title,'')||' '||coalesce(k.content,''))
  )
  select coalesce(jsonb_agg(jsonb_build_object('key',knowledge_key,'category',category,'title',left(title,120),'content',left(content,520),'rank',round(rank::numeric,4)) order by rank desc,priority desc),'[]'::jsonb)
  into outv from (select * from ranked order by rank desc,priority desc limit greatest(1,least(coalesce(p_limit,4),8))) r;
  return outv;
end $$;

create or replace function public.build_agent_core_learning_packet_v1(p_conversation_id uuid,p_last_message_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare c public.conversations%rowtype; snap public.conversation_memory_snapshots%rowtype; recent jsonb:='[]'::jsonb; selective jsonb:='{}'::jsonb;
begin
  select * into c from public.conversations where id=p_conversation_id;
  if not found then return jsonb_build_object('eligible',false,'reason','conversation_not_found'); end if;
  select * into snap from public.conversation_memory_snapshots where conversation_id=p_conversation_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'direction',r.direction,'type',r.message_type,'text',left(r.text_value,900),'created_at',r.created_at) order by r.created_at),'[]'::jsonb)
    into recent from (
      select m.id,m.direction,m.message_type,coalesce(nullif(m.transcript,''),nullif(m.body_text,''),'') text_value,m.created_at
      from public.messages m where m.conversation_id=p_conversation_id
        and coalesce(nullif(m.transcript,''),nullif(m.body_text,''),'')<>''
        and (snap.last_processed_at is null or m.created_at>snap.last_processed_at)
      order by m.created_at desc limit 12
    ) r;
  selective:=public.get_agent_core_selective_memory_v1(p_conversation_id);
  return jsonb_build_object('eligible',true,'conversation_id',c.id,'customer_id',c.customer_id,'previous_summary',left(coalesce(snap.summary,''),700),
    'previous_source_message_count',coalesce(snap.source_message_count,0),'recent_messages',recent,'existing_memories',coalesce(selective->'memories','[]'::jsonb),'last_message_id',p_last_message_id,
    'privacy',jsonb_build_object('store_sensitive_attributes',false,'store_direct_identifiers',false,'allowed_memory_keys',jsonb_build_array(
      'preferred_product','preferred_brand','avoid_product','substitution_preference','basket_preference','contact_style','delivery_time_preference','payment_method_preference','preferred_category')));
end $$;

create or replace function public.build_whatsapp_agent_core_packet_v1(p_conversation_id uuid,p_message_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare cfg public.agent_core_runtime_config%rowtype; base jsonb; msg text; stage text; topic text; selective jsonb; intelligence jsonb; tools jsonb:='[]'::jsonb; hist jsonb:='[]'::jsonb; max_hist integer;
begin
 select * into cfg from public.agent_core_runtime_config where id=1;
 if not found or not cfg.enabled or cfg.execution_mode='off' then return jsonb_build_object('enabled',false,'execution_mode','off'); end if;
 base:=public.build_whatsapp_sales_context_v1(p_conversation_id,p_message_id); msg:=coalesce(base#>>'{message,text}',''); stage:=coalesce(base#>>'{conversation,stage}',''); topic:=public.classify_whatsapp_service_topic_v1(msg,stage); max_hist:=greatest(0,least(cfg.max_history_messages,8));
 if jsonb_typeof(base->'history')='array' then select coalesce(jsonb_agg(value),'[]'::jsonb) into hist from (select value from jsonb_array_elements(base->'history') with ordinality x(value,ord) order by ord limit max_hist) q; end if;
 selective:=public.get_agent_core_selective_memory_v1(p_conversation_id); tools:=public.get_whatsapp_agent_core_toolset_v1();
 intelligence:=coalesce(public.get_service_intelligence_compact_v3('whatsapp',msg,null,stage),'{}'::jsonb)
   || jsonb_build_object('conversation_summary',coalesce(selective->>'summary',''),'knowledge_text_matches',public.search_service_knowledge_text_v1(msg,3),'memory_policy',jsonb_build_object('declared_precedence',true,'sensitive_attributes_excluded',true));
 return jsonb_build_object('enabled',true,'agent',jsonb_build_object('version',cfg.agent_version,'execution_mode',cfg.execution_mode,'planner_model',cfg.planner_model,'escalation_model',cfg.escalation_model,'reasoning_effort',cfg.reasoning_effort,'max_tool_calls',cfg.max_tool_calls,'prompt_cache_key_prefix',cfg.prompt_cache_key_prefix,'prompt_cache_ttl',cfg.prompt_cache_ttl),'topic',topic,'message',base->'message','conversation',base->'conversation','customer',base->'customer','cart',base->'cart','sales_state',base->'sales_state','history',hist,'conversation_summary',coalesce(selective->>'summary',''),'customer_memory',coalesce(selective->'memories','[]'::jsonb),'intelligence',intelligence,'toolset',tools,'truth_sources',jsonb_build_array('counter_verified','supabase_transactional_backend'),'rules',jsonb_build_object('human_handoff_precedence',true,'no_invented_catalog',true,'explicit_confirmation_for_commitments',true,'basket_component_prices_hidden',true,'declared_memory_precedence',true,'global_learning_requires_human_review',true));
end $$;

create or replace function public.list_agent_core_learning_candidates_v1(p_status text default null,p_limit integer default 100)
returns jsonb language sql stable security definer set search_path=''
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by case x.status when 'draft' then 0 when 'reviewing' then 1 else 2 end,x.confidence desc nulls last,x.occurrence_count desc,x.last_seen_at desc),'[]'::jsonb)
  from (select id,candidate_type,title,proposed_content,confidence,status,review_note,occurrence_count,first_seen_at,last_seen_at,source_kind,promoted_entity_type,promoted_entity_id,reviewed_by,reviewed_at,created_at,updated_at
        from public.service_learning_candidates
        where nullif(p_status,'') is null or status=p_status
        order by last_seen_at desc limit greatest(1,least(coalesce(p_limit,100),200))) x;
$$;

create or replace function public.review_agent_core_learning_candidate_v1(p_candidate_id uuid,p_decision text,p_actor_user_id uuid,p_note text default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare c public.service_learning_candidates%rowtype; pc jsonb; entity_id uuid; entity_type text; k text; ver integer;
begin
  select * into c from public.service_learning_candidates where id=p_candidate_id for update;
  if not found then return jsonb_build_object('ok',false,'reason','candidate_not_found'); end if;
  if p_decision='reject' then
    update public.service_learning_candidates set status='rejected',review_note=left(coalesce(p_note,''),500),reviewed_by=p_actor_user_id,reviewed_at=now(),updated_at=now() where id=c.id;
    return jsonb_build_object('ok',true,'decision','rejected');
  end if;
  if p_decision<>'approve_draft' then return jsonb_build_object('ok',false,'reason','decision_invalid'); end if;
  if c.status not in ('draft','reviewing') then return jsonb_build_object('ok',false,'reason','candidate_not_reviewable'); end if;
  pc:=coalesce(c.proposed_content,'{}'::jsonb);
  if c.candidate_type='knowledge' then
    k:=coalesce(nullif(public.service_norm_text_v1(pc->>'knowledge_key'),''),'learned_'||left(c.normalized_hash,18));
    select coalesce(max(version_no),0)+1 into ver from public.service_knowledge_items where knowledge_key=k;
    insert into public.service_knowledge_items(knowledge_key,category,title,content,keywords,channel_scope,status,priority,version_no,source_note,created_by,updated_by)
    values(k,left(coalesce(pc->>'category','atendimento'),80),left(coalesce(nullif(pc->>'title',''),c.title),180),left(coalesce(pc->>'content',''),12000),
      coalesce(array(select left(value,120) from jsonb_array_elements_text(coalesce(pc->'keywords','[]'::jsonb)) limit 30),'{}'::text[]),array['whatsapp']::text[],'draft',50,ver,'Criado a partir de candidato revisado do Agent Core',p_actor_user_id,p_actor_user_id) returning id into entity_id;
    entity_type:='knowledge';
  elsif c.candidate_type='guidance' then
    k:=coalesce(nullif(public.service_norm_text_v1(pc->>'rule_key'),''),'learned_'||left(c.normalized_hash,18));
    select coalesce(max(version_no),0)+1 into ver from public.service_guidance_rules where rule_key=k;
    insert into public.service_guidance_rules(rule_key,title,instruction,intent_scope,stage_scope,channel_scope,behavior_tags,status,priority,version_no,created_by,updated_by)
    values(k,left(coalesce(nullif(pc->>'title',''),c.title),180),left(coalesce(pc->>'instruction',''),8000),'{}'::text[],'{}'::text[],array['whatsapp']::text[],array['agent_core_candidate']::text[],'draft',50,ver,p_actor_user_id,p_actor_user_id) returning id into entity_id;
    entity_type:='guidance';
  else
    k:=coalesce(nullif(public.service_norm_text_v1(pc->>'procedure_key'),''),'learned_'||left(c.normalized_hash,18));
    select coalesce(max(version_no),0)+1 into ver from public.service_procedures where procedure_key=k;
    insert into public.service_procedures(procedure_key,title,trigger_description,steps,allowed_actions,confirmation_actions,fallback,status,priority,version_no,created_by,updated_by)
    values(k,left(coalesce(nullif(pc->>'title',''),c.title),180),left(coalesce(pc->>'trigger_description','Revisar procedimento sugerido pela IA'),2000),case when jsonb_typeof(pc->'steps')='array' then pc->'steps' else '[]'::jsonb end,'{}'::text[],'{}'::text[],left(coalesce(pc->>'fallback',''),2000),'draft',50,ver,p_actor_user_id,p_actor_user_id) returning id into entity_id;
    entity_type:='procedure';
  end if;
  update public.service_learning_candidates set status='reviewing',review_note=left(coalesce(p_note,''),500),promoted_entity_type=entity_type,promoted_entity_id=entity_id,reviewed_by=p_actor_user_id,reviewed_at=now(),updated_at=now() where id=c.id;
  return jsonb_build_object('ok',true,'decision','approved_as_draft','entity_type',entity_type,'entity_id',entity_id,'published',false);
end $$;

create or replace function public.get_agent_core_round3_readiness_v1()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare cfg public.agent_core_runtime_config%rowtype; m record;
begin
  select * into cfg from public.agent_core_runtime_config where id=1;
  select * into m from pgmq.metrics('agent_core_learning_v1');
  return jsonb_build_object('execution_mode',cfg.execution_mode,'memory_read_enabled',cfg.memory_read_enabled,'learning_write_enabled',cfg.learning_write_enabled,
    'global_candidate_autopublish_enabled',cfg.global_candidate_autopublish_enabled,'memory_count',(select count(*) from public.customer_service_memory where status='active'),
    'summary_count',(select count(*) from public.conversation_memory_snapshots),'draft_candidate_count',(select count(*) from public.service_learning_candidates where status='draft'),
    'queue_length',coalesce(m.queue_length,0),'queue_total_messages',coalesce(m.total_messages,0),'vector_enabled',exists(select 1 from pg_extension where extname='vector'),
    'pgmq_enabled',exists(select 1 from pg_extension where extname='pgmq'));
end $$;

create or replace function public.get_agent_core_round3_report_v1(p_hours integer default 24)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare h integer:=greatest(1,least(coalesce(p_hours,24),720)); m record; cfg public.agent_core_runtime_config%rowtype;
begin
  select * into cfg from public.agent_core_runtime_config where id=1;
  select * into m from pgmq.metrics('agent_core_learning_v1');
  return jsonb_build_object('window_hours',h,'execution_mode',cfg.execution_mode,'learning_write_enabled',cfg.learning_write_enabled,'autopublish_enabled',cfg.global_candidate_autopublish_enabled,
    'queue_length',coalesce(m.queue_length,0),'queue_total_messages',coalesce(m.total_messages,0),
    'summaries',(select count(*) from public.conversation_memory_snapshots),'active_memories',(select count(*) from public.customer_service_memory where status='active'),
    'declared_memories',(select count(*) from public.customer_service_memory where status='active' and source_kind='declared'),'inferred_memories',(select count(*) from public.customer_service_memory where status='active' and source_kind='inferred'),
    'draft_candidates',(select count(*) from public.service_learning_candidates where status='draft'),'reviewing_candidates',(select count(*) from public.service_learning_candidates where status='reviewing'),
    'applied_events',(select count(*) from public.whatsapp_ops_events where event_type='agent_core_learning_applied' and created_at>=now()-make_interval(hours=>h)),
    'vector_enabled',exists(select 1 from pg_extension where extname='vector'),'pgmq_enabled',exists(select 1 from pg_extension where extname='pgmq'));
end $$;

revoke execute on function public.search_service_knowledge_text_v1(text,integer) from public,anon,authenticated;
revoke execute on function public.build_agent_core_learning_packet_v1(uuid,uuid) from public,anon,authenticated;
revoke execute on function public.build_whatsapp_agent_core_packet_v1(uuid,uuid) from public,anon,authenticated;
revoke execute on function public.list_agent_core_learning_candidates_v1(text,integer) from public,anon,authenticated;
revoke execute on function public.review_agent_core_learning_candidate_v1(uuid,text,uuid,text) from public,anon,authenticated;
revoke execute on function public.get_agent_core_round3_readiness_v1() from public,anon,authenticated;
revoke execute on function public.get_agent_core_round3_report_v1(integer) from public,anon,authenticated;
grant execute on function public.search_service_knowledge_text_v1(text,integer) to service_role;
grant execute on function public.build_agent_core_learning_packet_v1(uuid,uuid) to service_role;
grant execute on function public.build_whatsapp_agent_core_packet_v1(uuid,uuid) to service_role;
grant execute on function public.list_agent_core_learning_candidates_v1(text,integer) to service_role;
grant execute on function public.review_agent_core_learning_candidate_v1(uuid,text,uuid,text) to service_role;
grant execute on function public.get_agent_core_round3_readiness_v1() to service_role;
grant execute on function public.get_agent_core_round3_report_v1(integer) to service_role;

commit;
