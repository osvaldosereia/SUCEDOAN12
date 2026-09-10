begin;

-- Rodada 1/4: limpeza da inteligência do atendimento WhatsApp.
-- Mantém histórico; duplicatas comprovadas são arquivadas, nunca apagadas.

create or replace function public.service_norm_text_v1(p_text text)
returns text
language sql
immutable
parallel safe
set search_path=''
as $$
  select trim(regexp_replace(
    translate(lower(coalesce(p_text,'')),
      'áàãâäéèêëíìîïóòõôöúùûüç',
      'aaaaaeeeeiiiiooooouuuuc'),
    '[^a-z0-9]+',' ','g'));
$$;

create or replace function public.classify_whatsapp_service_topic_v1(p_message text, p_stage text default null)
returns text
language plpgsql
immutable
set search_path=''
as $$
declare
  q text:=public.service_norm_text_v1(p_message);
  s text:=public.service_norm_text_v1(p_stage);
begin
  if q='' then return 'general'; end if;

  if q ~ '(^| )(falar|chamar|chama|quero|preciso).*(atendente|pessoa|humano|humana|equipe)( |$)' or q ~ '(^| )(atendente|humano|humana)( |$)' then return 'human'; end if;
  if q ~ '(privacidade|lgpd|meus dados|apagar dados|excluir dados|corrigir dados|dados pessoais|compartilhamento de dados)' then return 'privacy'; end if;
  if q ~ '(reembolso|devolucao|avariado|estragado|vencido|validade|produto errado|veio errado|faltou no pedido|nao veio|problema com o pedido|problema no pedido)' then return 'post_sale'; end if;
  if q ~ '(que horas.*entrega|horario.*entrega|entrega.*horario|hora.*entrega|previsao.*hora|janela.*entrega|chega que horas)' then return 'delivery_time'; end if;
  if q ~ '(taxa.*entrega|entrega.*taxa|frete|cobra.*entrega|custo.*entrega|entrega gratis|entrega gratuita)' then return 'delivery_fee'; end if;
  if q ~ '(quando entrega|entrega hoje|entrega amanha|prazo.*entrega|depois das 11|apos as 11|ate as 11|mesmo dia|proximo dia util)' then return 'delivery_promise'; end if;
  if q ~ '(entrega.*cuiaba|entrega.*varzea|onde entrega|quais bairros|area.*entrega|atende.*cuiaba|atende.*varzea|entrega onde)' then return 'delivery_area'; end if;
  if q ~ '(pedido minimo|minimo.*pedido|valor minimo|minimo.*entrega)' then return 'minimum_order'; end if;
  if q ~ '(pagamento|como pagar|como paga|pagar|pix|cartao|credito|debito|dinheiro|alelo|sodexo|puxee|cajur|flash|ifood|boleto|30 dias|parcel)' then return 'payment'; end if;
  if q ~ '(repetir.*pedido|repete.*pedido|mesmo de sempre|igual.*outra vez|igual.*ultima|ultimo pedido|pedido anterior)' then return 'reorder'; end if;
  if q ~ '(qual.*melhor|recomenda|recomendacao|indica|indicacao|comparar|comparacao|qual escolher)' then return 'recommendation'; end if;
  if q ~ '(muito caro|ta caro|esta caro|achei caro|nao confio|complicado|dificil comprar|demora demais)' then return 'objection'; end if;
  if q ~ '(nao funciona|ja falei|ja disse|voce nao entende|nao esta entendendo|cansei|irritad|horrivel)' then return 'frustrated'; end if;
  if q ~ '(personalizar.*cesta|cesta.*personalizar|trocar.*cesta|cesta.*trocar|retirar.*cesta|cesta.*retirar|mudar.*cesta|cesta.*mudar)' or s like '%basket%' and q ~ '(trocar|retirar|substituir|aumentar|diminuir)' then return 'basket_customization'; end if;
  if q ~ '(^| )(cesta|cestas|cesta basica|cestas basicas)( |$)' then return 'basket'; end if;
  if q ~ '(finalizar|fechar pedido|concluir pedido|confirmar pedido|checkout|meu carrinho|ver carrinho|resumo do pedido)' then return 'checkout'; end if;
  if q in ('oi','oii','oiii','ola','olaa','bom dia','boa tarde','boa noite','menu','inicio','iniciar') then return 'greeting'; end if;
  if q ~ '(tem |temos |voces tem|voce tem|preco|quanto custa|quanto ta|quanto esta|marca|produto|adicion|acrescent|coloca|coloque|quero comprar|preciso de|procuro|buscar|encontrar)' then return 'product_search'; end if;
  return 'general';
end;
$$;

-- Roteiro mestre: usa o editor de Procedimentos já existente no Admin.
insert into public.service_procedures(
  procedure_key,title,trigger_description,steps,allowed_actions,confirmation_actions,fallback,status,priority,version_no
)
select
  'service_playbook_master_v1',
  'Roteiro mestre do atendimento Dona Antônia',
  'Orientação geral para todas as conversas do WhatsApp; as regras específicas e os dados atuais sempre prevalecem.',
  jsonb_build_array(
    'Entender e responder primeiro a intenção atual; não obrigar o cliente a passar por menu ou perguntas que não sejam necessárias.',
    'Usar o Flow ou recurso estruturado para escolher, personalizar e finalizar cestas quando estiver disponível; fora disso, manter o caminho mais curto e seguro no WhatsApp.',
    'Para produtos avulsos, consultar somente o catálogo atual do sistema; responder disponibilidade e preço e usar o fluxo de pedido para adicionar ou alterar itens.',
    'No fechamento, aproveitar dados já conhecidos, pedir os dados mínimos faltantes de uma vez, mostrar resumo curto e exigir confirmação explícita antes da ação final.',
    'Quando houver regra ausente, conflito, solicitação humana, pós-venda sensível ou duas tentativas sem progresso, transferir com resumo para a equipe sem fazer o cliente repetir tudo.'
  ),
  array['search_product','show_product','show_baskets','show_basket','cart_summary','checkout_preview','conversation_summary','handoff']::text[],
  array['confirm_order']::text[],
  'Não inventar preço, estoque, prazo, política ou promessa. Se faltar verdade confiável, fazer handoff.',
  'published',100,1
where not exists (
  select 1 from public.service_procedures where procedure_key='service_playbook_master_v1' and version_no=1
);

-- Duplicatas exatas/semânticas comprovadas na auditoria. Preserva registros para histórico.
update public.service_knowledge_items
   set status='archived',updated_at=now()
 where status='published'
   and knowledge_key='formas_pagamento_cestas_v1';

update public.service_guidance_rules
   set status='archived',updated_at=now()
 where status='published'
   and rule_key in ('payment_exact_answer_v1','free_delivery_policy','delivery_time_handoff_policy');

create or replace function public.get_service_intelligence_compact_v3(
  p_channel text default 'whatsapp',
  p_query text default null,
  p_intent text default null,
  p_stage text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  cfg public.service_intelligence_runtime_config%rowtype;
  k jsonb:='[]'::jsonb;
  g jsonb:='[]'::jsonb;
  p jsonb:='[]'::jsonb;
  playbook jsonb:='{}'::jsonb;
  q text:=left(trim(coalesce(p_query,'')),300);
  nq text:=public.service_norm_text_v1(q);
  topic text:=public.classify_whatsapp_service_topic_v1(q,p_stage);
  intent_hint text;
begin
  select * into cfg from public.service_intelligence_runtime_config where id=1;
  if not found or not cfg.enabled or cfg.execution_mode='off' then
    return jsonb_build_object('enabled',false,'topic',topic,'knowledge','[]'::jsonb,'guidance','[]'::jsonb,'procedures','[]'::jsonb,'playbook','{}'::jsonb,'retrieval','off');
  end if;

  intent_hint:=coalesce(nullif(p_intent,''),case topic
    when 'basket' then 'baskets'
    when 'basket_customization' then 'baskets'
    when 'checkout' then 'checkout'
    when 'product_search' then 'product_search'
    when 'recommendation' then 'compare_products'
    when 'post_sale' then 'complaint'
    when 'privacy' then 'privacy'
    when 'human' then 'human'
    when 'greeting' then 'greeting'
    when 'objection' then 'objection'
    else 'answer' end);

  if cfg.knowledge_enabled and nq<>'' then
    with scored as (
      select x.*,
        (
          case
            when topic='payment' and x.knowledge_key='payment_baseline' then 900
            when topic='delivery_fee' and x.knowledge_key='entrega_taxa_v1' then 900
            when topic='delivery_time' and x.knowledge_key='entrega_horario_rota_v1' then 900
            when topic='delivery_promise' and x.knowledge_key='entrega_prazo_11h_v1' then 900
            when topic='delivery_area' and x.knowledge_key='delivery_area' then 900
            when topic='minimum_order' and x.knowledge_key='info_pedido_minimo_mttk8umi_3b8m' then 900
            when topic='basket' and x.knowledge_key='basket_commercial_price' then 850
            when topic='basket' and x.knowledge_key='basket_customization' then 650
            when topic='basket_customization' and x.knowledge_key='basket_customization' then 900
            when topic='basket_customization' and x.knowledge_key='substitution_behavior' then 700
            when topic='post_sale' and x.knowledge_key='info_trocas_devolucoes_e_problemas_com_produtos_mttk8umi_amnk' then 900
            when topic='privacy' and x.knowledge_key='info_dados_pessoais_e_canal_de_privacidade_mttk8umi_gnoi' then 900
            when topic='checkout' and x.knowledge_key='order_confirmation_customer_view' then 700
            when topic='product_search' and x.knowledge_key='catalog_truth' then 500
            else 0
          end
          + coalesce((select count(*)::int*140 from unnest(coalesce(x.keywords,'{}'::text[])) kw where length(public.service_norm_text_v1(kw))>=2 and nq like '%'||public.service_norm_text_v1(kw)||'%'),0)
          + coalesce((select count(*)::int*12 from regexp_split_to_table(nq,'\s+') tok where length(tok)>=3 and public.service_norm_text_v1(coalesce(x.title,'')||' '||coalesce(x.content,'')) like '%'||tok||'%'),0)
        )::int as score
      from public.service_knowledge_items x
      where x.status='published'
        and p_channel=any(x.channel_scope)
        and (x.valid_from is null or x.valid_from<=now())
        and (x.valid_until is null or x.valid_until>now())
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'key',r.knowledge_key,'title',left(r.title,100),'content',left(r.content,520),'score',r.score
    ) order by r.score desc,r.priority desc,r.updated_at desc),'[]'::jsonb)
      into k
      from (select * from scored where score>0 order by score desc,priority desc,updated_at desc limit least(cfg.max_knowledge_items,3)) r;
  end if;

  if cfg.guidance_enabled and nq<>'' then
    with scored as (
      select x.*,
        (
          case
            when topic='payment' and x.rule_key='basic_payment_policy' then 1000
            when topic='delivery_fee' and x.rule_key='delivery_free_v1' then 1000
            when topic='delivery_time' and x.rule_key='delivery_time_handoff_v1' then 1000
            when topic in ('delivery_promise','delivery_area') and 'delivery'=any(x.behavior_tags) then 650
            when topic in ('basket','basket_customization') and x.rule_key='basket_simple_sales_flow' then 850
            when topic='checkout' and x.rule_key='checkout_address_before_confirmation' then 900
            when topic='post_sale' and 'post_sale'=any(x.behavior_tags) then 900
            when topic='privacy' and 'privacy'=any(x.behavior_tags) then 900
            when topic='recommendation' and ('recommendation'=any(x.behavior_tags) or 'comparison'=any(x.behavior_tags)) then 900
            when topic='objection' and 'objection'=any(x.behavior_tags) then 900
            when topic='frustrated' and ('deescalation'=any(x.behavior_tags) or 'loop_prevention'=any(x.behavior_tags)) then 900
            when topic='human' and 'handoff'=any(x.behavior_tags) then 800
            when topic='product_search' and ('catalog'=any(x.behavior_tags) or 'exploration'=any(x.behavior_tags)) then 550
            else 0
          end
          + coalesce((select count(*)::int*16 from regexp_split_to_table(nq,'\s+') tok where length(tok)>=4 and public.service_norm_text_v1(coalesce(x.title,'')||' '||coalesce(x.instruction,'')||' '||array_to_string(coalesce(x.behavior_tags,'{}'::text[]),' ')) like '%'||tok||'%'),0)
        )::int as score
      from public.service_guidance_rules x
      where x.status='published'
        and p_channel=any(x.channel_scope)
        and (cardinality(x.intent_scope)=0 or intent_hint=any(x.intent_scope))
        and (cardinality(x.stage_scope)=0 or nullif(p_stage,'') is null or p_stage=any(x.stage_scope))
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'key',r.rule_key,'title',left(r.title,100),'instruction',left(r.instruction,420),'behavior_tags',r.behavior_tags,'score',r.score
    ) order by r.score desc,r.priority desc,r.updated_at desc),'[]'::jsonb)
      into g
      from (select * from scored where score>0 order by score desc,priority desc,updated_at desc limit least(cfg.max_guidance_items,2)) r;
  end if;

  if cfg.procedures_enabled then
    select coalesce(jsonb_build_object(
      'key',x.procedure_key,'title',left(x.title,100),'steps',left(x.steps::text,620),'fallback',left(coalesce(x.fallback,''),180)
    ),'{}'::jsonb)
      into playbook
      from public.service_procedures x
      where x.status='published' and x.procedure_key='service_playbook_master_v1'
      order by x.version_no desc,x.updated_at desc limit 1;

    with wanted as (
      select case topic
        when 'basket' then 'regra_comprar_e_personalizar_cesta_basica_mttk8umi_yaz0'
        when 'basket_customization' then 'regra_comprar_e_personalizar_cesta_basica_mttk8umi_yaz0'
        when 'checkout' then 'order_checkout'
        when 'reorder' then 'regra_repetir_compra_usando_historico_mttk8umi_mcay'
        when 'post_sale' then 'regra_atendimento_de_troca_avaria_ou_pos_venda_mttk8umi_7l1c'
        when 'privacy' then 'regra_solicitacao_de_privacidade_ou_dados_pessoais_mttk8umi_sx5a'
        when 'human' then 'regra_transferir_para_atendimento_humano_mttk8umi_dj15'
        when 'greeting' then 'regra_recepcao_personalizada_no_primeiro_contato_mttk8umi_wj7w'
        when 'recommendation' then 'regra_comparar_e_recomendar_produtos_mttk8umi_qglg'
        when 'objection' then 'regra_resolver_objecao_de_compra_mttk8umi_7asu'
        when 'frustrated' then 'regra_recuperar_conversa_com_cliente_frustrado_mttk8umi_3ewq'
        when 'product_search' then 'product_purchase'
        else null end as procedure_key
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'key',x.procedure_key,'title',left(x.title,100),'trigger',left(x.trigger_description,220),'steps',left(x.steps::text,650),'allowed_actions',x.allowed_actions,'confirmation_actions',x.confirmation_actions,'fallback',left(coalesce(x.fallback,''),180)
    ) order by x.priority desc,x.version_no desc),'[]'::jsonb)
      into p
      from public.service_procedures x,wanted w
      where w.procedure_key is not null and x.procedure_key=w.procedure_key and x.status='published'
      and x.version_no=(select max(y.version_no) from public.service_procedures y where y.procedure_key=x.procedure_key and y.status='published');
  end if;

  return jsonb_build_object(
    'enabled',true,
    'execution_mode',cfg.execution_mode,
    'topic',topic,
    'intent_hint',intent_hint,
    'playbook',coalesce(playbook,'{}'::jsonb),
    'knowledge',k,
    'guidance',g,
    'procedures',p,
    'retrieval','topic_keyword_compact_v3'
  );
end;
$$;

create or replace function public.build_whatsapp_sales_context_v1(p_conversation_id uuid,p_message_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  c public.conversations%rowtype;
  m public.messages%rowtype;
  customer jsonb;
  history jsonb;
  products jsonb:='[]'::jsonb;
  cart_full jsonb;
  cart jsonb;
  compact_items jsonb:='[]'::jsonb;
  intelligence jsonb;
  q text;
  topic text;
  st jsonb;
  v_reset_at timestamptz;
begin
  select * into c from public.conversations where id=p_conversation_id;
  if not found then raise exception 'conversation_not_found'; end if;
  select * into m from public.messages where id=p_message_id and conversation_id=c.id;
  if not found then raise exception 'message_not_found'; end if;
  select r.reset_at into v_reset_at from public.whatsapp_order_context_resets r where r.conversation_id=c.id;
  q:=left(coalesce(m.body_text,m.transcript,''),300);
  topic:=public.classify_whatsapp_service_topic_v1(q,c.stage);

  select case when u.id is null then null else jsonb_build_object('id',u.id,'name',left(u.name,100),'preferred_reply',u.preferred_reply,'order_count',u.order_count,'last_order_at',u.last_order_at) end
    into customer from public.customers u where u.id=c.customer_id;

  select coalesce(jsonb_agg(jsonb_build_object('direction',x.direction,'type',x.message_type,'text',left(coalesce(x.body_text,x.transcript,''),220)) order by x.created_at),'[]'::jsonb)
    into history
    from (select direction,message_type,body_text,transcript,created_at from public.messages where conversation_id=c.id and created_at>coalesce(v_reset_at,'-infinity'::timestamptz) order by created_at desc limit 4) x;

  if topic in ('product_search','recommendation','basket_customization','general') then
    select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) into products from public.search_whatsapp_sellable_products_v1(left(q,100),5) s;
  end if;

  cart_full:=public.get_whatsapp_sales_cart_v1(c.id);
  if jsonb_typeof(cart_full->'items')='array' then
    select coalesce(jsonb_agg(jsonb_build_object('product_id',x->>'product_id','name',left(x->>'name',90),'quantity',x->'quantity','unit_price',x->'unit_price','line_total',x->'line_total','source',x->>'source')),'[]'::jsonb)
      into compact_items from (select value x from jsonb_array_elements(cart_full->'items') limit 16) i;
  end if;
  cart:=jsonb_build_object('exists',coalesce((cart_full->>'exists')::boolean,false),'id',cart_full->'id','status',cart_full->'status','total',cart_full->'total','items',compact_items);
  intelligence:=public.get_service_intelligence_compact_v3('whatsapp',q,null,c.stage);
  select to_jsonb(x) into st from public.whatsapp_sales_state x where x.conversation_id=c.id;

  return jsonb_build_object(
    'conversation',jsonb_build_object('id',c.id,'stage',c.stage,'mode',c.mode,'fast_checkout',c.fast_checkout,'upsell_declined',c.upsell_declined),
    'message',jsonb_build_object('id',m.id,'type',m.message_type,'text',left(coalesce(m.body_text,m.transcript,''),1000),'interactive',jsonb_build_object('id',coalesce(m.ai_interpretation->>'id',''))),
    'customer',customer,
    'cart',cart,
    'sales_state',coalesce(st,'{}'::jsonb),
    'product_candidates',products,
    'history',history,
    'intelligence',intelligence,
    'catalog_source','counter_verified',
    'history_scope','current_order_only_topic_compact_v4'
  );
end;
$$;

-- Telemetria de cache GPT-5.6. Não altera preço nem modelo; apenas passa a registrar o que a API reportar.
alter table public.ai_usage_events add column if not exists cached_input_tokens integer;
alter table public.ai_usage_events add column if not exists cache_write_tokens integer;

create or replace function public.finish_whatsapp_sales_job_v1(
  p_job_id uuid,p_worker text,p_attempt integer,p_result jsonb,p_usage jsonb default '{}'::jsonb,p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare j public.ai_jobs%rowtype; m public.messages%rowtype;
begin
  select * into j from public.ai_jobs where id=p_job_id for update; if not found then raise exception 'job_not_found'; end if;
  if j.status='done' then return jsonb_build_object('status','done','duplicate',true); end if;
  if j.status<>'processing' or j.locked_by is distinct from p_worker or j.attempts<>p_attempt then raise exception 'stale_job_lease'; end if;
  select * into m from public.messages where id=j.message_id for update;
  update public.ai_usage_events set
    status=case when p_error is null then 'done' else 'error' end,
    model=left(p_usage->>'model',100),provider_request_id=left(p_usage->>'provider_request_id',200),
    input_tokens=nullif(p_usage->>'input_tokens','')::integer,output_tokens=nullif(p_usage->>'output_tokens','')::integer,
    cached_input_tokens=nullif(p_usage->>'cached_input_tokens','')::integer,
    cache_write_tokens=nullif(p_usage->>'cache_write_tokens','')::integer,
    audio_seconds=nullif(p_usage->>'audio_seconds','')::numeric,
    estimated_cost_usd=nullif(p_usage->>'estimated_cost_usd','')::numeric,
    pricing_version=left(p_usage->>'pricing_version',100),finished_at=now()
    where job_id=j.id and attempt=j.attempts;
  if p_error is not null then
    update public.ai_jobs set status='error',error_message=left(p_error,100),updated_at=now() where id=j.id;
    if j.job_type='vision' then update public.room_media set processing_status='error',processing_error=left(p_error,100) where message_id=j.message_id; end if;
    return jsonb_build_object('status','error');
  end if;
  update public.messages set ai_interpretation=coalesce(ai_interpretation,'{}'::jsonb)||jsonb_build_object('sales_mvp',true,'sales_plan',coalesce(p_result->'plan','{}'::jsonb),'sales_action_result',coalesce(p_result->'action_result','{}'::jsonb),'source','conversation_worker_v3') where id=j.message_id;
  if j.job_type='vision' then update public.room_media set processing_status='processed',processing_error=null where message_id=j.message_id; end if;
  update public.ai_jobs set status='done',result=coalesce(p_result,'{}'::jsonb),error_message=null,updated_at=now() where id=j.id;
  return jsonb_build_object('status','done','reply_suppressed',true,'sales_mvp',true);
end;
$$;

-- Fundação segura de memória/aprendizado. Nada aqui publica conhecimento automaticamente.
create table if not exists public.conversation_memory_snapshots(
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  last_message_id uuid references public.messages(id) on delete set null,
  summary text not null default '',
  salient_facts jsonb not null default '[]'::jsonb,
  source_message_count integer not null default 0 check(source_message_count>=0),
  updated_at timestamptz not null default now()
);
alter table public.conversation_memory_snapshots enable row level security;

create table if not exists public.customer_service_memory(
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  memory_key text not null,
  memory_value text not null,
  confidence numeric(4,3) not null default 1 check(confidence>=0 and confidence<=1),
  source_message_id uuid references public.messages(id) on delete set null,
  status text not null default 'active' check(status in ('active','superseded','ignored')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists customer_service_memory_one_active_key_idx on public.customer_service_memory(customer_id,memory_key) where status='active';
alter table public.customer_service_memory enable row level security;

create table if not exists public.service_learning_candidates(
  id uuid primary key default gen_random_uuid(),
  candidate_type text not null check(candidate_type in ('knowledge','guidance','procedure')),
  title text not null,
  proposed_content jsonb not null,
  source_conversation_id uuid references public.conversations(id) on delete set null,
  source_message_ids uuid[] not null default '{}'::uuid[],
  confidence numeric(4,3) check(confidence is null or (confidence>=0 and confidence<=1)),
  status text not null default 'draft' check(status in ('draft','reviewing','rejected','published')),
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists service_learning_candidates_status_created_idx on public.service_learning_candidates(status,created_at desc);
alter table public.service_learning_candidates enable row level security;

revoke all on public.conversation_memory_snapshots from anon,authenticated;
revoke all on public.customer_service_memory from anon,authenticated;
revoke all on public.service_learning_candidates from anon,authenticated;
grant select,insert,update,delete on public.conversation_memory_snapshots to service_role;
grant select,insert,update,delete on public.customer_service_memory to service_role;
grant select,insert,update,delete on public.service_learning_candidates to service_role;

revoke all on function public.service_norm_text_v1(text) from public,anon,authenticated;
revoke all on function public.classify_whatsapp_service_topic_v1(text,text) from public,anon,authenticated;
revoke all on function public.get_service_intelligence_compact_v3(text,text,text,text) from public,anon,authenticated;
revoke all on function public.build_whatsapp_sales_context_v1(uuid,uuid) from public,anon,authenticated;
revoke all on function public.finish_whatsapp_sales_job_v1(uuid,text,integer,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.service_norm_text_v1(text) to service_role;
grant execute on function public.classify_whatsapp_service_topic_v1(text,text) to service_role;
grant execute on function public.get_service_intelligence_compact_v3(text,text,text,text) to service_role;
grant execute on function public.build_whatsapp_sales_context_v1(uuid,uuid) to service_role;
grant execute on function public.finish_whatsapp_sales_job_v1(uuid,text,integer,jsonb,jsonb,text) to service_role;

comment on function public.get_service_intelligence_compact_v3(text,text,text,text) is 'Seleção compacta de inteligência por assunto/keywords, sem fallback aleatório por prioridade.';
comment on table public.service_learning_candidates is 'Candidatos de aprendizado extraídos de conversas; sempre revisão humana antes de publicação global.';

commit;