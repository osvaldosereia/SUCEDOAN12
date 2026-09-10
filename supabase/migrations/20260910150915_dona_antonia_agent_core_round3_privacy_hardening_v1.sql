begin;

-- Defesa determinística: o modelo não decide sozinho o que pode ser persistido.
create or replace function public.agent_core_text_is_safe_to_persist_v1(p_value text,p_max_len integer default 4000)
returns boolean language plpgsql immutable set search_path=''
as $$
declare v text:=left(trim(coalesce(p_value,'')),greatest(1,least(coalesce(p_max_len,4000),12000))); n text:=public.service_norm_text_v1(v); digits text:=regexp_replace(v,'\D','','g');
begin
  if v='' then return true; end if;
  if v ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}' then return false; end if;
  if digits ~ '[0-9]{10,}' then return false; end if;
  if n ~ '(^| )(cpf|cnpj|rg|documento|senha|password|cvv|codigo de seguranca|numero do cartao|endereco completo|rua [a-z]|avenida [a-z]|telefone|celular|email)( |$)' then return false; end if;
  if n ~ '(^| )(cancer|diabet|hiv|aids|gravida|gestante|doenca|diagnostico|medicamento|religiao|religioso|igreja|politic|partido|sindicato|orientacao sexual|sexualidade|crime|criminal|prisao)( |$)' then return false; end if;
  return true;
end $$;

create or replace function public.agent_core_candidate_is_safe_v1(p_title text,p_content jsonb)
returns boolean language sql immutable set search_path=''
as $$
  select public.agent_core_text_is_safe_to_persist_v1(left(coalesce(p_title,''),180),180)
     and public.agent_core_text_is_safe_to_persist_v1(left(coalesce(p_content::text,''),12000),12000);
$$;

create or replace function public.agent_core_safe_salient_facts_v1(p_facts jsonb)
returns jsonb language sql immutable set search_path=''
as $$
  select coalesce(jsonb_agg(to_jsonb(left(v,180))),'[]'::jsonb)
  from (select trim(value) v from jsonb_array_elements_text(case when jsonb_typeof(p_facts)='array' then p_facts else '[]'::jsonb end) where length(trim(value)) between 1 and 180 limit 8) x
  where public.agent_core_text_is_safe_to_persist_v1(x.v,180);
$$;

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
  nh:=encode(digest(ctype||':'||public.service_norm_text_v1(left(p_title,180))||':'||public.service_norm_text_v1(left(coalesce(p_proposed_content::text,''),4000)),'sha256'),'hex');
  select id into cid from public.service_learning_candidates where candidate_type=ctype and normalized_hash=nh limit 1;
  if cid is not null then
    update public.service_learning_candidates set occurrence_count=least(occurrence_count+1,1000000),last_seen_at=now(),confidence=greatest(coalesce(confidence,0),conf),
      source_message_ids=(select coalesce(array_agg(distinct x),'{}'::uuid[]) from unnest(coalesce(public.service_learning_candidates.source_message_ids,'{}'::uuid[])||coalesce(p_source_message_ids,'{}'::uuid[])) x),updated_at=now()
    where id=cid;
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
  values(p_conversation_id,p_last_message_id,summary_clean,safe_facts,msg_count,now(),1,encode(digest(summary_clean,'sha256'),'hex'),now(),jsonb_build_object('source','agent_core_async','sensitive_attributes_stored',false,'summary_rejected',summary_rejected))
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

revoke execute on function public.apply_agent_core_learning_result_v1(uuid,uuid,text,jsonb,jsonb,jsonb,boolean) from public,anon,authenticated;
revoke execute on function public.upsert_agent_core_learning_candidate_v1(text,text,jsonb,uuid,uuid[],numeric) from public,anon,authenticated;
grant execute on function public.apply_agent_core_learning_result_v1(uuid,uuid,text,jsonb,jsonb,jsonb,boolean) to service_role;
grant execute on function public.upsert_agent_core_learning_candidate_v1(text,text,jsonb,uuid,uuid[],numeric) to service_role;

commit;
