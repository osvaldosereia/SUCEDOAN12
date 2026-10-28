# Catálogo WhatsApp — ciclo de pedido

**Status:** decisões técnicas registradas para execução local. Nenhuma migration, função ou mensagem será aplicada/enviada ao Supabase/Meta durante esta etapa.

## Objetivo

Tratar cada carrinho recebido do catálogo nativo como uma intenção e, após confirmação explícita do cliente, criar um pedido canônico independente no Admin. Um carrinho do Catálogo nunca se junta ao pedido criado pelo Flow, mesmo quando chega na mesma conversa ou muito tempo depois.

## Abordagens consideradas

1. **Converter o evento do Catálogo imediatamente:** descartada porque o evento não fecha entrega e pagamento, o preço recebido da Meta não é confiável e ainda não existe confirmação explícita.
2. **Abrir outro Flow/assistente automático para cada carrinho:** adiada porque amplia a máquina de estados e pode confundir uma coleta de endereço/pagamento com um segundo pedido Flow.
3. **Preparação assistida no cartão da conversa (escolhida):** o Admin preenche somente os dados ausentes, vê o cadastro/endereço encontrados pelo telefone exato, escolhe pagamento e solicita o resumo. O backend recalcula os preços e envia a confirmação ao cliente. Isso mantém a operação simples e deixa a intenção identificada como Catálogo do começo ao fim.

## Fluxo fixado

1. Webhook Meta validado e deduplicado cria uma intenção `source_kind='catalog'` por mensagem/carrinho. O evento guarda conta, WABA, catálogo, mensagem, conversa e remetente em campos distintos. Nunca há busca por nome, SKU ou preço Meta para ligar um produto.
2. Cada item resolve pelo vínculo verificado exato `(whatsapp_account_id, catalog_id, retailer_id)`. Preço e oferta vêm de `public.products`; `item_price` da Meta é descartado. Produto sem vínculo único, inativo, sem permissão WhatsApp, sem preço ou quantidade inválida deixa a intenção em revisão e bloqueia resumo.
3. O cartão do Atendimento tenta identificar o cliente apenas pelo E.164 exato. A divergência entre telefone principal e telefones adicionais, cliente inativo ou mais de um resultado bloqueia preparação e pede revisão humana. Nome nunca identifica cliente.
4. Endereço existente só é sugerido quando há um padrão único: endereço padrão ativo; na falta dele, o único ativo. Havendo vários, o operador escolhe explicitamente. Sem endereço, o operador informa nome e endereço no rascunho privado da intenção. Cadastro/endereço novos não são escritos no banco canônico antes da confirmação final do cliente.
5. Pagamento precisa ser escolhido explicitamente entre os métodos já aceitos pelo banco (`pix`, `cash`, `debit_card`, `credit_card`, `food_card`, `meal_card`). Nunca inferir pagamento do carrinho.
6. Ao preparar o resumo, o banco trava a intenção e recalcula preços atuais e mapeamentos. A mensagem lista nomes, quantidades e apenas o total geral, sem preço unitário por item. O botão leva uma capacidade aleatória vinculada por hash à intenção, revisão do orçamento, remetente, conta, conversa e mensagem exata enviada.
7. Sem confirmação do botão correto não se cria pedido, não se registra cliente/endereço e não se reserva estoque. A aceitação reconsulta cliente, endereço, mapeamentos, produtos, preços e estoque. Se preço ou composição mudou, gera nova revisão e pede nova confirmação. Falha de estoque não deixa pedido parcial.
8. Depois da aceitação, a mesma transação cria cliente/telefone/endereço se necessário, um `orders` com `source='manual_whatsapp'`, `checkout_snapshot.origin='catalog'`, itens canônicos diretos em `order_items`, uma reserva de estoque, a entrada de separação e o vínculo idempotente intenção/pedido. Não cria linha pai de cesta nem aplica ajuste oculto de cesta.
9. A janela de atendimento Meta de 24 horas controla somente se o resumo pode ser enviado. Ela não expira a intenção comercial. Fora da janela ou sem configuração validada, a intenção permanece para revisão; não usar template ou retry não verificado.
10. Um pedido Flow e cada carrinho Catálogo têm identidade, preço, confirmação, reserva, pedido Bling/NF e trilha próprios. Replays da mesma mensagem/evento retornam a intenção/pedido já existente.

## Segurança e limites

- RPCs de ingestão, preço, claim e conversão ficam restritas ao backend. A preparação iniciada pelo Admin exige sessão válida e o mesmo verificador de papel já usado no Atendimento.
- Dados preliminares de cliente/endereço ficam somente no snapshot privado da intenção; nunca retornar retailer IDs, valores recebidos da Meta, tokens de botão, payload bruto, custo de produto ou segredo ao navegador.
- Valores financeiros são inteiros em centavos dentro do orçamento e recalculados no servidor. Bling e emissão fiscal continuam nos gateways existentes e nos estados já aprovados; esta etapa não envia nada ao Bling.
- Corrigir antes de liberar: a RPC local atual `whatsapp_order_intent_prepare_confirmation_v1` grava cliente/endereço e confirma endereço padrão durante a preparação, antes do botão do cliente. A regra aprovada é postergar essas gravações até `whatsapp_order_intent_confirm_v1` concluir a transação de aceitação.
- A migration continua candidata local: o baseline completo não foi recuperado e não há validação em staging. Não aplicar DDL/deploy nem alterar callbacks Meta, Bling, secrets ou os projetos Supabase.

## Arquivos e responsabilidades previstos

- `supabase/migrations/20261027211631_whatsapp_order_intake_foundation_v1.sql`: quote Catálogo de preço atual; preparo administrativo com validação de cliente/endereço/pagamento; sender claim compatível com `flow|catalog`; revalidação e conversão transacional do pedido direto; projeção administrativa restrita.
- `supabase/functions/whatsapp-order-intake-v1/index.ts`: persistir a intenção e o quote inicial seguro; nunca disparar confirmação automática para o carrinho sem entrega e pagamento.
- `supabase/functions/whatsapp-order-confirmation-v1/index.ts` e `supabase/functions/whatsapp-order-confirmation-sender-v1/index.ts`: encaminhar respostas/saídas somente para a intenção e revisão vinculadas.
- `src/lib/supabase/admin-order-intents.ts`, `src/app/(admin)/atendimento/workspace.tsx` e ações do Atendimento: apresentar dados mínimos para identificação/preparação e chamar uma função server-side autenticada; nunca calcular preço como autoridade.
- `docs/planning/implementation-ledger.md`: registrar cada avanço local e cada bloqueio restante de baseline, parser, runtime e staging.

## Critérios para considerar o ciclo local implementado

- Flow permanece separado do Catálogo e mantém seu contrato.
- Catálogo com carrinho válido e usuário conhecido pode ser preparado com endereço/pagamento; cliente novo pode ficar em snapshot privado até aceitar.
- Nenhuma entrada em `orders`, `order_items`, cliente/endereço ou reserva ocorre antes do clique explícito.
- Mudança de preço gera nova confirmação; replay não duplica pedido/reserva; indisponibilidade leva a revisão.
- A intenção continua pendente sem prazo comercial enquanto a janela Meta estiver fechada.
- Revisões estáticas locais passam. Testes automatizados não serão adicionados nem executados por restrição do projeto; validação real de SQL, Edge Runtime e staging permanece gate antes de implantação.
