> [!IMPORTANT]
> **PONTO DE ENTRADA CANÔNICO MOVIDO.**
> Para novas retomadas, leia primeiro:
> `docs/projects/customer-marketing-os/HANDOFF.md`
> e depois `docs/projects/customer-marketing-os/CURRENT-STATE.md`.
>
> Este arquivo foi preservado como checkpoint histórico de 18/09/2026 e não deve mais ser tratado isoladamente como fonte principal de retomada.

# RETOMADA — Customer & Marketing OS / CM-1 — Dona Antônia

Atualizado em 18/09/2026.

Este arquivo é o **checkpoint oficial de retomada** para continuar o projeto em uma nova conversa/janela sem reconstruir o contexto.

## 1. Onde está o projeto

- GitHub: `osvaldosereia/SUCEDOAN12`
- Branch principal: `main`
- Supabase project id: `ssbesxgaijknwsjbsbcz`
- Admin oficial: `/admin/`
- Comprar: `/comprar/`
- Central de Relacionamento: `/admin/relacionamento.html`
- Roadmap oficial: `docs/CUSTOMER-MARKETING-OS-ETAPA-CM1.md`
- Arquitetura mestre: `docs/CUSTOMER-MARKETING-OS-ARQUITETURA-MESTRE.md`

HEAD observado imediatamente antes deste checkpoint:

- `d11b6df67eb784301c7d4181ab5edc18d98b3a1c`
- commit: `test(marketing): valida gerenciador OAuth Round 8`

Há trabalho de Marketing sendo feito em paralelo no mesmo repositório. **Sempre buscar a versão mais recente do arquivo antes de editar e preservar mudanças concorrentes.**

## 2. Estado oficial da CM-1

Status consolidado:

- CM-0 — Architecture Lock: concluída
- CM-1.1 — Segurança e fundação: concluída
- CM-1.2 — Identity Resolver: concluída
- CM-1.3 — Customer 360: backend concluído, UI em canary
- CM-1.4 — Event Collector: concluída V1
- CM-1.5 — Consent Ledger / Customer Protection: concluída V1
- CM-1.6 — Product Marketing Profile: concluída V1
- CM-1.7 — Product/Brand Graph: concluída V2
- CM-1.8 — Segment Engine: concluída V1
- CM-1.9 — Customer Commercial Profile: concluída V1
- CM-1.10 — Opportunity Engine: concluída V1 + precision pass
- CM-1.11 — Marketing Brain OBSERVE/SUGGEST: concluída V1, OBSERVE permitido e SUGGEST fechado
- CM-1.12 — Meta Foundation: concluída V1, READ_ONLY/fail-closed
- CM-1.13 — Template Draft Assistant: concluída V1, DRAFT/manual, IA fechada
- CM-1.14 — PapoAI Adapter: concluída V1, core normalizado, outbound do adapter desligado
- CM-1.15 — Central de Relacionamento: concluída V1, backend seguro e UI em canary
- Homologação CM-1: em andamento

Acceptance checklist atual:

- total: 20
- `verified`: 14
- `implemented`: 6
- `blocked`: 0
- `ready_for_manual_canary=true`
- `cm1_complete=false`
- `external_activation_authorized=false`

Função canônica:

`public.cm1_acceptance_checklist_v1()`

Documentação:

`docs/CUSTOMER-MARKETING-OS-CM1-ACCEPTANCE-CHECKLIST.md`

## 3. Os 6 critérios ainda em `implemented`

### Critério 2 — Sistema resolve identidade

O adapter já ligou clientes/identidades reais, mas há **1 conflito de identidade pendente de revisão**.

Regra: não fazer merge automático nem aprovar sem revisão humana.

### Critério 6 — Busca vira evento

Implementado:

- frontend `comprar/products.js`
- action `track` em `shopping-chat-products-v1`
- collector `record_catalog_interaction_v1`
- evento `catalog_search`
- dedupe server-side

Smoke test passou e fixture foi removida.

O status passará para verified quando houver tráfego real pós-deploy.

### Critério 7 — Produto visualizado vira evento

Implementado:

- detalhe do produto dispara `product_view`
- mesma pipeline canônica e dedupe
- smoke test passou
- fixture removida

Aguardando uso real pós-deploy.

### Critério 13 — Oportunidade é criada/removida

Há oportunidades reais e engine de lifecycle. Criação já observada.

Remoção/expiração está coberta por engine/testes, mas não foi mantida fixture artificial persistente apenas para aumentar contador.

### Critério 15 — Marketing Brain consegue sugerir estratégia

Capacidade pronta, porém o gate continua propositalmente fechado durante homologação:

- strategy AI disabled
- opportunity SUGGEST disabled
- chamadas/dia = 0
- orçamento de IA = 0

Não ativar só para “passar” o checklist.

### Critério 18 — Custo de IA é medido

`ai_action_executions` possui:

- `estimated_cost_brl`
- `actual_cost_brl`

A infraestrutura de medição existe, porém ainda não houve execução governada nessa etapa para gerar amostra real de custo.

## 4. Homologação e segurança

Função:

`public.cm1_homologation_readiness_v1()`

Estado atual:

- `safe_for_internal_homologation=true`
- blockers: 0
- `external_activation_authorized=false`

Warnings atuais:

- `identity_conflicts_pending`
- `no_positive_marketing_consent`
- `legacy_automation_outbound_live_but_canonical_gate_closed`

O warning de consentimento é esperado e correto: não existe consentimento canônico positivo de marketing, então as oportunidades permanecem suprimidas.

O warning legado existe porque `automation_config` ainda conserva flags antigas. Os gates canônicos continuam fechados e têm precedência.

**Não limpar flags legadas sem antes confirmar que nenhum fluxo antigo depende delas.**

## 5. Gates que NÃO podem ser abertos automaticamente

No frontend:

- `customerOsSecureUiEnabled=false`
- `relationshipUiEnabled=false`
- `relationshipCanaryEnabled=true`
- canary param: `relationship_os`
- canary value: `canary`

Arquivo:

`admin/runtime-config.js`

Gates manuais pendentes:

- validação do PIN do Customer OS no navegador
- validação do PIN da Central de Relacionamento no navegador
- inspeção visual da Central em canary
- verificação do Meta Policy Registry
- homologação do Meta Direct
- autorização humana explícita para ativação externa

**Não descobrir, testar, inferir ou contornar o PIN.**

## 6. PapoAI Adapter — estado real

Função de evidência:

`public.cm1_transport_evidence_v1()`

Último snapshot observado:

- provider: PapoAI
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
- `adapter_receiving_real_traffic=true`
- `legacy_transport_recently_active=false`
- `external_side_effect=false`

Último evento do adapter observado no snapshot: 18/09/2026 18:37:38 UTC.

Arquitetura:

```text
PapoAI
  → papo-comprar-webhook-v1
  → ingest_channel_adapter_event_v1
  → Identity Resolver
  → normalized_channel_events
  → Customer OS
  → Shopping Room / demais consumidores
```

O PapoAI deve continuar sendo apenas provider temporário. Regra de negócio não deve depender do payload específico dele.

## 7. Meta Direct

`whatsapp-meta-direct-v1` está versionado no GitHub e mantém hard gate dedicado.

O caminho de envio só pode avançar se `whatsapp_direct_config` liberar.

Estado obrigatório durante homologação:

- Meta Direct OFF
- release mode OFF
- outbound canônico OFF
- publishing OFF
- templates runtime enabled = 0
- nenhuma campanha automática
- nenhuma ativação externa

`automation_config` legado não deve ser usado para decidir o gate do Meta Direct.

## 8. Consentimento / Customer Protection

Arquitetura correta:

- `customer_channel_consents`: current state
- `customer_channel_consent_events_v1`: append-only ledger
- `customer_contact_suppressions`: suppression
- `evaluate_customer_contact_eligibility_v1`: decisão determinística

Regra:

- UNKNOWN/DENIED/REVOKED não pode virar marketing permitido
- GRANTED requer evidência
- nenhum botão fácil de “dar consentimento” no Admin
- não enfraquecer política para aumentar audiência

O snapshot atual possui 0 clientes liberados para marketing, o que é esperado enquanto não houver consentimento positivo válido.

## 9. Product Marketing Readiness

Tabela/view principal:

`product_marketing_readiness_v1`

Snapshot da implantação CM-1.6:

- produtos: 1.814
- marketing-ready: 671
- bloqueados: 1.143
- readiness médio: ~87,5%

Hard requirements de eligibility:

- ativo
- status comercial permitido
- estoque > 0
- preço efetivo > 0
- custo > 0
- margem positiva
- imagem
- taxonomia
- sales_category

Marketing Brain usa shortlist v2 filtrada por readiness.

## 10. Product/Brand Graph

Tabela:

`product_relation_edges`

Relações:

- SAME_LINE
- COMPLEMENTARY
- SUBSTITUTE
- UPSELL
- DOWNSELL
- COMPATIBLE_BRAND
- BOUGHT_TOGETHER

Após precision pass:

- 526 edges
- 147 active
- 379 suggested
- cross-leaf rule errors = 0
- weak active purchase edges = 0

Relações automáticas fracas devem permanecer suggested.

## 11. Segment Engine

Objetos:

- `customer_segment_registry_v1`
- `customer_segment_facts_v1`
- `get_customer_dynamic_segments_v1`
- `query_customer_segment_v1`
- `segment_engine_summary_v1`

Segmentos incluem:

- comprou alguma vez
- primeira compra
- recorrente
- 30d / 60d sem compra
- mercearia
- lavanderia
- higiene
- cesta básica
- marca
- categoria
- falou e não comprou
- carrinho não concluído
- marketing permitido/não permitido
- atendimento/problema
- baixa qualidade de dados
- compatibilidade com segmentos legados

Segmentação deve permanecer determinística.

## 12. Customer Commercial Profile

Objetos principais:

- `customer_commercial_profile_v1`
- `get_customer_commercial_profile_v1`
- `customer_commercial_profile_summary_v1`

Calcula por SQL/código:

- pedidos
- LTV
- ticket médio
- recência
- intervalo de recompra
- produtos/categorias/marcas
- engajamento
- completude
- qualidade dos dados

Não usar IA para contas deriváveis.

## 13. Opportunity Engine

Tabela:

`customer_marketing_opportunities`

Função principal:

`evaluate_customer_opportunities_v1`

Oportunidades existem na base, mas atualmente permanecem suprimidas pelos guardrails enquanto consent/protection não liberarem.

Não transformar oportunidade detectada em envio.

## 14. Marketing Brain

Função/Edge:

`admin-marketing-brain-v1`

Estado:

- OBSERVE: permitido sem side effect
- SUGGEST: gate fechado durante homologação
- IA: zero chamada por padrão
- custo: zero nessa fase
- não criar campanha automaticamente

Read model:

`marketing_strategy_brief_summary_v1()`

## 15. Templates WhatsApp

Tabela:

`whatsapp_direct_templates`

Capacidades:

- biblioteca local
- criação manual
- versionamento
- validação de placeholders
- associação a estratégia/criativo
- DRAFT

Estado obrigatório:

- enabled=false
- meta_status=not_submitted quando não submetido
- sem submissão automática à Meta
- IA de template gateada

## 16. Central de Relacionamento

Arquivos:

- `admin/relacionamento.html`
- `admin/relacionamento.css`
- `admin/relacionamento.js`
- `admin/relationship-api.js`

Backend reaproveita:

`customer-intelligence-v1`

Actions:

- `relationship_overview`
- `relationship_audit`

Áreas:

- Visão Geral
- Clientes
- Segmentos
- Oportunidades
- Produtos
- Marcas
- Marketing Brain
- Templates
- Meta Foundation
- Qualidade dos Dados
- Homologação CM-1
- Auditoria

A aba Homologação mostra automaticamente os 20 critérios, evidências e gates manuais.

## 17. Instrumentação nova do Comprar

Collector:

`record_catalog_interaction_v1`

Eventos novos:

- `catalog_search`
- `product_view`

Arquivos:

- `supabase/migrations/20260919060000_cm_1_homologation_catalog_interactions_v1.sql`
- `supabase/functions/shopping-chat-products-v1/index.ts`
- `comprar/products.js`
- `comprar/index.html`

Smoke confirmado:

- primeira busca cria 1 evento
- repetição dentro da janela vira duplicate
- primeira visualização cria 1 evento
- repetição dentro da janela vira duplicate
- fixture apagada após teste

## 18. Migrations/checkpoints mais recentes da homologação

- `20260919040000_cm_1_15_relationship_command_center_v1.sql`
- `20260919050000_cm_1_homologation_readiness_v1.sql`
- `20260919053000_cm_1_homologation_transport_evidence_v1.sql`
- `20260919060000_cm_1_homologation_catalog_interactions_v1.sql`
- `20260919063000_cm_1_homologation_acceptance_checklist_v1.sql`
- `20260919063500_cm_1_homologation_acceptance_checklist_v2_fix.sql`

A V2 corrige a leitura de objeto de segmentos no acceptance checklist.

## 19. Testes relevantes

Scripts novos/atuais:

- `scripts/test-customer-marketing-security-boundary-v1.mjs`
- `scripts/test-cm-1-2-identity-resolver.mjs`
- `scripts/test-cm-1-3-customer-360.mjs`
- `scripts/test-cm-1-4-event-collector.mjs`
- `scripts/test-cm-1-5-consent-protection.mjs`
- `scripts/test-cm-1-6-product-marketing-profile.mjs`
- `scripts/test-cm-1-7-product-brand-graph.mjs`
- `scripts/test-cm-1-8-segment-engine.mjs`
- `scripts/test-cm-1-9-customer-commercial-profile.mjs`
- `scripts/test-cm-1-10-opportunity-engine.mjs`
- `scripts/test-cm-1-11-marketing-brain-observe-suggest.mjs`
- `scripts/test-cm-1-12-meta-foundation.mjs`
- `scripts/test-cm-1-13-template-draft-assistant.mjs`
- `scripts/test-cm-1-14-papoai-adapter.mjs`
- `scripts/test-cm-1-15-relationship-command-center.mjs`
- `scripts/test-cm-1-homologation-readiness.mjs`
- `scripts/test-cm-1-acceptance-checklist.mjs`
- `scripts/test-cm-1-catalog-interactions.mjs`

Também foi atualizado:

- `scripts/test-comprar-clean-papo-identity-v1.mjs`

O teste legado não deve mais exigir `lookup_customer_by_phone` dentro do PapoAI webhook; o provider deve delegar ao Identity Resolver canônico.

## 20. CI observado antes deste checkpoint

Última bateria relevante observada em commit:

`ae7bc593845ff7714247ccf2abef4ce4e7887ed4`

Resultados:

- Testar Sala de Compra: success
- Testar Admin e compatibilidade Vitrine: success
- Bloquear dependências do Admin legado: success
- Testar Admin Dona Antônia: success
- Testar vendas conversacionais: success
- Testar Imagens IA no Admin oficial: success

Depois disso houve commits paralelos do Marketing Round 8. O HEAD observado antes do checkpoint foi `d11b6df...`; Pages estava em execução. Portanto, na retomada, **consultar CI do HEAD mais recente antes de modificar qualquer coisa**.

## 21. Pontos que não devem regredir

Não fazer:

- ativar Meta Direct
- ligar publishing
- ativar outbound canônico
- habilitar templates para runtime
- criar campanha automática
- criar consentimento positivo artificial
- reduzir proteções para aumentar audiência
- fazer merge de identidade de baixa confiança
- descobrir/testar PIN automaticamente
- ligar IA só para transformar um critério “implemented” em “verified”
- apagar configuração legada sem auditoria
- voltar a colocar `lookup_customer_by_phone` como regra dentro do adapter PapoAI
- duplicar Customer OS/CRM em novas tabelas sem necessidade
- sobrescrever alterações paralelas do módulo Marketing

## 22. Próxima sequência recomendada

1. Consultar o HEAD e CI mais recentes.
2. Rodar/confirmar os testes do acceptance checklist e do Comprar no HEAD atual.
3. Manter `external_activation_authorized=false`.
4. Pedir ao responsável somente o teste **manual** da Central em canary com o PIN já conhecido por ele.
5. Validar visual da Central no computador e celular.
6. Revisar manualmente o conflito de identidade pendente; não auto-resolver.
7. Confirmar tráfego real `catalog_search` e `product_view` após uso do Comprar.
8. Atualizar o acceptance checklist; esses critérios devem migrar automaticamente para verified quando houver evidência.
9. Revisar o warning da `automation_config` legada antes de qualquer limpeza.
10. Não abrir Marketing/Meta outbound até a homologação interna estar encerrada e houver autorização explícita.

## 23. Prompt recomendado para iniciar a próxima janela

Use:

> Acesse o GitHub `osvaldosereia/SUCEDOAN12` e o Supabase `ssbesxgaijknwsjbsbcz`. Leia primeiro `docs/RETOMADA-CUSTOMER-MARKETING-OS-ATUAL.md`, depois `docs/CUSTOMER-MARKETING-OS-ETAPA-CM1.md` e `docs/CUSTOMER-MARKETING-OS-CM1-ACCEPTANCE-CHECKLIST.md`. Continue exatamente de onde paramos na homologação CM-1. Preserve alterações paralelas do Marketing, consulte o CI mais recente antes de editar, mantenha todos os gates externos fechados e não teste nem descubra meu PIN. Decida a melhor sequência e continue.

## 24. Regra de ouro da retomada

O projeto já está na fase de **homologação**, não de reconstrução.

A prioridade é:

```text
evidência
→ CI
→ canary manual
→ correção do que aparecer
→ fechamento da CM-1
→ somente depois discutir ativação externa
```

Nenhuma ação externa deve ser habilitada apenas porque a infraestrutura está pronta.
