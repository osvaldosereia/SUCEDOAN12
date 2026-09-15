begin;

do $$
declare
  v_variations text[] := array[
    'Quero produtos de limpeza',
    'Quero produtos de lavanderia',
    'Quero produtos para lavar roupa',
    'Produtos para lavar roupa',
    'Lavar roupa',
    'Sabao em po',
    'Detergente',
    'Amaciante',
    'Desinfetante',
    'Agua sanitaria',
    'Alvejante'
  ]::text[];
  v_tool jsonb := jsonb_build_object('category','limpeza_lavanderia');
  v_stages jsonb;
begin
  v_stages := jsonb_build_array(jsonb_build_object(
    'question','Quero produtos de limpeza e lavanderia',
    'variations',to_jsonb(v_variations),
    'answer','Veja os produtos de limpeza e lavanderia.',
    'response_mode','products',
    'tool_config',v_tool
  ));

  update public.service_simple_rules
  set variations=v_variations,
      answer='Veja os produtos de limpeza e lavanderia.',
      response_mode='products',
      tool_config=v_tool,
      stages=v_stages,
      status='published',
      priority=85,
      updated_at=now()
  where lower(question)=lower('Quero produtos de limpeza e lavanderia');

  if not found then
    insert into public.service_simple_rules (
      question, variations, answer, response_mode, tool_config, stages, status, priority
    ) values (
      'Quero produtos de limpeza e lavanderia',
      v_variations,
      'Veja os produtos de limpeza e lavanderia.',
      'products',
      v_tool,
      v_stages,
      'published',
      85
    );
  end if;
end $$;

commit;
