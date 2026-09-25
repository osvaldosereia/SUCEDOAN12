# Dona Antônia Operations 2.0 — Analysis Notes

> Caderno de análise. Não é plano de implementação e não autoriza alterações de produção.
> Última atualização: 2026-09-25.

## Regra desta fase
Até o Projeto Final ser concluído e revisado:
- somente leitura, pesquisa, auditoria e documentação;
- não alterar produção;
- não aplicar migrations;
- não publicar funções;
- não alterar Bling/PapoAI;
- não remover legado;
- não fazer deploy.

## Observação operacional nova — pedidos pelo WhatsApp
Nem todos os clientes vão montar o pedido pelo site. O projeto deve considerar como requisito de primeira classe o cliente que insiste em comprar diretamente pela conversa do WhatsApp/PapoAI.

A arquitetura final deve suportar múltiplas origens de venda usando um único motor de pedido:
1. site;
2. WhatsApp/PapoAI com rascunho;
3. venda manual lançada por atendente;
4. recompra baseada no histórico;
5. futura ação assistida por ChatGPT, sempre sujeita aos mesmos gates.

Depois da confirmação, todos os pedidos devem convergir ao mesmo fluxo canônico de ERP e operação.

## Achados — PapoAI / WhatsApp atual

### 1. Conexão externa hoje inconsistente
A Edge Function `papo-external-agent-v1` implantada atualmente foi aposentada e responde HTTP 410 com `retired_outside_site_vitrine_admin`.

Logs observados:
- 99 respostas HTTP 200 entre 2026-09-24 14:22 e 2026-09-25 03:37;
- depois da aposentadoria, 52 chamadas HTTP 410 entre 2026-09-25 10:00 e 13:28.

Conclusão: alguma configuração externa do PapoAI ainda está chamando um endpoint que foi aposentado. Não corrigir durante a fase de análise; registrar como gate obrigatório da futura implementação.

### 2. `papo-comprar-webhook-v1`
A função ainda está implantada e contém um adaptador específico do PapoAI para:
- telefone/identidade;
- tags;
- localização enviada pelo cliente;
- criação/associação de conversa;
- abertura de sessão de compra.

Porém o código implantado depende de estruturas/RPCs que já não existem no schema atual (por exemplo `channel_accounts`, `channel_provider_adapters`, `ingest_channel_adapter_event_v1`, `room_start_for_conversation_v1`, `capture_customer_location_pin_v1`).

Não foram observadas chamadas recentes a `papo-comprar-webhook-v1` nos logs consultados.

Conclusão: a função deve ser tratada como legado/incompleta até prova contrária. Não usar como base do projeto final sem redesenho.

### 3. Funções SQL antigas PapoAI -> Bling
Ainda existem RPCs como:
- `get_papoai_commerce_bling_identity_readiness_v1`;
- `queue_papoai_commerce_bling_v1`.

A segunda depende de tabela `papoai_commerce_brain_config`, hoje ausente, e exige pedidos com source `papoai_external_agent`.

Conclusão: são vestígios de uma arquitetura antiga; não devem ser reativados por acidente.

### 4. Atendimento humano é realidade operacional
Na tabela `conversations` observada:
- 681 conversas totais;
- 124 no canal WhatsApp;
- 42 marcadas como `human_required`;
- 98 em modo `human`.

Conclusão: atendimento humano não é exceção. O projeto final precisa de fluxo humano simples e rápido.

### 5. Admin atual não possui venda manual
No `vitrine/admin/index.html` atual não foi localizada ação `Novo pedido`, `Nova venda`, `Criar pedido` ou equivalente.
O Admin consegue listar e operar pedidos já existentes, mas não possui hoje uma entrada manual canônica de venda.

Isso é requisito obrigatório do novo desenho.

### 6. Admin atual não é multicanal
O backend do Admin lista pedidos com filtro canônico `source='vitrine'`.
No banco existem outras origens reais:
- `shopping_room`: 32 pedidos confirmados;
- `bling_import`: 27 pedidos históricos entregues;
- `storefront_v2`: 3;
- `legacy`: 1;
- `vitrine`: pedidos atuais.

Conclusão: o modelo operacional final não pode filtrar a fila pela origem da venda. A origem deve ser apenas metadado; pedido confirmado deve entrar na mesma fila operacional.

## Requisito de produto — Nova Venda WhatsApp
A interface futura deve permitir ao atendente:
- iniciar pelo telefone/WhatsApp;
- localizar cliente e histórico;
- validar CPF quando necessário para Bling;
- reutilizar endereço existente ou registrar novo;
- adicionar produto;
- adicionar cesta;
- personalizar cesta com exatamente a mesma regra do site;
- escolher pagamento na entrega;
- registrar localização/Maps se enviada;
- revisar total;
- confirmar;
- gerar pedido canônico;
- enviar confirmação/resumo ao WhatsApp;
- seguir para Bling e operação normal.

### Princípio
O funcionário nunca deve recalcular manualmente margem, diferença de cesta ou preço oculto.

## Papel do PapoAI no desenho final
PapoAI deve ser tratado como canal de atendimento e automação comercial, não como ERP nem fonte oficial de estoque/fiscal/financeiro.

Possível responsabilidade:
- receber mensagens, áudio, imagem e localização;
- responder FAQ e catálogo;
- identificar intenção;
- coletar dados;
- consultar histórico quando autorizado;
- sugerir/repetir compra;
- montar rascunho estruturado de pedido;
- transferir ao humano;
- follow-up/remarketing.

Não deve ser fonte de verdade de:
- estoque;
- fiscal;
- contas a receber/pagar;
- preço final calculado de cesta;
- status oficial do pedido.

## Decisão arquitetural provisória — Motor Único de Pedido
Não criar motores separados para site e WhatsApp.

Definir futuramente um único contrato de pedido canônico, reutilizado por:
- storefront;
- venda manual;
- rascunho PapoAI aprovado por humano;
- recompra;
- futuras ações ChatGPT.

Campos mínimos conceituais:
- origem/canal;
- id externo de origem quando houver;
- cliente;
- CPF/documento quando necessário;
- telefone;
- endereço/localização;
- itens;
- cestas/componentes;
- ajustes comerciais;
- método de pagamento na entrega;
- observações;
- idempotency key;
- operador/ator;
- status de aprovação;
- vínculo Bling.

## Segurança e gates
- rascunho de IA não movimenta estoque nem financeiro;
- pedido só se torna oficial após ação determinística/autorizada;
- deduplicação por id externo/idempotency key;
- preço sempre recalculado pelo motor oficial;
- produto sempre resolvido por ID/SKU/GTIN, não só por nome livre;
- endereço e forma de pagamento validados;
- cliente/CPF reconciliado antes de criação no Bling quando exigido;
- trilha de auditoria de quem confirmou e de qual conversa veio.

## Questões ainda a fechar na análise
- se PapoAI deverá apenas gerar rascunho ou poderá confirmar casos extremamente seguros;
- melhor formato de retorno automático do resumo do pedido à mesma conversa;
- como mapear conversa PapoAI -> cliente -> pedido sem depender de estruturas legadas;
- quais capacidades nativas atuais do PapoAI podem ser aproveitadas sem criar backend paralelo;
- forma final de pagamento/contas a receber no Bling para PIX/dinheiro/crédito/alimentação na entrega;
- papel exato do Bling Checkout/Picking/Packing versus Admin simplificado;
- modelo de expedição/rota/entregador.
