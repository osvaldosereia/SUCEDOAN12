# TECHNICAL INVENTORY — Customer & Marketing OS

Mapa resumido dos componentes centrais. Consultar o HEAD antes de editar.

## GitHub / Frontend

### Admin / Central de Relacionamento
- `admin/relacionamento.html`
- `admin/relacionamento.css`
- `admin/relacionamento.js`
- `admin/relationship-api.js`
- `admin/runtime-config.js`

### Comprar
- `comprar/products.js`
- `comprar/index.html`

## Edge Functions / backend

Principais componentes citados na CM-1:

- `customer-intelligence-v1`
- `shopping-chat-products-v1`
- `admin-marketing-brain-v1`
- `papo-comprar-webhook-v1`
- `whatsapp-meta-direct-v1`

Antes de alterar qualquer Edge Function, consultar o código implantado e o arquivo no HEAD.

## Funções SQL canônicas

### Homologação
- `cm1_acceptance_checklist_v1()`
- `cm1_homologation_readiness_v1()`
- `cm1_transport_evidence_v1()`

### Eventos
- `record_catalog_interaction_v1`
- `ingest_channel_adapter_event_v1`

### Customer / Segment / Profile
- `get_customer_dynamic_segments_v1`
- `query_customer_segment_v1`
- `get_customer_commercial_profile_v1`

### Protection
- `evaluate_customer_contact_eligibility_v1`

### Identity review
Backend `customer-intelligence-v1`:
- action `identity_conflicts`;
- action `identity_review`;
- revisão exige justificativa;
- `review_only_no_merge`;
- `external_side_effect=false`.

Admin:
- `getIdentityConflicts()`;
- `reviewIdentityConflict()`;
- fila visual em Qualidade dos Dados.

### Opportunity
- `evaluate_customer_opportunities_v1`

## Tabelas / views relevantes

### Customer identity / channel
- `customers`
- `customer_phones`
- `customer_addresses`
- `customer_channel_identities`
- `normalized_channel_events`

### Conversa / eventos
- `conversations`
- `messages`
- `customer_behavior_events`
- `catalog_sessions`
- `catalog_events`

### Compras
- `carts`
- `cart_items`
- `orders`
- `order_items`
- `customer_product_stats`

### Consent / protection
- `customer_channel_consents`
- `customer_channel_consent_events_v1`
- `customer_contact_suppressions`

### Product intelligence
- `product_marketing_readiness_v1`
- `product_relation_edges`

### Marketing intelligence
- `customer_marketing_opportunities`
- `marketing_strategy_briefs`
- `ai_action_executions`

### Meta / WhatsApp
- `channel_accounts`
- `whatsapp_direct_config`
- `whatsapp_direct_templates`
- Meta control plane tables/migrations correspondentes

## Migrations centrais de homologação

- `20260919040000_cm_1_15_relationship_command_center_v1.sql`
- `20260919050000_cm_1_homologation_readiness_v1.sql`
- `20260919053000_cm_1_homologation_transport_evidence_v1.sql`
- `20260919060000_cm_1_homologation_catalog_interactions_v1.sql`
- `20260919063000_cm_1_homologation_acceptance_checklist_v1.sql`
- `20260919063500_cm_1_homologation_acceptance_checklist_v2_fix.sql`

## Testes relevantes

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
- `scripts/test-comprar-clean-papo-identity-v1.mjs`

## Runtime invariants durante homologação

Devem continuar verdadeiros:

- canonical outbound = false;
- canonical AI = false;
- canary canonical = 0;
- WhatsApp Direct enabled = false;
- WhatsApp Direct release_mode = off;
- Marketing enabled = false;
- Marketing execution = off;
- publishing = false;
- kill switch = true;
- daily publications = 0;
- daily AI budget = 0;
- PapoAI outbound = disabled;
- template runtime enabled = 0;
- external activation = false.

## Observação

Este inventário é um mapa de entrada, não substitui inspeção do schema/HEAD antes de modificar componentes.


## Meta Policy Registry / Preflight

### Policy Registry

- tabela: `meta_policy_registry`;
- readiness: `meta_policy_registry_readiness_v1()`;
- migration: `20260919071000_cm_1_meta_policy_registry_verified_v1.sql`;
- 8 políticas obrigatórias;
- freshness: 30 dias;
- service-role only;
- `external_side_effect=false`;
- `external_activation_authorized=false`.

### Meta Direct readiness

- snapshot: `get_meta_control_plane_snapshot_v1()`;
- readiness: `evaluate_meta_direct_readiness_v1(uuid)`;
- permissões: `meta_account_permissions`;
- health: `meta_provider_health_snapshots`;
- erros: `meta_control_plane_errors`;
- webhook evidence: `meta_webhook_events`.

Blockers atuais:
- `graph_api_version_unverified`;
- `permissions_unverified_or_blocking`;
- `webhook_not_verified`;
- `direct_ready_flag_false`.

### Edge Functions

- `whatsapp-meta-direct-v1` — deployment version 2; webhook público com HMAC; Graph version explícita obrigatória;
- `admin-whatsapp-direct-v1` — deployment version 4; JWT obrigatório; Graph version explícita obrigatória;
- `customer-intelligence-v1` — deployment version 19.

### Testes novos

- `scripts/test-cm-1-meta-policy-registry-v1.mjs`;
- `scripts/test-cm-1-meta-direct-graph-version-gate.mjs`.

Não usar fallback de Graph API version.


### Central Meta read model

- migration: `20260919072000_cm_1_meta_policy_command_center_v1.sql`;
- `relationship_command_summary_v1()` versão `cm1.15-v2`;
- campos novos:
  - `meta_policy_registry`;
  - `meta_direct_readiness`;
- UI: `admin/relacionamento.js`;
- cache: `20260918-5`;
- teste: `scripts/test-cm-1-meta-command-center-v1.mjs`.


## Meta homologation runtime — 18/09/2026

- `admin-whatsapp-direct-v1`: v7 / JWT true / diagnóstico Meta read-only.
- `whatsapp-meta-direct-v1`: v3 / webhook público com autenticação Meta própria / ingress fail-closed.
- `whatsapp-flow-health-webhook-v1`: v4 / health callback legado ainda ativo.

Evidência:

- `meta_provider_health_snapshots`;
- `meta_account_permissions`;
- `meta_webhook_events`;
- `whatsapp_flow_health_events`.

Testes adicionais:

- `scripts/test-cm-1-meta-readonly-diagnostics-v1.mjs`;
- `scripts/test-cm-1-meta-direct-unified-ingress-v1.mjs`.

Regra: não remover `whatsapp-flow-health-webhook-v1` nem trocar callback na Meta durante homologação interna. A migração de callback é gate externo separado.
