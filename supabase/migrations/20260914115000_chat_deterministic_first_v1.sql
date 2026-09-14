-- Chat Comprar deterministic-first v1
-- Objetivo: resolver o máximo possível por regra/ferramenta e usar IA apenas como classificador de fallback.

update public.products
set sales_category = case upper(trim(category))
  when 'BELEZA' then 'higiene_beleza'
  when 'SHAMPOO E CONDICIONADOR' then 'higiene_beleza'
  when 'HIGIENE' then 'higiene_beleza'
  when 'SABONETE' then 'higiene_beleza'
  when 'BEBÊ' then 'higiene_beleza'
  when 'DESODORANTE' then 'higiene_beleza'
  when 'LIMPEZA' then 'limpeza_lavanderia'
  when 'LAVANDERIA' then 'limpeza_lavanderia'
  when 'PETS' then 'casa_pet'
  when 'UTENSÍLIOS E UTILIDADES' then 'casa_pet'
  when 'TEMPEROS' then 'mercearia'
  when 'CAFÉ DA MANHÃ' then 'mercearia'
  when 'BOLACHAS E BISCOITOS' then 'mercearia'
  when 'MACARRÃO E MOLHOS' then 'mercearia'
  when 'MERCEARIA BÁSICA' then 'mercearia'
  when 'MOLHOS E CONDIMENTOS' then 'mercearia'
  when 'CONFEITARIA' then 'mercearia'
  when 'BALAS E CHICLETES' then 'mercearia'
  when 'SUCOS, REFRI E ENERGÉTICOS' then 'mercearia'
  when 'CHOCOLATES E DOCES' then 'mercearia'
  when 'SALGADINHOS E PETISCOS' then 'mercearia'
  else sales_category
end
where upper(trim(coalesce(category,''))) in (
  'BELEZA','SHAMPOO E CONDICIONADOR','HIGIENE','SABONETE','BEBÊ','DESODORANTE',
  'LIMPEZA','LAVANDERIA','PETS','UTENSÍLIOS E UTILIDADES','TEMPEROS','CAFÉ DA MANHÃ',
  'BOLACHAS E BISCOITOS','MACARRÃO E MOLHOS','MERCEARIA BÁSICA','MOLHOS E CONDIMENTOS',
  'CONFEITARIA','BALAS E CHICLETES','SUCOS, REFRI E ENERGÉTICOS','CHOCOLATES E DOCES','SALGADINHOS E PETISCOS'
);

update public.service_simple_runtime_config
set generative_ai_enabled = false,
    classifier_ai_enabled = true,
    humanize_all_replies = false,
    max_candidate_rules = 6,
    max_history_messages = 2,
    similarity_threshold = 0.42,
    updated_at = now()
where id = 1;

-- INTENT: saudacao
-- INTENT: quero_comprar
-- INTENT: ajuda_escolha
-- INTENT: ver_cestas
-- INTENT: trocar_cesta
-- INTENT: retirar_cesta
-- INTENT: adicionar_cesta
-- INTENT: cesta_padrao
-- INTENT: pagamento
-- INTENT: cartao_alimentacao
-- INTENT: parcelamento
-- INTENT: fiado
-- INTENT: entrega_area
-- INTENT: entrega_condicoes
-- INTENT: ver_produtos
-- INTENT: mercearia
-- INTENT: limpeza
-- INTENT: higiene
-- INTENT: pet
-- INTENT: cafe_manha
-- INTENT: procurar_produto
-- INTENT: ofertas
-- INTENT: checkout
-- INTENT: pessoa
-- INTENT: agradecimento

with seed(question,variations,answer,response_mode,tool_config,priority) as (
  values
  ('Olá',array['Oi','Oii','Oie','Bom dia','Boa tarde','Boa noite','Tudo bem?','Olá, tudo bem?']::text[],
   'Olá! Como posso ajudar?', 'reply_buttons',
   '{"buttons":[{"label":"Cestas","value":"Cestas"},{"label":"Produtos","value":"Produtos"},{"label":"Pagamento","value":"Formas de pagamento"}]}'::jsonb,100),

  ('Quero comprar',array['Quero fazer uma compra','Quero montar meu pedido','Preciso comprar','Como faço para comprar?','Me ajuda a comprar','Quero pedir']::text[],
   'Claro. Você pode começar pelas cestas básicas ou escolher produtos separados.', 'reply_buttons',
   '{"buttons":[{"label":"Cestas","value":"Cestas"},{"label":"Produtos","value":"Produtos"},{"label":"Finalizar","value":"Quero finalizar minha compra"}]}'::jsonb,98),

  ('Preciso de ajuda para escolher',array['Não sei o que comprar','Não sei qual escolher','Me ajuda a escolher','O que você recomenda?','Qual opção é melhor pra mim?','Estou em dúvida']::text[],
   'Posso facilitar. Escolha se você quer ver cestas prontas ou produtos separados.', 'reply_buttons',
   '{"buttons":[{"label":"Ver cestas","value":"Cestas"},{"label":"Ver produtos","value":"Produtos"},{"label":"Pagamento","value":"Formas de pagamento"}]}'::jsonb,96),

  ('Quero ver as cestas básicas',array['Quais cestas vocês têm?','Qual o valor das cestas?','Quanto custa a cesta?','Me mostra as cestas','Quero uma cesta básica','Quero ver as cestas','Preço das cestas','Tem cesta básica?']::text[],
   'Claro! Veja nossas cestas básicas e os valores atualizados.', 'baskets','{}'::jsonb,95),

  ('Posso trocar produtos da cesta',array['Posso trocar produto da cesta?','Dá para trocar itens?','Quero substituir um produto','Posso mudar os produtos da cesta?','Quero trocar um item','Tem como trocar produto?']::text[],
   'Sim. Você pode personalizar a cesta, trocando ou ajustando itens permitidos antes de finalizar.', 'reply_buttons',
   '{"buttons":[{"label":"Ver cestas","value":"Cestas"},{"label":"Ver produtos","value":"Produtos"}]}'::jsonb,94),

  ('Posso retirar produtos da cesta',array['Posso tirar um produto?','Quero retirar um item','Dá para remover produto da cesta?','Não quero um produto da cesta','Posso diminuir itens?']::text[],
   'Sim. Os itens permitidos podem ser retirados ou ter a quantidade ajustada na personalização da cesta.', 'reply_buttons',
   '{"buttons":[{"label":"Ver cestas","value":"Cestas"},{"label":"Finalizar","value":"Quero finalizar minha compra"}]}'::jsonb,93),

  ('Posso adicionar mais produtos à cesta',array['Posso colocar mais arroz?','Quero acrescentar produtos','Quero adicionar mais coisas','Dá para aumentar a quantidade?','Posso incluir outros produtos?','Quero produtos extras']::text[],
   'Sim. Você pode acrescentar produtos e ajustar quantidades antes de finalizar.', 'reply_buttons',
   '{"buttons":[{"label":"Produtos","value":"Produtos"},{"label":"Cestas","value":"Cestas"},{"label":"Finalizar","value":"Quero finalizar minha compra"}]}'::jsonb,93),

  ('Quero a cesta sem alterações',array['Quero essa cesta do jeito que está','Quero a cesta padrão','Não quero trocar nada','Pode ser a cesta normal','Quero como vem']::text[],
   'Perfeito. Escolha a cesta e mantenha a composição padrão para seguir ao fechamento.', 'baskets','{}'::jsonb,92),

  ('Como posso pagar',array['Quais formas de pagamento?','Forma de pagamento','Aceita PIX?','Aceita cartão?','Posso pagar em dinheiro?','Posso pagar quando receber?','Pagamento na entrega?']::text[],
   'O pagamento é feito na entrega. Aceitamos PIX, cartão de crédito, cartão alimentação/refeição e dinheiro.', 'text','{}'::jsonb,91),

  ('Aceita Alelo',array['Aceita cartão alimentação?','Aceita cartão refeição?','Aceita Sodexo?','Aceita Pluxee?','Aceita Caju?','Aceita iFood Benefícios?','Quais cartões alimentação aceita?']::text[],
   'Aceitamos cartões alimentação/refeição na entrega, incluindo Alelo, Sodexo/Pluxee, iFood Benefícios e Caju.', 'text','{}'::jsonb,91),

  ('Posso parcelar no cartão',array['Parcela no cartão?','Quantas vezes parcela?','Tem parcelamento?','Posso dividir no crédito?','Cartão de crédito parcela?']::text[],
   'Sim. No cartão de crédito, o pagamento pode ser feito em até 3x sem juros na entrega.', 'text','{}'::jsonb,90),

  ('Vocês vendem fiado',array['Faz fiado?','Posso pagar depois?','Vende para pagar depois?','Tem boleto?','Pode pagar em 30 dias?','Anota pra mim?']::text[],
   'Não trabalhamos com fiado. O pagamento é feito na entrega por PIX, cartão de crédito, cartão alimentação/refeição ou dinheiro.', 'text','{}'::jsonb,90),

  ('Vocês entregam',array['Tem entrega?','Faz entrega?','Entrega em Cuiabá?','Entrega em Várzea Grande?','Onde vocês entregam?','Qual região atende?']::text[],
   'Entregamos em Cuiabá e Várzea Grande. Os dados da entrega são confirmados no fechamento do pedido.', 'text','{}'::jsonb,89),

  ('Entrega hoje ou quanto custa a entrega',array['Entrega hoje?','Quanto é a entrega?','Qual a taxa de entrega?','Que horas entrega?','Quando meu pedido chega?','Tem entrega para hoje?']::text[],
   'A disponibilidade e as condições da entrega são confirmadas no fechamento do pedido conforme endereço e rota.', 'text','{}'::jsonb,88),

  ('Quero ver produtos',array['O que vocês vendem?','Quero comprar outros produtos','Mostra os produtos','Quero produtos separados','Ver catálogo','Quero escolher produtos']::text[],
   'Escolha uma categoria para ver os produtos disponíveis.', 'reply_buttons',
   '{"buttons":[{"label":"Mercearia","value":"Mercearia"},{"label":"Limpeza","value":"Limpeza"},{"label":"Higiene","value":"Higiene e beleza"},{"label":"Casa e Pet","value":"Casa e Pet"}]}'::jsonb,87),

  ('Quero produtos de mercearia',array['Mercearia','Quero alimentos','Quero mantimentos','Produtos de mercado','Comida','Produtos para despensa']::text[],
   'Veja os produtos de mercearia disponíveis.', 'products','{"category":"mercearia"}'::jsonb,86),

  ('Quero produtos de limpeza e lavanderia',array['Quero produtos de limpeza','Quero produtos de lavanderia','Quero produtos para lavar roupa','Produtos para lavar roupa','Lavar roupa','Quero coisas para limpar a casa','Preciso fazer uma compra de limpeza completa']::text[],
   'Veja os produtos de limpeza e lavanderia.', 'products','{"category":"limpeza_lavanderia"}'::jsonb,86),

  ('Quero produtos de higiene e beleza',array['Higiene e beleza','Quero produtos de higiene','Produtos de beleza','Cuidados pessoais','Quero cuidados pessoais']::text[],
   'Veja os produtos de higiene e beleza.', 'products','{"category":"higiene_beleza"}'::jsonb,86),

  ('Quero produtos para meu pet',array['Quero produtos para cachorro','Quero produtos para gato','Tem coisa para cachorro?','Tem coisa para gato?','Produtos pet','Casa e pet']::text[],
   'Veja os produtos de Casa e Pet.', 'products','{"category":"casa_pet"}'::jsonb,86),

  ('Quero produtos para café da manhã',array['Café da manhã','Quero leite e coisas de café da manhã','Produtos para o café','Quero cereal','Coisas para o café da manhã']::text[],
   'Vou mostrar os produtos disponíveis para café da manhã.', 'product_lookup','{"query":"CAFÉ DA MANHÃ"}'::jsonb,85),

  ('Vocês têm este produto?',array['Tem leite?','Tem arroz?','Quanto custa o leite?','Qual o preço desse produto?','Vocês vendem esse produto?','Tem esse produto?','Quanto custa OMO?','Tem Downy?','Tem fralda tamanho M?','Tem papel higiênico?','Quero amaciante Downy','Quero shampoo','Quero sabonete','Quero desodorante','Quero fralda','Quero ração','Quero tapete higiênico']::text[],
   'Vou consultar o produto e o preço para você.', 'product_lookup','{}'::jsonb,84),

  ('Quero ver as ofertas',array['Quais produtos estão em promoção?','Tem alguma oferta hoje?','O que está em promoção?','Promoções','Ofertas de hoje','O que está mais barato hoje?']::text[],
   'Se houver ofertas ativas, elas aparecem abaixo com os valores atuais.', 'offers','{}'::jsonb,83),

  ('Quero finalizar minha compra',array['Quero fechar meu pedido','Pode finalizar pra mim','Finalizar pedido','Fechar compra','Concluir compra','Quanto ficou minha compra?','Quero pagar']::text[],
   'Claro. Vamos conferir e finalizar seu pedido.', 'checkout','{}'::jsonb,82),

  ('Quero falar com uma pessoa',array['Quero atendimento humano','Tem alguém aí?','Quero uma atendente','Falar com atendente','Quero falar com vendedor','Humano']::text[],
   'O atendimento desta sala é feito pelo Chat Comprar. Posso te ajudar com cestas, produtos, pagamento e fechamento do pedido por aqui.', 'reply_buttons',
   '{"buttons":[{"label":"Cestas","value":"Cestas"},{"label":"Produtos","value":"Produtos"},{"label":"Pagamento","value":"Formas de pagamento"}]}'::jsonb,81),

  ('Obrigado',array['Obrigada','Valeu','Muito obrigado','Muito obrigada','Agradeço','Blz obrigado']::text[],
   'Por nada! Se precisar, posso continuar sua compra por aqui.', 'reply_buttons',
   '{"buttons":[{"label":"Cestas","value":"Cestas"},{"label":"Produtos","value":"Produtos"},{"label":"Finalizar","value":"Quero finalizar minha compra"}]}'::jsonb,50)
), updated as (
  update public.service_simple_rules r
     set variations=s.variations,
         answer=s.answer,
         response_mode=s.response_mode,
         tool_config=s.tool_config,
         stages=jsonb_build_array(jsonb_build_object(
           'question',s.question,'variations',to_jsonb(s.variations),'answer',s.answer,
           'response_mode',s.response_mode,'tool_config',s.tool_config
         )),
         status='published',
         priority=s.priority,
         updated_at=now()
    from seed s
   where lower(trim(r.question))=lower(trim(s.question))
  returning r.question
)
insert into public.service_simple_rules(question,variations,answer,response_mode,tool_config,stages,status,priority)
select s.question,s.variations,s.answer,s.response_mode,s.tool_config,
       jsonb_build_array(jsonb_build_object(
         'question',s.question,'variations',to_jsonb(s.variations),'answer',s.answer,
         'response_mode',s.response_mode,'tool_config',s.tool_config
       )),
       'published',s.priority
from seed s
where not exists (
  select 1 from public.service_simple_rules r
  where lower(trim(r.question))=lower(trim(s.question))
);
