-- Chat Comprar launch edge cases v1
-- Fecha casos reais encontrados no smoke sem aumentar o uso de IA.

-- INTENT: downy_especifico
with changed as (
  update public.service_simple_rules
     set variations = array['Quero amaciante Downy','Qual Downy vocês têm?','Tem Downy?','Quero Downy','Quero ver amaciante Downy']::text[],
         answer = 'Vou mostrar os amaciantes Downy disponíveis.',
         response_mode = 'product_lookup',
         tool_config = '{"query":"Downy"}'::jsonb,
         stages = jsonb_build_array(jsonb_build_object(
           'question','Quero amaciante Downy',
           'variations',to_jsonb(array['Quero amaciante Downy','Qual Downy vocês têm?','Tem Downy?','Quero Downy','Quero ver amaciante Downy']::text[]),
           'answer','Vou mostrar os amaciantes Downy disponíveis.',
           'response_mode','product_lookup',
           'tool_config','{"query":"Downy"}'::jsonb
         )),
         status = 'published',
         priority = 90,
         updated_at = now()
   where lower(trim(question)) = lower('Quero amaciante Downy')
  returning id
)
insert into public.service_simple_rules(question,variations,answer,response_mode,tool_config,stages,status,priority)
select
  'Quero amaciante Downy',
  array['Quero amaciante Downy','Qual Downy vocês têm?','Tem Downy?','Quero Downy','Quero ver amaciante Downy']::text[],
  'Vou mostrar os amaciantes Downy disponíveis.',
  'product_lookup',
  '{"query":"Downy"}'::jsonb,
  jsonb_build_array(jsonb_build_object(
    'question','Quero amaciante Downy',
    'variations',to_jsonb(array['Quero amaciante Downy','Qual Downy vocês têm?','Tem Downy?','Quero Downy','Quero ver amaciante Downy']::text[]),
    'answer','Vou mostrar os amaciantes Downy disponíveis.',
    'response_mode','product_lookup',
    'tool_config','{"query":"Downy"}'::jsonb
  )),
  'published',90
where not exists (select 1 from changed)
  and not exists (select 1 from public.service_simple_rules where lower(trim(question))=lower('Quero amaciante Downy'));

-- INTENT: abastecer_casa
with changed as (
  update public.service_simple_rules
     set variations = array['Preciso de uma opção simples para abastecer a casa','Quero abastecer a casa','Quero fazer a compra do mês','Preciso abastecer a despensa','Quero uma compra simples para casa']::text[],
         answer = 'Posso facilitar. Você pode escolher uma cesta pronta ou montar com produtos separados.',
         response_mode = 'reply_buttons',
         tool_config = '{"buttons":[{"label":"Ver cestas","value":"Cestas"},{"label":"Ver produtos","value":"Produtos"}]}'::jsonb,
         stages = jsonb_build_array(jsonb_build_object(
           'question','Quero uma opção simples para abastecer a casa',
           'variations',to_jsonb(array['Preciso de uma opção simples para abastecer a casa','Quero abastecer a casa','Quero fazer a compra do mês','Preciso abastecer a despensa','Quero uma compra simples para casa']::text[]),
           'answer','Posso facilitar. Você pode escolher uma cesta pronta ou montar com produtos separados.',
           'response_mode','reply_buttons',
           'tool_config','{"buttons":[{"label":"Ver cestas","value":"Cestas"},{"label":"Ver produtos","value":"Produtos"}]}'::jsonb
         )),
         status = 'published',
         priority = 89,
         updated_at = now()
   where lower(trim(question)) = lower('Quero uma opção simples para abastecer a casa')
  returning id
)
insert into public.service_simple_rules(question,variations,answer,response_mode,tool_config,stages,status,priority)
select
  'Quero uma opção simples para abastecer a casa',
  array['Preciso de uma opção simples para abastecer a casa','Quero abastecer a casa','Quero fazer a compra do mês','Preciso abastecer a despensa','Quero uma compra simples para casa']::text[],
  'Posso facilitar. Você pode escolher uma cesta pronta ou montar com produtos separados.',
  'reply_buttons',
  '{"buttons":[{"label":"Ver cestas","value":"Cestas"},{"label":"Ver produtos","value":"Produtos"}]}'::jsonb,
  jsonb_build_array(jsonb_build_object(
    'question','Quero uma opção simples para abastecer a casa',
    'variations',to_jsonb(array['Preciso de uma opção simples para abastecer a casa','Quero abastecer a casa','Quero fazer a compra do mês','Preciso abastecer a despensa','Quero uma compra simples para casa']::text[]),
    'answer','Posso facilitar. Você pode escolher uma cesta pronta ou montar com produtos separados.',
    'response_mode','reply_buttons',
    'tool_config','{"buttons":[{"label":"Ver cestas","value":"Cestas"},{"label":"Ver produtos","value":"Produtos"}]}'::jsonb
  )),
  'published',89
where not exists (select 1 from changed)
  and not exists (select 1 from public.service_simple_rules where lower(trim(question))=lower('Quero uma opção simples para abastecer a casa'));
