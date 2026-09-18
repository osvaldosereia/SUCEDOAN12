# CURRENT STATE — Customer & Marketing OS

Snapshot atualizado em **18/09/2026 ~19:13 UTC**.

## Última rodada concluída

**Homologação CM-1 — Meta Policy Registry + Preflight Fail-Closed V1.**

Entregue:

- Meta Policy Registry com 8 políticas oficiais/operacionais fail-closed;
- readiness do registry: 8/8 ativo, fonte presente, stale=0;
- revisão automática de frescor a cada 30 dias pelo snapshot;
- ACL service-role only verificada;
- fallback local `v26.0` removido do Meta Direct;
- Graph API version passou a exigir configuração explícita `vN.N`;
- `whatsapp-meta-direct-v1` implantada como version 2;
- `admin-whatsapp-direct-v1` implantada como version 4;
- contratos equivalentes aos testes novos validados no HEAD;
- Meta Direct permanece READ_ONLY/OFF;
- nenhum gate externo foi aberto.

Documento da rodada:

`docs/projects/customer-marketing-os/CM1-HOMOLOGATION-META-POLICY-PREFLIGHT-V1.md`

### Rodada anterior importante

`docs/projects/customer-marketing-os/CM1-HOMOLOGATION-IDENTITY-REVIEW-V1.md`

A fila segura de revisão humana de identidade permanece disponível na Central.

## Estado geral

- fase: `internal_homologation`
- critérios totais: **20**
- verified: **14**
- implemented aguardando evidência/gate: **6**
- blocked: **0**
- `ready_for_manual_canary=true`
- `cm1_complete=false`
- `safe_for_internal_homologation=true`
- `external_activation_authorized=false`
- external side effect observado: **false**

## 14 critérios verified

1. contato ingerido;
3. Customer 360 atualiza;
4. conversa vira evento;
5. catálogo vira evento;
8. carrinho vira evento;
9. pedido vira evento;
10. perfil comercial recalcula;
11. afinidades atualizam;
12. segmentos dinâmicos;
14. consentimento respeitado;
16. auditoria;
17. nenhuma ação externa indevida;
19. deterministic-first;
20. arquitetura pronta para Meta.

## 6 critérios implemented

### 2 — Identity Resolver
Há uso real do resolver, porém existe **1 conflito de identidade pendente**. Não auto-resolver.

### 6 — Catalog Search
Collector implantado e smoke validado. Runtime real ainda registra **0 `catalog_search`** pós-deploy.

### 7 — Product View
Collector implantado e smoke validado. Runtime real ainda registra **0 `product_view`** pós-deploy.

### 13 — Opportunity Lifecycle
Criação observada; remoção/expiração coberta por engine/testes. Não manter fixture artificial só para elevar contador.

### 15 — Marketing Brain SUGGEST
Capacidade pronta; gate continua fechado por decisão de homologação.

### 18 — Medição de custo de IA
Ledger suporta custo estimado/real, mas ainda existem **0 execuções governadas** nesta etapa.

## Runtime de homologação

### Canonical channel
- provider atual: `papoai`
- inbound: true
- outbound: false
- AI: false
- auto reply: false
- canary: 0%
- Meta Direct ready: false

### WhatsApp Direct
- enabled: false
- release_mode: off

### Provider Adapter
- provider: papoai
- inbound_mode: active
- outbound_mode: disabled

### Marketing runtime
- enabled: false
- execution_mode: off
- publishing_enabled: false
- kill_switch: true
- max_daily_publications: 0
- max_daily_ai_cost_cents: 0

### Templates
- runtime enabled: 0

### External effects, 7d
- marketing: 0
- AI Actions: 0

## Transporte real PapoAI

Snapshot:

- receipts: 7
- normalized_linked: 7
- conversation_linked: 7
- customer_linked: 3
- distinct_customers: 1
- provider identities: 6
- shopping sessions: 6
- errors: 0
- duplicates: 0
- canonical events 24h: 7
- adapter_receiving_real_traffic: true
- legacy_transport_recently_active: false
- external_side_effect: false
- último evento real observado: 18/09/2026 18:37:38 UTC

## Dados relevantes

- customers: 506
- pedidos observados pelo checklist: 46
- timeline rows: 1312
- customer_product_stats: 699
- product graph edges: 526
- opportunities ativas/suprimidas: 75
- clientes com consentimento positivo de marketing: 0
- AI executions desta etapa: 0

## Warnings atuais

### identity_conflicts_pending
Existe 1 conflito real a revisar manualmente.

### no_positive_marketing_consent
Esperado. O sistema deve permanecer fail-closed; oportunidades ficam suprimidas.

### legacy_automation_outbound_live_but_canonical_gate_closed
`automation_config` legado ainda possui flags live/outbound, mas os gates canônicos novos permanecem fechados e têm precedência.

Não limpar legado sem auditoria de dependências.

## Gates manuais pendentes

- Customer OS PIN browser validation;
- Relationship Center PIN browser validation;
- Meta Policy Registry verification;
- Meta Direct homologation;
- external activation authorization.

Não descobrir, inferir, testar ou contornar PIN automaticamente.

## Estado GitHub

O repositório recebe commits paralelos de outros projetos, especialmente Marketing.

O HEAD muda frequentemente por trabalhos paralelos. Nesta rodada foi observado trabalho concorrente apenas no projeto separado `APP-DONA-ANTONIA-MASTER.md`, sem colisão com esta pasta. Antes de qualquer alteração, buscar novamente o HEAD e o arquivo alvo para preservar trabalho concorrente.

## CI

O wrapper consultado no HEAD acima não retornou combined status nem workflow runs associados ao commit direto. Isso não deve ser interpretado como “CI verde”.

Última evidência histórica registrada no checkpoint anterior indicava sucesso nos testes relevantes em commit anterior. Na próxima mudança de código, consultar jobs/workflows aplicáveis ou executar a suíte equivalente.

## Próxima ação segura

1. manter todos os gates externos fechados;
2. revisar o conflito de identidade manualmente, sem merge automático;
3. gerar uso real do Comprar para que `catalog_search` e `product_view` produzam evidência;
4. validar Central de Relacionamento no navegador canary com o PIN pelo responsável;
5. validar visual desktop/mobile;
6. Meta Policy Registry: readiness técnico concluído 8/8; gate humano continua pending;
7. resolver apenas com evidência real os blockers do Meta Direct: Graph API version, permissões, webhook e direct-ready flag; não ativar outbound;
8. reexecutar checklist;
9. somente depois discutir encerramento da CM-1;
10. ativação externa continua exigindo autorização explícita separada.


## Evidências adicionais desta retomada

- PapoAI receipts: 7;
- normalized/canonical events 24h: 7;
- customer_linked: 3;
- provider identities: 6;
- conflito de identidade pendente: 1;
- `catalog_search` real: 0;
- `product_view` real: 0;
- backend implantado de produtos contém tracking e collector;
- oportunidades ativas/suprimidas: 75;
- oportunidades vencidas em 18/09: 0;
- primeira expiração real observável: 23/09/2026.

Portanto nenhum dos seis critérios restantes deve ser promovido artificialmente.


## Meta Policy / Meta Direct — evidência técnica atual

### Policy Registry

- required policies: 8;
- active: 8;
- missing: 0;
- stale: 0;
- fail-closed violations: 0;
- source missing: 0;
- readiness técnico: true;
- manual gate `meta_policy_registry_verification`: **pending**;
- `external_activation_authorized=false`.

### Meta Direct preflight

Confirmado:

- WABA: presente;
- Phone Number ID: presente;
- outbound fail-closed: true;
- `whatsapp_direct_config.enabled=false`;
- `release_mode=off`.

Bloqueios reais que permanecem:

1. `graph_api_version_unverified`;
2. `permissions_unverified_or_blocking`;
3. `webhook_not_verified`;
4. `direct_ready_flag_false`.

Não criar evidência artificial para nenhum deles.

### Deploys atuais desta rodada

- `customer-intelligence-v1`: version 19, JWT true;
- `whatsapp-meta-direct-v1`: version 2, JWT false por ser webhook, POST protegido por HMAC;
- `admin-whatsapp-direct-v1`: version 4, JWT true.

### Graph API

`graph_api_version` canônica continua `null`.

O código não possui mais fallback de versão. A versão só pode ser registrada após evidência oficial ou administrativa verificável.


### Central Meta Foundation

A Central agora exibe diretamente:

- Policy Registry técnico 8/8;
- Meta Direct `ready=false`;
- Graph API version não verificada;
- permissões não verificadas;
- webhook não homologado;
- direct-ready flag fechada.

Read model `relationship_command_summary_v1`: `cm1.15-v2`.

A tela é somente informativa e não possui ação de ativação.
