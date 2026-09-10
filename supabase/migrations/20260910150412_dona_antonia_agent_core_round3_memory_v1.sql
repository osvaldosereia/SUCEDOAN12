begin;

-- Dona Antônia Agent Core — Rodada 3/6.
-- Memória seletiva e candidatos de aprendizado. Mantém escrita automática OFF.

alter table public.agent_core_runtime_config
  add column if not exists memory_summary_max_chars integer not null default 700,
  add column if not exists memory_max_items smallint not null default 6,
  add column if not exists memory_inferred_min_confidence numeric not null default 0.820,
  add column if not exists memory_declared_ttl_days integer not null default 365,
  add column if not exists memory_inferred_ttl_days integer not null default 90,
  add column if not exists global_candidate_min_confidence numeric not null default 0.920,
  add column if not exists global_candidate_autopublish_enabled boolean not null default false;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='agent_core_memory_summary_max_chars_check') then
    alter table public.agent_core_runtime_config add constraint agent_core_memory_summary_max_chars_check check(memory_summary_max_chars between 240 and 1400);
  end if;
  if not exists(select 1 from pg_constraint where conname='agent_core_memory_max_items_check') then
    alter table public.agent_core_runtime_config add constraint agent_core_memory_max_items_check check(memory_max_items between 1 and 12);
  end if;
  if not exists(select 1 from pg_constraint where conname='agent_core_memory_inferred_confidence_check') then
    alter table public.agent_core_runtime_config add constraint agent_core_memory_inferred_confidence_check check(memory_inferred_min_confidence between 0.5 and 1);
  end if;
  if not exists(select 1 from pg_constraint where conname='agent_core_global_candidate_confidence_check') then
    alter table public.agent_core_runtime_config add constraint agent_core_global_candidate_confidence_check check(global_candidate_min_confidence between 0.7 and 1);
  end if;
end $$;

update public.agent_core_runtime_config
set learning_write_enabled=false,
    global_candidate_autopublish_enabled=false,
    updated_at=now()
where id=1;

alter table public.conversation_memory_snapshots
  add column if not exists summary_version integer not null default 1,
  add column if not exists summary_hash text,
  add column if not exists last_processed_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.customer_service_memory
  add column if not exists source_kind text not null default 'inferred',
  add column if not exists evidence_count integer not null default 1,
  add column if not exists last_evidence_at timestamptz not null default now(),
  add column if not exists value_hash text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='customer_service_memory_source_kind_check') then
    alter table public.customer_service_memory add constraint customer_service_memory_source_kind_check check(source_kind in ('declared','inferred','imported'));
  end if;
  if not exists(select 1 from pg_constraint where conname='customer_service_memory_evidence_count_check') then
    alter table public.customer_service_memory add constraint customer_service_memory_evidence_count_check check(evidence_count between 1 and 100000);
  end if;
end $$;

alter table public.service_learning_candidates
  add column if not exists normalized_hash text,
  add column if not exists occurrence_count integer not null default 1,
  add column if not exists first_seen_at timestamptz not null default now(),
  add column if not exists last_seen_at timestamptz not null default now(),
  add column if not exists source_kind text not null default 'agent_core_async',
  add column if not exists promoted_entity_type text,
  add column if not exists promoted_entity_id uuid,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='service_learning_candidates_occurrence_count_check') then
    alter table public.service_learning_candidates add constraint service_learning_candidates_occurrence_count_check check(occurrence_count between 1 and 1000000);
  end if;
end $$;

create index if not exists customer_service_memory_active_rank_idx
  on public.customer_service_memory(customer_id,source_kind,confidence desc,updated_at desc)
  where status='active';
create unique index if not exists service_learning_candidates_hash_uidx
  on public.service_learning_candidates(candidate_type,normalized_hash)
  where normalized_hash is not null;
create index if not exists service_learning_candidates_review_queue_idx
  on public.service_learning_candidates(status,confidence desc,occurrence_count desc,last_seen_at desc);

create or replace function public.agent_core_allowed_memory_key_v1(p_key text)
returns boolean language sql immutable parallel safe set search_path=''
as $$
  select lower(coalesce(p_key,'')) = any(array[
    'preferred_product','preferred_brand','avoid_product','substitution_preference',
    'basket_preference','contact_style','delivery_time_preference',
    'payment_method_preference','preferred_category'
  ]::text[]);
$$;

create or replace function public.agent_core_safe_memory_value_v1(p_value text)
returns boolean language plpgsql immutable set search_path=''
as $$
declare v text:=left(trim(coalesce(p_value,'')),180); n text:=public.service_norm_text_v1(v);
begin
  if length(v)<1 or length(v)>180 then return false; end if;
  if v ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}' then return false; end if;
  if regexp_replace(v,'\D','','g') ~ '[0-9]{10,}' then return false; end if;
  if n ~ '(^| )(cpf|cnpj|rg|documento|senha|password|cartao numero|cvv|codigo seguranca|endereco|rua|avenida|telefone|celular|email)( |$)' then return false; end if;
  if n ~ '(^| )(cancer|diabet|hiv|aids|gravida|gestante|doenca|medicamento|religiao|religioso|igreja|politic|partido|sindicato|sexual|gay|lesbica|crime|criminal|prisao)( |$)' then return false; end if;
  return true;
end $$;

create or replace function public.get_agent_core_selective_memory_v1(p_conversation_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare cfg public.agent_core_runtime_config%rowtype; c public.conversations%rowtype; summary_text text:=''; memories jsonb:='[]'::jsonb;
begin
  select * into cfg from public.agent_core_runtime_config where id=1;
  select * into c from public.conversations where id=p_conversation_id;
  if not found then return jsonb_build_object('summary','','memories','[]'::jsonb); end if;
  if coalesce(cfg.memory_read_enabled,false) then
    select left(s.summary,cfg.memory_summary_max_chars) into summary_text from public.conversation_memory_snapshots s where s.conversation_id=p_conversation_id;
    if c.customer_id is not null then
      select coalesce(jsonb_agg(jsonb_build_object('key',m.memory_key,'value',left(m.memory_value,180),'confidence',m.confidence,'source_kind',m.source_kind,'evidence_count',m.evidence_count)
        order by case m.source_kind when 'declared' then 0 when 'imported' then 1 else 2 end,m.confidence desc,m.updated_at desc),'[]'::jsonb)
      into memories
      from (select * from public.customer_service_memory x
            where x.customer_id=c.customer_id and x.status='active'
              and public.agent_core_allowed_memory_key_v1(x.memory_key)
              and public.agent_core_safe_memory_value_v1(x.memory_value)
              and (x.expires_at is null or x.expires_at>now())
            order by case x.source_kind when 'declared' then 0 when 'imported' then 1 else 2 end,x.confidence desc,x.updated_at desc
            limit cfg.memory_max_items) m;
    end if;
  end if;
  return jsonb_build_object('summary',coalesce(summary_text,''),'memories',memories);
end $$;

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
  vh:=encode(digest(lower(p_memory_key)||':'||public.service_norm_text_v1(p_memory_value),'sha256'),'hex');
  expires:=case when kind='inferred' then now()+make_interval(days=>cfg.memory_inferred_ttl_days) when kind='declared' then now()+make_interval(days=>cfg.memory_declared_ttl_days) else null end;
  if found and coalesce(existing.value_hash,'')=vh then
    update public.customer_service_memory set confidence=greatest(existing.confidence,conf),evidence_count=least(existing.evidence_count+1,100000),last_evidence_at=now(),
      source_message_id=coalesce(p_source_message_id,existing.source_message_id),source_kind=case when existing.source_kind='declared' then 'declared' else kind end,
      expires_at=case when existing.source_kind='declared' then existing.expires_at else expires end,metadata=coalesce(existing.metadata,'{}'::jsonb)||coalesce(p_metadata,'{}'::jsonb),updated_at=now()
    where id=existing.id;
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

revoke execute on function public.get_agent_core_selective_memory_v1(uuid) from public,anon,authenticated;
revoke execute on function public.upsert_agent_core_customer_memory_v1(uuid,text,text,text,numeric,uuid,jsonb) from public,anon,authenticated;
revoke execute on function public.upsert_agent_core_learning_candidate_v1(text,text,jsonb,uuid,uuid[],numeric) from public,anon,authenticated;
grant execute on function public.get_agent_core_selective_memory_v1(uuid) to service_role;
grant execute on function public.upsert_agent_core_customer_memory_v1(uuid,text,text,text,numeric,uuid,jsonb) to service_role;
grant execute on function public.upsert_agent_core_learning_candidate_v1(text,text,jsonb,uuid,uuid[],numeric) to service_role;

commit;
