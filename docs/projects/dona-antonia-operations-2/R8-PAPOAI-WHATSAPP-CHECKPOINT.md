# Operations 2.0 — R8 · PapoAI / WhatsApp operacional

Data: 2026-09-26
Status: programação segura concluída nesta rodada.

## Objetivo
Fechar observabilidade e integridade do elo PapoAI/WhatsApp -> identidade -> cliente -> draft estruturado -> pedido canônico, sem reintroduzir inteligência de atendimento no Admin e sem permitir que texto livre crie pedido automaticamente.

## Baseline observado
- papoai_webhook_runtime_v2.capture_enabled=true.
- 47 eventos capturados.
- 0 eventos com last_error.
- 0 eventos sem phone_candidate.
- 0 drafts persistidos.
- 0 pedidos ligados a drafts.
- 0 storefront_identity_tokens persistidos.
- last_seen_at confirmou tráfego recente durante a R8.

## Implementado no Supabase canônico
Migration ops2_r8_papoai_operational_readiness_v1:
- view interna ops2_papoai_operational_readiness_v1;
- correlaciona inbox com draft por conversation_ref/event_key;
- estados operacionais: technical_error, identity_missing, captured_no_draft, customer_missing, confirmed_without_order, order_linked, draft_active;
- função interna ops2_papoai_operational_summary_v1();
- resumo de captura, processamento, erros, identidade, drafts e vínculo de pedido;
- sem grants para public/anon/authenticated.

## Decisões/gates preservados
1. Texto livre não cria pedido automaticamente.
2. Pedido só converge ao motor canônico a partir de evento/draft estruturado e confirmação válida.
3. Telefone/identidade é dado operacional; não inferir vínculo de cliente por aproximação.
4. Duplicatas/retries devem convergir por event_key/message identity, nunca gerar segundo pedido.
5. Admin permanece ponte operacional/monitoramento; IA de atendimento não volta ao Admin.
6. PapoAI permanece canal oficial da conversa; sem Make.
7. Pedidos legados não são mutados.

## Evidência
Após migration:
- capture_enabled=true;
- events_total=47;
- events_processed=0;
- events_with_error=0;
- events_without_phone=0;
- drafts_total=0;
- orders_linked=0;
- identity_tokens_total=0.

Isso indica que captura está funcional, mas a etapa estruturada de adaptação/processamento ainda não está materializando drafts/tokens nesta camada. Não ativar criação automática de pedido para compensar essa lacuna.

## Ações humanas acumuladas — pós-R12
- Executar teste real controlado do Flow/cadastro com um contato de teste.
- Executar teste real do link personalizado catalogo_#### e confirmar reconhecimento no checkout.
- Executar conversa real com evento estruturado de pedido e confirmar draft -> confirmação -> pedido único.
- Validar no PapoAI/Meta quais eventos/campos estruturados estão efetivamente habilitados no ambiente produtivo.

## Gate R8
PASS para observabilidade/readiness e proteção arquitetural.
PENDENTE de homologação real do Flow/link/evento estruturado, acumulada para pós-R12.

## Próximo passo
R9: UX operacional das cinco superfícies — Central, Pedidos/Nova Venda WhatsApp, Tablet Separação, Estoque Mobile e Entregador — reduzindo cliques, padronizando estados/mensagens e preservando os gates backend.


---

## Continuação operacional — 2026-09-28

O checkpoint de 26/09 cobria observabilidade. Esta continuação fecha a **programação da ponte operacional** sem reintroduzir IA de atendimento no Admin.

### Estado real observado antes da mudança
- 401 capturas PapoAI no início desta continuação;
- todas em `captured_no_draft`;
- captura ativa e sem erro;
- conversa já era criada/vinculada pelo adapter/conversation bridge v2;
- nenhum token `catalogo_####` ativo;
- nenhum Flow estruturado registrado;
- nenhum draft;
- nenhum pedido criado pela ponte.

Após os deploys, tráfego real continuou normalmente:
- 411 eventos totais;
- 223 nas últimas 24h;
- 411/411 com conversa vinculada;
- 112 eventos reconhecidos em cliente por identidade exata;
- 0 eventos em revisão;
- 0 erro de runtime observado.

### Link personalizado restaurado
Problema encontrado:
- `404.html` e `storefront-v2` já consumiam `/catalogo_####`;
- o emissor antigo estava retirado (`issue_identity_link -> 410 retired`);
- portanto a resolução existia sem um emissor operacional.

Implementado:
- `ops2_issue_papoai_catalog_link_v1`;
- código de 4 dígitos, TTL padrão 120 min;
- hash SHA-256 compatível com o resolver do Storefront;
- reuso idempotente do código ainda válido para mesmo telefone/conversa;
- serialização por advisory lock para reduzir colisões;
- token registra `conversation_id`, `customer_id` e `source_event_key`;
- Admin pode criar link manualmente;
- Flow estruturado válido também emite o link.

### Link do pedido à conversa
Implementado `ops2_link_storefront_order_from_identity_v1`.

Regra:
- somente pedido `source=vitrine`;
- exige token PapoAI **realmente resgatado**;
- telefone deve coincidir;
- conversa do token deve coincidir com telefone;
- se houver ambiguidade entre conversas, falha fechado;
- pedido já associado é idempotente;
- `storefront-v2` chama esse RPC logo após criar o pedido.

Isso evita inferir conversa somente por proximidade de telefone.

### Flow cliente
Criado `papoai_customer_flow_events_v1` + `ops2_apply_papoai_customer_flow_v1`.

Contrato operacional:
- evento estruturado explícito;
- chave de evento obrigatória/idempotente;
- nome obrigatório;
- telefone normalizado;
- identidade ambígua -> revisão, sem merge automático;
- cliente existente é reutilizado;
- cliente novo pode ser criado;
- conversa é associada somente com telefone compatível;
- pedidos **pós-cutover** sem cliente e com mesmo telefone podem receber `customer_id`/conversa;
- pedidos pré-cutover continuam fora do alcance;
- pedido pertencente a outro cliente nunca é sobrescrito.

Teste sintético em transação:
- cliente criado;
- conversa associada;
- pedido pós-cutover associado;
- repetição do mesmo evento retornou duplicate;
- rollback;
- zero resíduos.

### Receiver PapoAI
`papo-external-agent-v1` v108:
- modo normal continua `capture_only`;
- texto livre não cadastra cliente, não cria draft e não cria pedido;
- somente `mode=customer_flow_v1` ativa o contrato estruturado de cadastro;
- Flow válido chama o cadastro idempotente;
- depois emite `catalogo_####`;
- resposta inclui caminho/código/expiração;
- inbox registra apenas estado estruturado e vínculo, mantendo rastreabilidade.

### Gate de pedido automático
Criado `ops2_papoai_bridge_runtime_v1`.

Estado inicial deliberado:
- `structured_draft_enabled=true`;
- `identity_link_enabled=true`;
- `structured_order_commit_enabled=false`.

`papoai_confirm_draft_v2` agora verifica essa flag antes de criar pedido.
Enquanto a homologação real não acontecer, uma confirmação estruturada retorna:
`papoai_structured_order_commit_not_homologated`
e `external_write=false`.

Teste sintético confirmou o bloqueio.

### Admin
- backend `admin-products-live-v1` v69;
- `ops_papoai_capture_status` agora agrega saúde da ponte R8;
- ação `papoai_issue_catalog_link`;
- Central ganhou painel PapoAI / WhatsApp:
  - estado online/atenção;
  - eventos 24h;
  - clientes reconhecidos;
  - Flows;
  - links emitidos/resgatados;
  - último Flow;
  - último link;
  - último erro;
  - botão `Criar link catálogo`;
  - indicação clara de que pedido estruturado ainda está bloqueado.

Frontend: commit `1db0562c`.

### Storefront
`storefront-v2` v18:
- mantém resolução existente de `catalogo_####`;
- após o checkout, tenta vincular o pedido ao token PapoAI resgatado;
- não depende de IDs expostos ao navegador.

Commit: `74fc7b65`.

### Segurança
- novas tabelas com RLS;
- acesso público/anon/auth revogado;
- service_role apenas;
- funções internas revogadas de public/anon/auth;
- advisors sem novo achado crítico;
- achados globais já existentes permanecem: RLS sem policies em tabelas service-only (INFO) e leaked password protection de Auth (WARN).

### Arquivo SQL canônico
`supabase/sql/20260928_ops2_r8_papoai_operational_bridge_v1.sql`
commit `0c9a31a4`.

### Homologação externa pendente
Para validar Flow real:
1. no PapoAI, o envio do formulário/cadastro deve usar o mesmo webhook autorizado adicionando `mode=customer_flow_v1`;
2. o payload deve conter nome + telefone e uma referência de conversa/sessão quando disponível;
3. executar 1 Flow real;
4. confirmar no Admin:
   - Flow processado;
   - cliente associado/criado;
   - link `catalogo_####` criado;
5. abrir o link;
6. fazer um pedido real controlado;
7. confirmar que pedido ficou ligado à mesma conversa;
8. somente depois considerar habilitar `structured_order_commit_enabled`.

**Não habilitar pedido PapoAI automático antes desta homologação.**
