begin;

-- Security-definer functions use search_path=''; qualify pgcrypto explicitly.
create or replace function public.upsert_agent_core_customer_memory_v1(
  p_customer_id uuid,p_memory_key text,p_memory_value text,p_source_kind text,p_confidence numeric,
  p_source_message_id uuid default null,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare cfg public.agent_core_runtime_config%rowtype; existing public.customer_service_memory%rowtype; kind text:=lower(coalesce(p_source_kind,'inferred')); conf numeric:=greatest(0,least(coalesce(p_confidence,0),1)); expires timestamptz; out_id uuid; vh text;
begin
  select * into cfg from public.agent_core_runtime_config where id=1;
  if p_customer_id is null then return jsonb_build_object('stored',false,'reason','customer_missing'); end if;
  if not public.agent_core_allowed_memory_key_v1(p_memory_key) then return jsonb_build_object('stored',false,'reason','memory_key_not_allowed'); end if;
  if not public.agent_core_safe_memory_value_v1(p_memory_value) then return jsonb_build_object('stored',false,'reason','memory_value_rejected'); end if;
  if kind not in ('declared','inferred','imported') then return jsonb_build_object('stored',false,'reason','source_kind_invalid'); end if;
  if kind='inferred' and conf<cfg.memory_inferred_min_confidence then return jsonb_build_object('stored',false,'reason','confidence_below_threshold'); end if;
  select * into existing from public.customer_service_memory where customer_id=p_customer_id and memory_key=lower(p_memory_key) and status='active' order by updated_at desc limit 1;
  if found and existing.source_kind='declared' and kind='inferred' then return jsonb_build_object('stored',false,'reason','declared_precedence','id',existing.id); end if;
  vh:=encode(extensions.digest(lower(p_memory_key)||':'||public.service_norm_text_v1(p_memory_value),'sha256'),'hex');
  expires:=case when kind='inferred' then now()+make_interval(days=>cfg.memory_inferred_ttl_days) when kind='declared' then now()+make_interval(days=>cfg.memory_declared_ttl_days) else null end;
  if found and coalesce(existing.value_hash,'')=vh then
    update public.customer_service_memory set confidence=greatest(existing.confidence,conf),evidence_count=least(existing.evidence_count+1,100000),last_evidence_at=now(),source_message_id=coalesce(p_source_message_id,existing.source_message_id),source_kind=case when existing.source_kind='declared' then 'declared' else kind end,expires_at=case when existing.source_kind='declared' then existing.expires_at else expires end,metadata=coalesce(existing.metadata,'{}'::jsonb)||coalesce(p_metadata,'{}'::jsonb),updated_at=now() where id=existing.id;
    return jsonb_build_object('stored',true,'reason','evidence_merged','id',existing.id);
  end if;
  if found then update public.customer_service_memory set status='superseded',updated_at=now() where id=existing.id; end if;
  insert into public.customer_service_memory(customer_id,memory_key,memory_value,confidence,source_message_id,status,expires_at,source_kind,evidence_count,last_evidence_at,value_hash,metadata)
  values(p_customer_id,lower(p_memory_key),left(trim(p_memory_value),180),conf,p_source_message_id,'active',expires,kind,1,now(),vh,coalesce(p_metadata,'{}'::jsonb)) returning id into out_id;
  return jsonb_build_object('stored',true,'reason','memory_updated','id',out_id);
end $$;

create or replace function public.upsert_agent_core_learning_candidate_v1(
  p_candidate_type text,p_title text,p_proposed_content jsonb,p_source_conversation_id uuid,p_source_message_ids uuid[],p_confidence numeric)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare cfg public.agent_core_runtime_config%rowtype; ctype text:=lower(coalesce(p_candidate_type,'')); conf numeric:=greatest(0,least(coalesce(p_confidence,0),1)); nh text; cid uuid;
begin
  select * into cfg from public.agent_core_runtime_config where id=1;
  if ctype not in ('knowledge','guidance','procedure') then return jsonb_build_object('stored',false,'reason','candidate_type_invalid'); end if;
  if conf<cfg.global_candidate_min_confidence then return jsonb_build_object('stored',false,'reason','candidate_confidence_below_threshold'); end if;
  if length(trim(coalesce(p_title,'')))<4 then return jsonb_build_object('stored',false,'reason','candidate_title_invalid'); end if;
  if not public.agent_core_candidate_is_safe_v1(p_title,p_proposed_content) then return jsonb_build_object('stored',false,'reason','candidate_sensitive_or_identifier_rejected'); end if;
  nh:=encode(extensions.digest(ctype||':'||public.service_norm_text_v1(left(p_title,180))||':'||public.service_norm_text_v1(left(coalesce(p_proposed_content::text,''),4000)),'sha256'),'hex');
  select id into cid from public.service_learning_candidates where candidate_type=ctype and normalized_hash=nh limit 1;
  if cid is not null then
    update public.service_learning_candidates set occurrence_count=least(occurrence_count+1,1000000),last_seen_at=now(),confidence=greatest(coalesce(confidence,0),conf),source_message_ids=(select coalesce(array_agg(distinct x),'{}'::uuid[]) from unnest(coalesce(public.service_learning_candidates.source_message_ids,'{}'::uuid[])||coalesce(p_source_message_ids,'{}'::uuid[])) x),updated_at=now() where id=cid;
    return jsonb_build_object('stored',true,'reason','candidate_merged','id',cid);
  end if;
  insert into public.service_learning_candidates(candidate_type,title,proposed_content,source_conversation_id,source_message_ids,confidence,status,normalized_hash,occurrence_count,first_seen_at,last_seen_at,source_kind)
  values(ctype,left(trim(p_title),180),coalesce(p_proposed_content,'{}'::jsonb),p_source_conversation_id,coalesce(p_source_message_ids,'{}'::uuid[]),conf,'draft',nh,1,now(),now(),'agent_core_async') returning id into cid;
  return jsonb_build_object('stored',true,'reason','candidate_created','id',cid);
end $$;

create or replace function public.apply_agent_core_learning_result_v1(
  p_conversation_id uuid,p_last_message_id uuid,p_summary text,p_salient_facts jsonb,p_memories jsonb,p_candidates jsonb,p_dry_run boolean default false)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare cfg public.agent_core_runtime_config%rowtype; c public.conversations%rowtype; m jsonb; cand jsonb; stored_mem integer:=0; stored_cand integer:=0; rejected_mem integer:=0; rejected_cand integer:=0; r jsonb; summary_clean text; safe_facts jsonb; msg_count integer; source_ids uuid[]; summary_rejected boolean:=false;
begin
  select * into cfg from public.agent_core_runtime_config where id=1;
  select * into c from public.conversations where id=p_conversation_id;
  if not found then return jsonb_build_object('ok',false,'reason','conversation_not_found'); end if;
  summary_clean:=left(regexp_replace(trim(coalesce(p_summary,'')),'\s+',' ','g'),cfg.memory_summary_max_chars);
  if not public.agent_core_text_is_safe_to_persist_v1(summary_clean,cfg.memory_summary_max_chars) then summary_clean:=''; summary_rejected:=true; end if;
  safe_facts:=public.agent_core_safe_salient_facts_v1(p_salient_facts);
  select count(*) into msg_count from public.messages where conversation_id=p_conversation_id;
  if p_dry_run then return jsonb_build_object('ok',true,'dry_run',true,'summary_chars',length(summary_clean),'summary_rejected',summary_rejected,'safe_salient_fact_count',jsonb_array_length(safe_facts),'memory_candidates',jsonb_array_length(case when jsonb_typeof(p_memories)='array' then p_memories else '[]'::jsonb end),'global_candidates',jsonb_array_length(case when jsonb_typeof(p_candidates)='array' then p_candidates else '[]'::jsonb end)); end if;
  if not cfg.learning_write_enabled then return jsonb_build_object('ok',false,'reason','learning_write_disabled'); end if;
  insert into public.conversation_memory_snapshots(conversation_id,last_message_id,summary,salient_facts,source_message_count,updated_at,summary_version,summary_hash,last_processed_at,metadata)
  values(p_conversation_id,p_last_message_id,summary_clean,safe_facts,msg_count,now(),1,encode(extensions.digest(summary_clean,'sha256'),'hex'),now(),jsonb_build_object('source','agent_core_async','sensitive_attributes_stored',false,'summary_rejected',summary_rejected))
  on conflict(conversation_id) do update set last_message_id=excluded.last_message_id,summary=excluded.summary,salient_facts=excluded.salient_facts,source_message_count=excluded.source_message_count,updated_at=excluded.updated_at,summary_version=public.conversation_memory_snapshots.summary_version+1,summary_hash=excluded.summary_hash,last_processed_at=excluded.last_processed_at,metadata=public.conversation_memory_snapshots.metadata||excluded.metadata;
  if c.customer_id is not null and jsonb_typeof(p_memories)='array' then
    for m in select value from jsonb_array_elements(p_memories) loop
      r:=public.upsert_agent_core_customer_memory_v1(c.customer_id,m->>'key',m->>'value',coalesce(m->>'source_kind','inferred'),coalesce((m->>'confidence')::numeric,0),case when coalesce(m->>'source_message_id','') ~ '^[0-9a-fA-F-]{36}$' then (m->>'source_message_id')::uuid else p_last_message_id end,jsonb_build_object('source','agent_core_async'));
      if coalesce((r->>'stored')::boolean,false) then stored_mem:=stored_mem+1; else rejected_mem:=rejected_mem+1; end if;
    end loop;
  end if;
  if jsonb_typeof(p_candidates)='array' then
    for cand in select value from jsonb_array_elements(p_candidates) loop
      select coalesce(array_agg((x #>> '{}')::uuid),'{}'::uuid[]) into source_ids from jsonb_array_elements(coalesce(cand->'source_message_ids','[]'::jsonb)) x where (x #>> '{}') ~ '^[0-9a-fA-F-]{36}$';
      r:=public.upsert_agent_core_learning_candidate_v1(cand->>'candidate_type',cand->>'title',coalesce(cand->'proposed_content','{}'::jsonb),p_conversation_id,source_ids,coalesce((cand->>'confidence')::numeric,0));
      if coalesce((r->>'stored')::boolean,false) then stored_cand:=stored_cand+1; else rejected_cand:=rejected_cand+1; end if;
    end loop;
  end if;
  return jsonb_build_object('ok',true,'dry_run',false,'summary_rejected',summary_rejected,'memories_stored',stored_mem,'memories_rejected',rejected_mem,'candidates_stored',stored_cand,'candidates_rejected',rejected_cand);
end $$;

commit;
