begin;

-- Alinha a inteligência publicada ao princípio:
-- IA informa/orienta; WhatsApp Flow monta, altera, personaliza e fecha pedidos.
-- Não altera definição, JSON, Data Exchange ou assets do Flow.

do $$
begin
  if exists (select 1 from public.service_guidance_rules where rule_key='flow_transaction_boundary_v1') then
    update public.service_guidance_rules
       set title='Fronteira transacional: atendimento pela IA, pedido pelo Flow',
           instruction='Responda normalmente dúvidas, disponibilidade, preço, estoque, comparação, recomendação e regras da Dona Antônia usando somente dados confiáveis do sistema. Quando o cliente quiser comprar, encomendar, montar pedido, alterar quantidade, retirar ou trocar item, personalizar cesta, repetir uma compra como novo pedido ou finalizar, não monte nem altere carrinho em conversa livre: abra ou retome o WhatsApp Flow. Para o cliente, fale naturalmente em abrir o pedido ou as opções; não use a palavra técnica Flow. Se o Flow estiver indisponível, preserve o contexto e faça handoff, sem pedir que o cliente repita tudo.',
           intent_scope=array[]::text[],
           stage_scope=array[]::text[],
           channel_scope=array['whatsapp']::text[],
           behavior_tags=array['flow_boundary','transaction','cost','customer_effort','trust']::text[],
           status='published',priority=100,version_no=version_no+1,updated_at=now()
     where rule_key='flow_transaction_boundary_v1';
  else
    insert into public.service_guidance_rules(
      id,rule_key,title,instruction,intent_scope,stage_scope,channel_scope,behavior_tags,status,priority,version_no,created_at,updated_at
    ) values (
      gen_random_uuid(),'flow_transaction_boundary_v1','Fronteira transacional: atendimento pela IA, pedido pelo Flow',
      'Responda normalmente dúvidas, disponibilidade, preço, estoque, comparação, recomendação e regras da Dona Antônia usando somente dados confiáveis do sistema. Quando o cliente quiser comprar, encomendar, montar pedido, alterar quantidade, retirar ou trocar item, personalizar cesta, repetir uma compra como novo pedido ou finalizar, não monte nem altere carrinho em conversa livre: abra ou retome o WhatsApp Flow. Para o cliente, fale naturalmente em abrir o pedido ou as opções; não use a palavra técnica Flow. Se o Flow estiver indisponível, preserve o contexto e faça handoff, sem pedir que o cliente repita tudo.',
      array[]::text[],array[]::text[],array['whatsapp']::text[],array['flow_boundary','transaction','cost','customer_effort','trust']::text[],
      'published',100,1,now(),now()
    );
  end if;
end $$;

update public.service_guidance_rules
set instruction='Otimize nesta ordem: 1) resolver corretamente a necessidade atual; 2) reduzir esforço e insegurança; 3) facilitar a decisão; 4) concluir a compra quando o cliente estiver pronto; 5) sugerir complemento somente se houver valor real. Pode consultar catálogo, histórico e dados comerciais para responder, comparar e recomendar. Qualquer ação que monte ou modifique o pedido, cesta, item, quantidade, substituição, personalização ou fechamento deve ser encaminhada ao WhatsApp Flow. Nunca sacrifique confiança, clareza ou conveniência por upsell.',
    version_no=version_no+1,updated_at=now()
where rule_key='sales_objective_order';

update public.service_guidance_rules
set instruction='Antes de responder, escolha a ação que mais reduz esforço e resolve a necessidade atual: responder, consultar, comparar, recomendar, abrir o pedido no WhatsApp Flow, resumir, pedir um dado realmente indispensável ou fazer handoff. A IA não deve alterar carrinho ou checkout em conversa livre; quando a próxima ação for transacional, abra ou retome o Flow.',
    version_no=version_no+1,updated_at=now()
where rule_key='orientacao_proxima_melhor_acao_antes_da_proxima_melhor_frase_mttk8umi_nmpu';

update public.service_guidance_rules
set instruction='Considere como sinais de prontidão frases como “vou querer”, “manda”, “fecha”, “quero essa”, pedidos de quantidade ou intenção explícita de encomendar. Perguntas apenas informativas sobre disponibilidade, preço, pagamento ou entrega continuam sendo respondidas sem abrir o pedido. Quando houver intenção transacional real, reduza explicações e abra ou retome o WhatsApp Flow.',
    version_no=version_no+1,updated_at=now()
where rule_key='orientacao_sinais_de_compra_mudam_a_conversa_para_acao_mttk8umi_axd5';

update public.service_guidance_rules
set instruction='Quando o cliente apenas pedir informações sobre cestas, mostre as cestas ativas, preço comercial e composição pertinente sem obrigá-lo a iniciar um pedido. Quando demonstrar intenção de comprar ou personalizar uma cesta, abra diretamente o WhatsApp Flow, onde ele escolhe a cesta, ajusta componentes, adiciona produtos e finaliza. Nunca fixe no prompt a quantidade de cestas ativas; use os dados atuais do sistema.',
    version_no=version_no+1,updated_at=now()
where rule_key='basket_simple_sales_flow';

update public.service_guidance_rules
set instruction='Se o cliente estiver apenas perguntando sobre categorias ou produtos que podem complementar uma cesta, responda ou recomende usando dados reais. Quando quiser efetivamente adicionar extras, retirar, aumentar, diminuir ou trocar componentes, abra ou retome o WhatsApp Flow; a manipulação da cesta acontece no Flow, não na conversa livre.',
    version_no=version_no+1,updated_at=now()
where rule_key='basket_categories_real_catalog_v1';

update public.service_guidance_rules
set instruction='Se o cliente enviar endereço ou outro dado de fechamento em conversa livre, preserve a informação no contexto autorizado, mas não conclua o pedido por texto. Abra ou retome o WhatsApp Flow para revisão e confirmação transacional. Endereço enviado nunca significa pedido confirmado. Se o Flow estiver indisponível, faça handoff com o contexto já coletado.',
    version_no=version_no+1,updated_at=now()
where rule_key='checkout_resume_after_address';

update public.service_procedures
set trigger_description='Cliente demonstra preferência clara ou sinal de compra e precisa avançar para a montagem ou fechamento do pedido.',
    steps='["Confirmar internamente o que o cliente já escolheu sem fazer pergunta redundante","Se a fala ainda for apenas informativa, responder normalmente","Quando houver intenção de comprar ou alterar pedido, abrir ou retomar o WhatsApp Flow","Deixar quantidade, itens, personalização, revisão e confirmação dentro do Flow","Se o Flow falhar, preservar contexto e fazer handoff sem pedir repetição","Se o cliente recuar ou disser que quer pensar, voltar ao modo de orientação sem insistir"]'::jsonb,
    allowed_actions=array['search_product','show_product','show_baskets','open_whatsapp_flow','handoff']::text[],
    confirmation_actions=array[]::text[],fallback='Se a intenção ainda não estiver clara, responder ao que estiver claro e fazer somente a pergunta mínima necessária. Não montar pedido na conversa livre.',
    version_no=version_no+1,updated_at=now()
where procedure_key='regra_fechamento_natural_sem_pressao_mttk8umi_1orx';

update public.service_procedures
set trigger_description='Cliente pergunta por cesta básica, quer comprar cesta ou personalizar uma cesta.',
    steps='["Se for apenas uma pergunta, responder com dados atuais das cestas sem obrigar o cliente a comprar","Quando houver intenção de compra, abrir o WhatsApp Flow diretamente","A escolha da cesta, composição, quantidades, retiradas, trocas, extras e revisão acontecem no Flow","Não revelar preço individual dos componentes para justificar o valor da cesta","Se houver dúvida comercial antes da compra, a IA pode explicar e recomendar e depois retomar o Flow","Se o Flow estiver indisponível, fazer handoff com o contexto"]'::jsonb,
    allowed_actions=array['show_baskets','show_basket','search_product','show_product','open_whatsapp_flow','handoff']::text[],
    confirmation_actions=array[]::text[],fallback='Não improvisar regra de cesta nem montar a personalização por conversa livre. Encaminhar ao Flow ou, se indisponível, ao humano.',
    version_no=version_no+1,updated_at=now()
where procedure_key='regra_comprar_e_personalizar_cesta_basica_mttk8umi_yaz0';

update public.service_procedures
set steps='["Identificar o estágio atual sem forçar funil linear","Responder dúvidas e comparar opções quando o cliente ainda estiver avaliando","Quando houver intenção de compra ou mudança no pedido, abrir ou retomar o WhatsApp Flow","Não executar adição, remoção, quantidade, substituição ou checkout em conversa livre","Permitir que o cliente volte a perguntar ou mudar de assunto sem perder contexto","Fazer handoff em exceção, conflito de regra ou indisponibilidade do Flow"]'::jsonb,
    allowed_actions=array['search_product','show_product','show_baskets','conversation_summary','open_whatsapp_flow','handoff']::text[],
    confirmation_actions=array[]::text[],version_no=version_no+1,updated_at=now()
where procedure_key='regra_funil_conversacional_adaptativo_mttk8umi_pigy';

update public.service_procedures
set trigger_description='Cliente pede indicação, pergunta qual é melhor, demonstra indecisão ou compara opções.',
    steps='["Identificar o critério que realmente muda a decisão","Consultar dados atuais das opções","Recomendar uma opção principal e poucas alternativas relevantes","Enquanto for orientação, não abrir pedido sem necessidade","Se o cliente decidir comprar, abrir o WhatsApp Flow para escolher quantidade e finalizar","Não adicionar produto nem alterar pedido em conversa livre"]'::jsonb,
    allowed_actions=array['search_product','show_product','open_whatsapp_flow']::text[],
    confirmation_actions=array[]::text[],version_no=version_no+1,updated_at=now()
where procedure_key='regra_comparar_e_recomendar_produtos_mttk8umi_qglg';

update public.service_procedures
set trigger_description='Cliente pede para retirar, aumentar, diminuir ou trocar produto de uma cesta ou pedido.',
    steps='["Entender a alteração pedida sem fazer perguntas redundantes","Se precisar identificar o produto ou alternativa, consultar o catálogo conferido","Abrir ou retomar o WhatsApp Flow","Executar retirada, quantidade, troca e personalização somente dentro do Flow","Se a regra não permitir decisão segura ou o Flow estiver indisponível, fazer handoff"]'::jsonb,
    allowed_actions=array['search_product','show_product','open_whatsapp_flow','handoff']::text[],
    confirmation_actions=array[]::text[],fallback='Não alterar pedido por conversa livre. Usar Flow ou humano.',
    version_no=version_no+1,updated_at=now()
where procedure_key='product_replacement';

update public.service_procedures
set trigger_description='Cliente pede para fechar, finalizar ou confirmar a compra.',
    steps='["Não reconstruir checkout em conversa livre","Abrir ou retomar o WhatsApp Flow no estado transacional adequado","Deixar revisão de itens, quantidades, dados finais e confirmação dentro do Flow","Comunicar somente estados realmente confirmados pelo backend","Se o Flow estiver indisponível, preservar contexto e fazer handoff"]'::jsonb,
    allowed_actions=array['open_whatsapp_flow','conversation_summary','handoff']::text[],
    confirmation_actions=array[]::text[],fallback='Não confirmar pedido por inferência ou texto livre. Usar Flow ou humano.',
    version_no=version_no+1,updated_at=now()
where procedure_key='order_checkout';

update public.service_procedures
set trigger_description='Cliente pede produto, quantidade ou demonstra intenção real de encomendar produto avulso.',
    steps='["Se for apenas consulta, responder disponibilidade, preço ou opções usando o catálogo conferido","Se precisar recomendar, apresentar poucas opções relevantes","Quando houver intenção de compra, abrir o WhatsApp Flow","Escolha de item, quantidade e fechamento acontecem no Flow","Não adicionar, remover ou ajustar produto em conversa livre","Se o Flow falhar, fazer handoff sem perder contexto"]'::jsonb,
    allowed_actions=array['search_product','show_product','open_whatsapp_flow','handoff']::text[],
    confirmation_actions=array[]::text[],fallback='Se não houver produto adequado, oferecer alternativa real. Se quiser comprar, usar Flow.',
    version_no=version_no+1,updated_at=now()
where procedure_key='product_purchase';

update public.service_procedures
set trigger_description='Cliente diz “o mesmo de sempre”, “repete meu último pedido” ou referência equivalente com identidade confiável.',
    steps='["Usar histórico somente para entender a referência e orientar o cliente","Revalidar produtos, preços e disponibilidade no catálogo atual quando precisar informar","Não recriar automaticamente o pedido em conversa livre","Abrir o WhatsApp Flow para o cliente revisar, ajustar e confirmar o novo pedido","Se o histórico estiver ambíguo, perguntar somente o ponto necessário","Se o Flow estiver indisponível, fazer handoff com a referência histórica"]'::jsonb,
    allowed_actions=array['order_history','search_product','show_product','open_whatsapp_flow','handoff']::text[],
    confirmation_actions=array[]::text[],version_no=version_no+1,updated_at=now()
where procedure_key='regra_repetir_compra_usando_historico_mttk8umi_mcay';

commit;
