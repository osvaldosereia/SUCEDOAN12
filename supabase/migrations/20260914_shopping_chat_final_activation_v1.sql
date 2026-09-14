begin;

alter table public.service_simple_rules
  drop constraint if exists service_simple_rules_response_mode_check;

alter table public.service_simple_rules
  add constraint service_simple_rules_response_mode_check check (
    response_mode = any (array[
      'text','reply_buttons','cta_url','list_view','list_select','basket_flow','registration_flow','address_flow','custom_flow',
      'product_lookup','catalog_message','single_product','product_list','image','audio_ai','video','document','location','contact',
      'template_quick_reply','template_cta','template_carousel','template_catalog','template_multi_product','human','silence',
      'baskets','offers','products','checkout'
    ]::text[])
  );

update public.service_simple_runtime_config
set enabled=true,
    strict_mode=true,
    fallback_mode='silence',
    classifier_ai_enabled=true,
    generative_ai_enabled=true,
    humanize_all_replies=false,
    max_history_messages=2,
    max_candidate_rules=5,
    similarity_threshold=0.30,
    updated_at=now()
where id=1;

update public.service_simple_rules
set status='archived', updated_at=now()
where response_mode='human'
   or exists (
     select 1
     from jsonb_array_elements(coalesce(stages,'[]'::jsonb)) stage
     where stage->>'response_mode'='human'
   );

update public.service_simple_rules
set response_mode='baskets',
    answer='Claro! Veja nossas cestas básicas.',
    tool_config='{}'::jsonb,
    stages=jsonb_build_array(jsonb_build_object(
      'question',question,
      'variations',to_jsonb(variations),
      'answer','Claro! Veja nossas cestas básicas.',
      'response_mode','baskets',
      'tool_config','{}'::jsonb
    )),
    updated_at=now()
where lower(question)=lower('Quero ver as cestas básicas');

update public.service_simple_rules
set response_mode='reply_buttons',
    answer='Olá! Como posso ajudar?',
    tool_config=jsonb_build_object('buttons',jsonb_build_array(
      jsonb_build_object('label','Cestas','value','Cestas'),
      jsonb_build_object('label','Ofertas','value','Ofertas'),
      jsonb_build_object('label','Produtos','value','Produtos')
    )),
    stages=jsonb_build_array(jsonb_build_object(
      'question',question,
      'variations',to_jsonb(variations),
      'answer','Olá! Como posso ajudar?',
      'response_mode','reply_buttons',
      'tool_config',jsonb_build_object('buttons',jsonb_build_array(
        jsonb_build_object('label','Cestas','value','Cestas'),
        jsonb_build_object('label','Ofertas','value','Ofertas'),
        jsonb_build_object('label','Produtos','value','Produtos')
      ))
    )),
    updated_at=now()
where lower(question)=lower('Olá');

commit;
