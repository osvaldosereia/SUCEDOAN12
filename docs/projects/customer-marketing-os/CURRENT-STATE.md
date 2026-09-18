# CURRENT STATE — Customer & Marketing OS

Snapshot atualizado em **18/09/2026 ~19:00 UTC**.

## Última rodada concluída

**Homologação CM-1 — Revisão Humana de Identidade V1.**

Entregue:

- fila de conflitos na Central de Relacionamento;
- candidatos apresentados com PII mascarada;
- revisão `approved | rejected` com justificativa;
- confirmação humana obrigatória;
- backend `review_only_no_merge`;
- `external_side_effect=false`;
- `customer-intelligence-v1` implantada como version 19;
- contrato estático validado;
- cache da Central atualizado para `20260918-4`.

Documento da rodada:

`docs/projects/customer-marketing-os/CM1-HOMOLOGATION-IDENTITY-REVIEW-V1.md`

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

- receipts: 4
- normalized_linked: 4
- conversation_linked: 4
- customer_linked: 2
- distinct_customers: 1
- provider identities: 3
- shopping sessions: 3
- errors: 0
- duplicates: 0
- canonical events 24h: 4
- adapter_receiving_real_traffic: true
- legacy_transport_recently_active: false
- external_side_effect: false
- último evento real observado: 18/09/2026 18:37:38 UTC

## Dados relevantes

- customers: 505
- pedidos observados pelo checklist: 45
- timeline rows: 1302
- customer_product_stats: 680
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

Último HEAD observado durante esta retomada:
`c8f6b02c7c074ba3865fb65c966856780115b061`
— `docs(marketing): registra Round 8`.

Antes de qualquer alteração, buscar novamente o HEAD e o arquivo alvo para preservar trabalho concorrente.

## CI

O wrapper consultado no HEAD acima não retornou combined status nem workflow runs associados ao commit direto. Isso não deve ser interpretado como “CI verde”.

Última evidência histórica registrada no checkpoint anterior indicava sucesso nos testes relevantes em commit anterior. Na próxima mudança de código, consultar jobs/workflows aplicáveis ou executar a suíte equivalente.

## Próxima ação segura

1. manter todos os gates externos fechados;
2. revisar o conflito de identidade manualmente, sem merge automático;
3. gerar uso real do Comprar para que `catalog_search` e `product_view` produzam evidência;
4. validar Central de Relacionamento no navegador canary com o PIN pelo responsável;
5. validar visual desktop/mobile;
6. revisar Meta Policy Registry em modo read-only;
7. homologar Meta Direct sem ativar outbound;
8. reexecutar checklist;
9. somente depois discutir encerramento da CM-1;
10. ativação externa continua exigindo autorização explícita separada.


## Evidências adicionais desta retomada

- PapoAI receipts: 6;
- normalized/canonical events 24h: 6;
- customer_linked: 3;
- provider identities: 5;
- conflito de identidade pendente: 1;
- `catalog_search` real: 0;
- `product_view` real: 0;
- backend implantado de produtos contém tracking e collector;
- oportunidades ativas/suprimidas: 75;
- oportunidades vencidas em 18/09: 0;
- primeira expiração real observável: 23/09/2026.

Portanto nenhum dos seis critérios restantes deve ser promovido artificialmente.
