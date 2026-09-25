# Dona Antônia Operations 2.0 — Homologação / Implantação

> Início autorizado em 2026-09-25.
> Branch de trabalho: `ops2/homologacao-implantacao`.

## Política desta fase
- sem big-bang;
- alterações pequenas e reversíveis;
- preservar pedidos antigos;
- Bling como ERP;
- webhooks/eventos em vez de polling;
- nenhuma limpeza destrutiva antes do cutover;
- cada etapa com validação e rollback.

## Fase 0 — iniciada
1. baseline do runtime capturado;
2. branch isolada criada;
3. fundação da Control Tower preparada;
4. remover desperdício de crons fisicamente ativos mas logicamente desligados;
5. validar fundação no Supabase;
6. começar homologação Bling: situações, reserva, webhooks e Checkout.

## Baseline encontrado
- Bling Hub: `hub_enabled=false`;
- Bling webhooks: `webhooks_enabled=false`;
- cron Hub ainda ativo a cada 2 minutos;
- fiscal runtime: `enabled=false`, `execution_mode=off`;
- cron fiscal AI ainda ativo a cada 1 minuto;
- XML compras diário permanece necessário.

Decisão:
- pausar os dois crons ociosos;
- manter XML diário;
- não remover funções/tabelas ainda.

## Foundation v1
Novas estruturas não destrutivas:
- `ops_events`;
- `ops_attention`;
- `ops_approvals`.

RLS habilitado sem acesso direto do cliente. Uso inicialmente somente por backend/service role.


## Execução registrada — 2026-09-25

### Concluído
- branch de homologação criada e integrada ao `main`;
- migration `ops2_foundation_v1` aplicada no Supabase;
- migration `ops2_foundation_api_v1` aplicada no Supabase;
- tabelas `ops_events`, `ops_attention`, `ops_approvals` criadas com RLS;
- helpers idempotentes de evento, atenção e aprovação criados;
- resumo leve da Control Tower criado;
- cron `bling-hub-v2-cycle` pausado porque `hub_enabled=false`;
- cron `fiscal-ai-autonomous-worker-v1` pausado porque o runtime fiscal está `off`;
- cron diário de XML mantido;
- `admin-products-live-v1` atualizado para v14;
- aba `Hoje` evoluída para `Central`;
- painel `Precisa de você` ligado à fila real de `ops_attention`;
- três pendências iniciais registradas:
  - permissão Bling para Situações/Módulos;
  - endpoint PapoAI legado ainda configurado externamente;
  - localização física de produtos incompleta.

### Pull requests
- PR #547 — Fase 0 — merged;
- PR #548 — Control Tower / atenção — merged.

### Sem mudança ainda
- fluxo de criação/aprovação de pedidos;
- reserva oficial no Bling;
- webhooks Bling;
- PapoAI novo;
- estoque oficial do site;
- fiscal;
- pagamento;
- rota;
- balanço oficial no Bling.

Esses domínios continuam no fluxo atual até passarem pela respectiva POC.

## Próximo gate
**Bling — Situações/Módulos + reserva + webhooks.**

O runtime atual continua marcando `situacoes/modulos` como `scope_missing` (HTTP 403). Antes de ativar o workflow automático de pedidos, precisamos homologar essa permissão e provar:
1. leitura das situações;
2. atualização de situação;
3. situação `Aguardando confirmação`;
4. situação `Aprovado / Separar`;
5. reserva somente após aprovação;
6. webhook de atualização;
7. reconciliação sem polling.


## OAuth Bling preparado — 2026-09-25

### Concluído
- PR #551 integrado ao `main`;
- fluxo Owner -> Reconectar Bling -> autorização Bling -> callback -> Admin preparado;
- callback reutiliza `admin-service-intelligence-v1`;
- nenhum novo Edge Function foi criado;
- state OAuth possui hash e expiração;
- refresh token continua armazenado apenas pelo cofre/RPC existente;
- `admin-service-intelligence-v1` implantado em v135;
- `admin-products-live-v1` implantado em v17;
- runbook `BLING-HOMOLOGATION-RUNBOOK.md` criado;
- runtime Bling está em `mode=homologation`, mas `hub_enabled=false` e `webhooks_enabled=false`.

### Restrição encontrada
O projeto Supabase atingiu o limite atual de Edge Functions. Em vez de aumentar plano ou criar mais uma função, o callback OAuth foi consolidado dentro da função administrativa existente.

Essa decisão segue o princípio do Operations 2.0: menos funções e responsabilidades claras.

### Gate humano Bling
Agora existe uma etapa externa inevitável no painel do Bling:
1. adicionar os escopos de Situações/Módulos/Transições ao aplicativo Dona Antônia;
2. configurar/salvar o redirect OAuth para `admin-service-intelligence-v1`;
3. salvar o aplicativo;
4. no Vitrine/Admin > Bling técnico, usar **Reconectar Bling**;
5. voltar à Central e usar **Testar novamente**.

O Bling revoga a autorização anterior quando os escopos do aplicativo são alterados, portanto a reautorização é necessária.

### Não ativar ainda
Mesmo depois da reautorização:
- não ativar `hub_enabled`;
- não ativar `webhooks_enabled`;
- não mover pedidos para o novo fluxo;
até passarem os testes de catálogo de situações, reserva e webhook.


## Avanços adicionais — 2026-09-25

### OAuth / Bling
- `admin-service-intelligence-v1` v136: troca OAuth ajustada para JWT (`enable-jwt: 1`);
- `admin-products-live-v1` v18;
- `storefront-v2` v15;
- Hub permanece em `mode=homologation`, `hub_enabled=false`, `webhooks_enabled=false`;
- bloqueio externo continua: `situacoes/modulos` HTTP 403 até reautorização com novos escopos.

### Shadow readiness
Foi criada a projeção read-only `get_ops2_order_shadow_readiness_v1`.

A primeira leitura dos pedidos novos/abertos mostrou:
- 12 pedidos avaliados;
- 7 prontos para ERP;
- 5 bloqueados;
- 0 com produto sem vínculo Bling;
- 5 com cliente/vínculo pendente;
- 4 com endereço incompleto;
- 0 sem pagamento.

Conclusão: produtos já estão em condição muito melhor que clientes/endereço para o early-order no Bling.

### Reserva de estoque
Mudança de produção concluída:
- checkout NÃO reserva mais ao enviar o pedido;
- pedido aguarda confirmação sem reserva;
- a reserva local temporária ocorre somente em `created -> confirmed`;
- 122 linhas antigas de reserva de pedidos ainda não confirmados, totalizando 198 unidades, foram liberadas;
- nenhuma dessas liberações restaurou estoque físico, pois eram somente reservas;
- a política está registrada no ledger.

Esse modelo é intermediário. Depois do gate Bling, a reserva local será substituída pela reserva oficial por situação no Bling.

### Próximo bloco
Preparar fila de impressão de picking após aprovação, sem acoplar impressão à baixa de estoque. A impressão física automática só será ativada depois da POC com impressora/tablets.


## Implementação multicanal e PapoAI — 2026-09-25

### Separação / impressão
- fila `ops_print_jobs` implantada;
- picking 85 mm é enfileirado após aprovação;
- navegador registra apenas `presented`, não `printed`;
- claim/finish para futuro agente físico já existem;
- impressão foi desacoplada da baixa de estoque;
- impressão física automática continua desligada até POC de hardware.

### Motor de pedido multicanal
- `create_canonical_cart_order_v2` implantado;
- fontes canônicas novas: `vitrine`, `manual_whatsapp`, `papoai`, `reorder`;
- site já usa o wrapper canônico;
- mesma regra determinística de cesta, preço, estoque e pedido mínimo;
- Admin operacional deixou de pressupor que todo pedido novo vem do site.

### Venda WhatsApp
- tela **+ Venda WhatsApp** implantada em Pedidos;
- busca cliente;
- endereço;
- produtos;
- cestas;
- personalização de cesta;
- cotação pelo mesmo motor do site;
- pedido nasce Novo e sem reserva;
- origem registrada como `manual_whatsapp`;
- resolver fiscal já aceita as novas fontes canônicas.

### PapoAI
- endpoint `papo-external-agent-v1` deixou de responder 410 e foi substituído por receiver **capture-only**;
- receiver v105;
- valida chave existente por SHA-256;
- payload é sanitizado antes de persistir;
- máximo 256 KB;
- inbox idempotente com RLS;
- retenção lógica 7 dias;
- nenhuma ação em cliente/pedido/estoque/Bling/IA durante a POC;
- Control Tower expõe somente o status/contagem da captura.

### Versões
- `storefront-v2`: v16;
- `admin-products-live-v1`: v22;
- `admin-service-intelligence-v1`: v137;
- `papo-external-agent-v1`: v105.

### Gates ainda abertos
1. Bling `situacoes/modulos` continua dependendo de reautorização humana no aplicativo.
2. Ainda não chegou amostra real nova no receiver PapoAI v105; o adapter normalizador será escrito somente depois de observar payload real.
3. Impressão física automática depende de hardware.
4. Reserva oficial no Bling depende do gate de situações.


### Rascunho PapoAI versionado
- tabela `papoai_order_drafts_v2`;
- deduplicação por `papoai_draft_events_v2`;
- uma revisão ativa por conversa;
- resumo enviado ao cliente é preso a `revision + summary_hash`;
- confirmação de revisão antiga é rejeitada;
- confirmação repetida é idempotente;
- confirmação cria `source=papoai` pelo motor canônico;
- total confirmado precisa ser exatamente o total cotado; divergência reverte a transação;
- cancelamento de rascunho é versionado.

Estado: infraestrutura pronta, mas **não ligada ao receiver** enquanto não existir amostra real do payload PapoAI v105.


## PapoAI adapter v2 — payload real observado

### Captura real
O receiver PapoAI recebeu uma amostra real de `message.received` em 2026-09-25.

Estrutura observada:
- `event.type`;
- `event.occurred_at`;
- `data.session.uid`;
- `data.contact.id` / `name`;
- `data.message.id`;
- `data.message.external_id` (WhatsApp/WAMID);
- `data.message.direction`;
- `data.message.type`;
- `data.message.phone_number_from`;
- `data.message.phone_number_to`;
- `data.message.created_at`.

Nenhum conteúdo pessoal da amostra foi copiado para a documentação.

### Implementado
- migration `papoai_capture_normalizer_v2`;
- normalização central em `papoai_normalize_capture_v2`;
- backlog capturado normalizado sem cron;
- receiver v106 normaliza inline após persistir o payload sanitizado;
- adapter_version agora é 2;
- `external_message_id`, `conversation_ref` e `phone_candidate` passam a ser preenchidos pelo schema real observado;
- WAMID fica somente em metadata operacional;
- tentativa de vínculo de cliente é determinística por telefone, sem criar cliente automaticamente;
- eventos incompletos/desconhecidos ficam `review_required`;
- Control Tower passa a mostrar quantidade normalizada/revisão.

### Regra de segurança
Uma mensagem livre recebida NÃO cria pedido e NÃO altera carrinho automaticamente.
O rascunho PapoAI versionado só será alimentado por eventos/ações que consigam produzir itens estruturados e determinísticos.
