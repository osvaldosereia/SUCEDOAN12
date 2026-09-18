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
