begin;

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
  if q ~ '(que horas.*entrega|que horas.*chega|pedido.*chega.*hora|horario.*entrega|entrega.*horario|hora.*entrega|previsao.*hora|janela.*entrega|chega que horas)' then return 'delivery_time'; end if;
  if q ~ '(taxa.*entrega|entrega.*taxa|frete|cobra.*entrega|custo.*entrega|entrega gratis|entrega gratuita)' then return 'delivery_fee'; end if;
  if q ~ '(quando entrega|entrega hoje|entrega amanha|prazo.*entrega|depois das 11|apos as 11|ate as 11|mesmo dia|proximo dia util)' then return 'delivery_promise'; end if;
  if q ~ '(entrega.*cuiaba|entrega.*varzea|onde entrega|quais bairros|area.*entrega|atende.*cuiaba|atende.*varzea|entrega onde)' then return 'delivery_area'; end if;
  if q ~ '(pedido minimo|minimo.*pedido|valor minimo|minimo.*entrega)' then return 'minimum_order'; end if;
  if q ~ '(pagamento|como pagar|como paga|pagar|pix|cartao|credito|debito|dinheiro|alelo|sodexo|puxee|cajur|flash|ifood|boleto|30 dias|parcel)' then return 'payment'; end if;
  if q ~ '(repetir.*pedido|repete.*pedido|mesmo de sempre|igual.*outra vez|igual.*ultima|ultimo pedido|pedido anterior)' then return 'reorder'; end if;
  if q ~ '(qual.*melhor|recomenda|recomendacao|indica|indicacao|comparar|comparacao|qual escolher)' then return 'recommendation'; end if;
  if q ~ '(muito caro|ta caro|esta caro|achei caro|nao confio|complicado|dificil comprar|demora demais)' then return 'objection'; end if;
  if q ~ '(nao funciona|ja falei|ja disse|voce nao entende|nao esta entendendo|cansei|irritad|horrivel)' then return 'frustrated'; end if;
  if q ~ '(personalizar.*cesta|cesta.*personalizar|trocar.*cesta|cesta.*trocar|retirar.*cesta|cesta.*retirar|mudar.*cesta|cesta.*mudar)' or (s like '%basket%' and q ~ '(trocar|retirar|substituir|aumentar|diminuir)') then return 'basket_customization'; end if;
  if q ~ '(^| )(cesta|cestas|cesta basica|cestas basicas)( |$)' then return 'basket'; end if;
  if q ~ '(finalizar|fechar pedido|concluir pedido|confirmar pedido|checkout|meu carrinho|ver carrinho|resumo do pedido)' then return 'checkout'; end if;
  if q in ('oi','oii','oiii','ola','olaa','bom dia','boa tarde','boa noite','menu','inicio','iniciar') then return 'greeting'; end if;
  if q ~ '(tem |temos |voces tem|voce tem|preco|quanto custa|quanto ta|quanto esta|marca|produto|adicion|acrescent|coloca|coloque|quero comprar|preciso de|procuro|buscar|encontrar)' then return 'product_search'; end if;
  return 'general';
end;
$$;

-- Evita que coincidências fracas de palavras comuns contaminem assuntos já classificados.
create or replace function public.get_service_intelligence_compact_v3(
  p_channel text default 'whatsapp',p_query text default null,p_intent text default null,p_stage text default null
)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  cfg public.service_intelligence_runtime_config%rowtype;k jsonb:='[]'::jsonb;g jsonb:='[]'::jsonb;p jsonb:='[]'::jsonb;playbook jsonb:='{}'::jsonb;
  q text:=left(trim(coalesce(p_query,'')),300);nq text:=public.service_norm_text_v1(q);topic text:=public.classify_whatsapp_service_topic_v1(q,p_stage);intent_hint text;
begin
  select * into cfg from public.service_intelligence_runtime_config where id=1;
  if not found or not cfg.enabled or cfg.execution_mode='off' then return jsonb_build_object('enabled',false,'topic',topic,'knowledge','[]'::jsonb,'guidance','[]'::jsonb,'procedures','[]'::jsonb,'playbook','{}'::jsonb,'retrieval','off'); end if;
  intent_hint:=coalesce(nullif(p_intent,''),case topic when 'basket' then 'baskets' when 'basket_customization' then 'baskets' when 'checkout' then 'checkout' when 'product_search' then 'product_search' when 'recommendation' then 'compare_products' when 'post_sale' then 'complaint' when 'privacy' then 'privacy' when 'human' then 'human' when 'greeting' then 'greeting' when 'objection' then 'objection' else 'answer' end);

  if cfg.knowledge_enabled and nq<>'' then
    with scored as (
      select x.*,(case
        when topic='payment' and x.knowledge_key='payment_baseline' then 900 when topic='delivery_fee' and x.knowledge_key='entrega_taxa_v1' then 900
        when topic='delivery_time' and x.knowledge_key='entrega_horario_rota_v1' then 900 when topic='delivery_promise' and x.knowledge_key='entrega_prazo_11h_v1' then 900
        when topic='delivery_area' and x.knowledge_key='delivery_area' then 900 when topic='minimum_order' and x.knowledge_key='info_pedido_minimo_mttk8umi_3b8m' then 900
        when topic='basket' and x.knowledge_key='basket_commercial_price' then 850 when topic='basket' and x.knowledge_key='basket_customization' then 650
        when topic='basket_customization' and x.knowledge_key='basket_customization' then 900 when topic='basket_customization' and x.knowledge_key='substitution_behavior' then 700
        when topic='post_sale' and x.knowledge_key='info_trocas_devolucoes_e_problemas_com_produtos_mttk8umi_amnk' then 900
        when topic='privacy' and x.knowledge_key='info_dados_pessoais_e_canal_de_privacidade_mttk8umi_gnoi' then 900
        when topic='checkout' and x.knowledge_key='order_confirmation_customer_view' then 700 when topic='product_search' and x.knowledge_key='catalog_truth' then 500 else 0 end
        +coalesce((select count(*)::int*140 from unnest(coalesce(x.keywords,'{}'::text[])) kw where length(public.service_norm_text_v1(kw))>=2 and nq like '%'||public.service_norm_text_v1(kw)||'%'),0)
        +coalesce((select count(*)::int*12 from regexp_split_to_table(nq,'\s+') tok where length(tok)>=3 and public.service_norm_text_v1(coalesce(x.title,'')||' '||coalesce(x.content,'')) like '%'||tok||'%'),0))::int score
      from public.service_knowledge_items x where x.status='published' and p_channel=any(x.channel_scope) and (x.valid_from is null or x.valid_from<=now()) and (x.valid_until is null or x.valid_until>now())
    )
    select coalesce(jsonb_agg(jsonb_build_object('key',r.knowledge_key,'title',left(r.title,100),'content',left(r.content,520),'score',r.score) order by r.score desc,r.priority desc,r.updated_at desc),'[]'::jsonb) into k
    from (select * from scored where score>=case when topic='general' then 120 else 300 end order by score desc,priority desc,updated_at desc limit least(cfg.max_knowledge_items,3)) r;
  end if;

  if cfg.guidance_enabled and nq<>'' then
    with scored as (
      select x.*,(case
        when topic='payment' and x.rule_key='basic_payment_policy' then 1000 when topic='delivery_fee' and x.rule_key='delivery_free_v1' then 1000
        when topic='delivery_time' and x.rule_key='delivery_time_handoff_v1' then 1000 when topic in ('delivery_promise','delivery_area') and 'delivery'=any(x.behavior_tags) then 650
        when topic in ('basket','basket_customization') and x.rule_key='basket_simple_sales_flow' then 850 when topic='checkout' and x.rule_key='checkout_address_before_confirmation' then 900
        when topic='post_sale' and 'post_sale'=any(x.behavior_tags) then 900 when topic='privacy' and 'privacy'=any(x.behavior_tags) then 900
        when topic='recommendation' and ('recommendation'=any(x.behavior_tags) or 'comparison'=any(x.behavior_tags)) then 900
        when topic='objection' and 'objection'=any(x.behavior_tags) then 900 when topic='frustrated' and ('deescalation'=any(x.behavior_tags) or 'loop_prevention'=any(x.behavior_tags)) then 900
        when topic='human' and 'handoff'=any(x.behavior_tags) then 800 when topic='product_search' and ('catalog'=any(x.behavior_tags) or 'exploration'=any(x.behavior_tags)) then 550 else 0 end
        +coalesce((select count(*)::int*16 from regexp_split_to_table(nq,'\s+') tok where length(tok)>=4 and public.service_norm_text_v1(coalesce(x.title,'')||' '||coalesce(x.instruction,'')||' '||array_to_string(coalesce(x.behavior_tags,'{}'::text[]),' ')) like '%'||tok||'%'),0))::int score
      from public.service_guidance_rules x where x.status='published' and p_channel=any(x.channel_scope) and (cardinality(x.intent_scope)=0 or intent_hint=any(x.intent_scope)) and (cardinality(x.stage_scope)=0 or nullif(p_stage,'') is null or p_stage=any(x.stage_scope))
    )
    select coalesce(jsonb_agg(jsonb_build_object('key',r.rule_key,'title',left(r.title,100),'instruction',left(r.instruction,420),'behavior_tags',r.behavior_tags,'score',r.score) order by r.score desc,r.priority desc,r.updated_at desc),'[]'::jsonb) into g
    from (select * from scored where score>=case when topic='general' then 96 else 300 end order by score desc,priority desc,updated_at desc limit least(cfg.max_guidance_items,2)) r;
  end if;

  if cfg.procedures_enabled then
    select coalesce(jsonb_build_object('key',x.procedure_key,'title',left(x.title,100),'steps',left(x.steps::text,620),'fallback',left(coalesce(x.fallback,''),180)),'{}'::jsonb) into playbook
      from public.service_procedures x where x.status='published' and x.procedure_key='service_playbook_master_v1' order by x.version_no desc,x.updated_at desc limit 1;
    with wanted as (select case topic
      when 'basket' then 'regra_comprar_e_personalizar_cesta_basica_mttk8umi_yaz0' when 'basket_customization' then 'regra_comprar_e_personalizar_cesta_basica_mttk8umi_yaz0'
      when 'checkout' then 'order_checkout' when 'reorder' then 'regra_repetir_compra_usando_historico_mttk8umi_mcay'
      when 'post_sale' then 'regra_atendimento_de_troca_avaria_ou_pos_venda_mttk8umi_7l1c' when 'privacy' then 'regra_solicitacao_de_privacidade_ou_dados_pessoais_mttk8umi_sx5a'
      when 'human' then 'regra_transferir_para_atendimento_humano_mttk8umi_dj15' when 'greeting' then 'regra_recepcao_personalizada_no_primeiro_contato_mttk8umi_wj7w'
      when 'recommendation' then 'regra_comparar_e_recomendar_produtos_mttk8umi_qglg' when 'objection' then 'regra_resolver_objecao_de_compra_mttk8umi_7asu'
      when 'frustrated' then 'regra_recuperar_conversa_com_cliente_frustrado_mttk8umi_3ewq' when 'product_search' then 'product_purchase' else null end procedure_key)
    select coalesce(jsonb_agg(jsonb_build_object('key',x.procedure_key,'title',left(x.title,100),'trigger',left(x.trigger_description,220),'steps',left(x.steps::text,650),'allowed_actions',x.allowed_actions,'confirmation_actions',x.confirmation_actions,'fallback',left(coalesce(x.fallback,''),180)) order by x.priority desc,x.version_no desc),'[]'::jsonb) into p
      from public.service_procedures x,wanted w where w.procedure_key is not null and x.procedure_key=w.procedure_key and x.status='published' and x.version_no=(select max(y.version_no) from public.service_procedures y where y.procedure_key=x.procedure_key and y.status='published');
  end if;

  return jsonb_build_object('enabled',true,'execution_mode',cfg.execution_mode,'topic',topic,'intent_hint',intent_hint,'playbook',coalesce(playbook,'{}'::jsonb),'knowledge',k,'guidance',g,'procedures',p,'retrieval','topic_keyword_compact_v3_1');
end;
$$;

revoke all on function public.classify_whatsapp_service_topic_v1(text,text) from public,anon,authenticated;
revoke all on function public.get_service_intelligence_compact_v3(text,text,text,text) from public,anon,authenticated;
grant execute on function public.classify_whatsapp_service_topic_v1(text,text) to service_role;
grant execute on function public.get_service_intelligence_compact_v3(text,text,text,text) to service_role;

commit;