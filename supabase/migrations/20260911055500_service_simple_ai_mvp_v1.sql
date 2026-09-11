-- Dona Antônia: IA simples, estrita e incremental para o WhatsApp.
-- Uma única camada operacional decide; Agent Core/learning antigos ficam preservados, porém desligados.

create table if not exists public.service_simple_rules (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  variations text[] not null default '{}'::text[],
  answer text not null default '',
  response_mode text not null default 'text' check (response_mode in ('text','basket_flow','product_lookup','human','silence')),
  tool_config jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  priority smallint not null default 50 check (priority between 0 and 100),
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.service_simple_rules enable row level security;
revoke all on table public.service_simple_rules from public, anon, authenticated;
grant select,insert,update,delete on table public.service_simple_rules to service_role;
create index if not exists service_simple_rules_status_priority_idx on public.service_simple_rules(status,priority desc,updated_at desc);

create table if not exists public.service_simple_runtime_config (
  id smallint primary key default 1 check (id=1),
  enabled boolean not null default true,
  strict_mode boolean not null default true,
  classifier_ai_enabled boolean not null default true,
  generative_ai_enabled boolean not null default true,
  humanize_all_replies boolean not null default true,
  max_history_messages smallint not null default 4 check (max_history_messages between 0 and 8),
  max_candidate_rules smallint not null default 5 check (max_candidate_rules between 1 and 10),
  similarity_threshold numeric(4,3) not null default 0.500 check (similarity_threshold between 0 and 1),
  fallback_mode text not null default 'human' check (fallback_mode in ('human','silence')),
  updated_at timestamptz not null default now()
);

alter table public.service_simple_runtime_config enable row level security;
revoke all on table public.service_simple_runtime_config from public, anon, authenticated;
grant select,insert,update on table public.service_simple_runtime_config to service_role;
insert into public.service_simple_runtime_config(id) values(1)
on conflict(id) do update set enabled=true,strict_mode=true,classifier_ai_enabled=true,generative_ai_enabled=true,humanize_all_replies=true,max_history_messages=4,max_candidate_rules=5,similarity_threshold=0.500,fallback_mode='human',updated_at=now();

create or replace function public.normalize_service_question_v1(p_text text)
returns text language sql immutable set search_path='' as $$
  select trim(regexp_replace(
    translate(lower(coalesce(p_text,'')),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc'),
    '[^a-z0-9]+',' ','g'))
$$;

create or replace function public.get_service_simple_rule_candidates_v1(p_message text,p_limit integer default 5)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_message text:=public.normalize_service_question_v1(p_message);
  v_limit integer:=least(10,greatest(1,coalesce(p_limit,5)));
  v_rows jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(x) order by x.exact desc,x.score desc,x.priority desc),'[]'::jsonb)
  into v_rows
  from (
    select s.id,s.question,s.variations,s.answer,s.response_mode,s.tool_config,s.priority,
           max(case when n.normalized=v_message then 1 else 0 end)::int as exact,
           max(case when n.normalized=v_message then 1::real else extensions.similarity(n.normalized,v_message) end) as score
    from public.service_simple_rules s
    cross join lateral (
      select public.normalize_service_question_v1(p) normalized
      from unnest(array_prepend(s.question,s.variations)) p
    ) n
    where s.status='published' and n.normalized<>''
    group by s.id,s.question,s.variations,s.answer,s.response_mode,s.tool_config,s.priority
    order by exact desc,score desc,s.priority desc
    limit v_limit
  ) x;
  return jsonb_build_object('message_normalized',v_message,'candidates',v_rows);
end;
$$;
revoke all on function public.get_service_simple_rule_candidates_v1(text,integer) from public,anon,authenticated;
grant execute on function public.get_service_simple_rule_candidates_v1(text,integer) to service_role;

create or replace function public.queue_whatsapp_basket_flow_strict_v1(
  p_conversation_id uuid,p_source_message_id uuid,p_body_text text default 'Claro! Vou abrir nossas cestas para você.'
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_phone text;
  v_owner boolean:=false;
  v_result jsonb;
begin
  select c.wa_contact_e164 into v_phone from public.conversations c where c.id=p_conversation_id;
  if v_phone is null then return jsonb_build_object('ok',false,'reason','conversation_not_found'); end if;
  select exists(
    select 1 from public.whatsapp_test_allowlist w
    where w.phone_e164=v_phone and w.purpose='controlled_live_homologation'
      and w.enabled and (w.expires_at is null or w.expires_at>now())
  ) into v_owner;
  if v_owner then
    v_result:=public.queue_and_dispatch_whatsapp_flow_owner_homologation_v7(
      p_conversation_id,
      'simple-ai:'||coalesce(p_source_message_id::text,gen_random_uuid()::text),
      left(coalesce(nullif(trim(p_body_text),''),'Claro! Vou abrir nossas cestas para você.'),900)
    );
    return coalesce(v_result,'{}'::jsonb)||jsonb_build_object('lane','owner_v31');
  end if;
  v_result:=public.queue_whatsapp_basket_choice_flow_live_v1(
    p_conversation_id,p_source_message_id,left(coalesce(nullif(trim(p_body_text),''),'Escolha sua cesta básica.'),900)
  );
  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object('lane','commercial_current');
end;
$$;
revoke all on function public.queue_whatsapp_basket_flow_strict_v1(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.queue_whatsapp_basket_flow_strict_v1(uuid,uuid,text) to service_role;

insert into public.service_simple_rules(question,variations,answer,response_mode,status,priority)
select * from (values
('Olá',array['Oi','Oii','Bom dia','Boa tarde','Boa noite','Tudo bem?']::text[],'Olá! Que bom falar com você. Como posso ajudar?','text','published',100),
('Quero ver as cestas básicas',array['Quais cestas vocês têm?','Qual o valor das cestas?','Quanto custa a cesta?','Me mostra as cestas','Quero uma cesta básica','Quero ver as cestas']::text[],'Claro! Vou mostrar nossas cestas básicas para você.','basket_flow','published',100),
('Vocês têm este produto?',array['Tem leite?','Tem arroz?','Quanto custa o leite?','Qual o preço desse produto?','Vocês vendem esse produto?','Tem esse produto?']::text[],'Vou consultar o produto e o preço para você.','product_lookup','published',90),
('Quero falar com uma pessoa',array['Quero atendente','Falar com alguém','Chama uma pessoa','Atendimento humano','Quero falar com a equipe']::text[],'Claro. Vou chamar nossa equipe para continuar com você.','human','published',100)
) v(question,variations,answer,response_mode,status,priority)
where not exists(select 1 from public.service_simple_rules s where lower(s.question)=lower(v.question));

update public.agent_core_runtime_config
set enabled=false,execution_mode='off',shadow_openai_enabled=false,learning_write_enabled=false,escalation_enabled=false,memory_read_enabled=false,updated_at=now()
where id=1;

update public.service_intelligence_runtime_config
set enabled=false,knowledge_enabled=false,guidance_enabled=false,procedures_enabled=false,media_enabled=false,regression_suite_enabled=false,execution_mode='off',updated_at=now()
where id=1;

update public.automation_config
set ai_enabled=true,automation_enabled=true,conversation_worker_enabled=true,conversation_worker_dispatch_enabled=true,whatsapp_sales_mvp_enabled=true,whatsapp_auto_reply_enabled=true
where id=1;

alter table public.ai_jobs disable trigger a0z_agent_core_pre_router_state_v1;
alter table public.ai_jobs disable trigger a1_whatsapp_simple_product_query_v1;
alter table public.ai_jobs disable trigger a2_whatsapp_active_basket_address_guard_v52;
alter table public.ai_jobs disable trigger aa00_whatsapp_confirmed_basket_stale_buttons_v55;
alter table public.ai_jobs disable trigger aa_whatsapp_sales_greeting_fastpath;
alter table public.ai_jobs disable trigger aaa_whatsapp_basket_payment_checkout_v1;
alter table public.ai_jobs disable trigger ab_whatsapp_checkout_flow_v1;
alter table public.ai_jobs disable trigger trg_000_whatsapp_basket_choice_flow_v1;
alter table public.ai_jobs disable trigger trg_001_whatsapp_basket_fallback_v1;
alter table public.ai_jobs disable trigger trg_00_route_whatsapp_basket_swap_v1;
alter table public.ai_jobs disable trigger trg_00_whatsapp_flow_entry_v1;
alter table public.ai_jobs disable trigger trg_01_whatsapp_basket_personalization_choice_v1;
alter table public.ai_jobs disable trigger trg_agent_core_legacy_router_observe_v1;
alter table public.ai_jobs disable trigger trg_agent_core_shadow_postprocess_v1;
alter table public.ai_jobs disable trigger trg_route_whatsapp_basic_sales_ai_job_v1;
alter table public.ai_jobs disable trigger trg_whatsapp_sales_multi_search_cta_v1;
alter table public.messages disable trigger trg_agent_core_learning_message_v1;
