# Customer & Marketing OS — CM-0 Architecture Lock

Atualizado em 18/09/2026.

Status: **CM-0 CONCLUÍDA — ARQUITETURA TRAVADA PARA A CM-1**.

Este documento registra a auditoria real de GitHub + Supabase e define quais estruturas são canônicas, quais são adapters/legado e quais lacunas devem ser preenchidas sem reconstruir o sistema.

## 1. Conclusão principal

A base atual já contém grande parte da arquitetura necessária.

Não criar um novo CRM, um novo motor de automações, um novo barramento de canais ou um novo sistema de marketing em paralelo.

A estratégia oficial é:

> **reaproveitar, consolidar, proteger e evoluir o que já existe.**

## 2. Fontes canônicas travadas

### Cliente

Canônico:

- `customers`
- `customer_phones`
- `customer_emails`
- `customer_addresses`

`customers.id` é o identificador canônico interno.

Não usar telefone como primary key.

### Identidades por canal

Canônico:

- `channel_accounts`
- `customer_channel_identities`
- `customer_identity_link_events`

A identidade de canal pode existir observada antes do vínculo confirmado.

Nunca unir pessoas apenas por nome.

### Conversa e mensagens

Canônico:

- `conversations`
- `messages`

O canal/provedor não cria CRM paralelo.

### Eventos de canal

Canônico:

- `channel_raw_events` = envelope cru/referência/hash
- `normalized_channel_events` = evento normalizado omnichannel

Todo adapter futuro deve convergir para `normalized_channel_events`.

### Eventos comportamentais

Permanecem por domínio:

- `customer_behavior_events`
- `catalog_events`
- eventos de pedido;
- eventos de experiência;
- eventos de marketing;
- eventos de canal.

Não juntar fisicamente tudo em uma mega-tabela agora.

A visão consolidada para consumo será o read model `customer_timeline_v1`, que deve ser ampliado progressivamente.

### Consentimento

Canônico futuro:

- `customer_channel_consents`

Histórico/evidência auxiliar:

- `customer_consent_events`

`marketing_consents` é considerado **legado específico de WhatsApp/marketing** e não deve receber novos requisitos estruturais. Manter compatibilidade até migração.

Não excluir nesta fase.

### Pedido e histórico

Canônico operacional:

- `orders`
- `order_items`

Staging/reconciliação Bling:

- `bling_history_staging_orders`
- `bling_history_staging_items`
- fila/issues/readiness relacionados.

Staging não é Customer 360 final. Pedido só entra como verdade canônica após reconciliação segura.

### Inteligência de compra

Reaproveitar:

- `customer_product_stats`
- `customer_purchase_summary_v1`
- `customer_purchase_intelligence_v1`
- `customer_commercial_segments_v1`
- `get_customer_purchase_history_v1`
- `get_customer_purchase_intelligence_v1`
- `get_customer_commercial_segments_v1`
- `get_customer_frequent_purchases_v1`
- `get_customer_last_purchase_v1`.

Essas estruturas já resolvem parte relevante da CM-1.8/CM-1.9.

### Automação e ações

Canônico:

- `ai_action_registry`
- `ai_action_executions`
- `automation_workflows`
- `automation_workflow_versions`
- `automation_workflow_executions`
- `automation_workflow_events`

Não criar outro Journey/Workflow engine paralelo.

Novas ações devem referenciar `ai_action_registry.action_key`.

### Decisão comercial

Canônico:

- `commercial_decision_evaluations`
- runtime/policies relacionados.

Essa estrutura será evoluída para sustentar Next Best Action e Marketing Brain.

### Marketing

Canônico e reaproveitável:

- `marketing_runtime_config`
- `marketing_campaigns`
- `marketing_content_templates`
- `marketing_assets`
- `marketing_publication_jobs`
- `marketing_events`
- `marketing_attribution_touchpoints`
- `marketing_render_jobs`
- estruturas de mídia/carrossel/revisão.

Marketing atual está fail-closed e será expandido para audiência, estratégia e WhatsApp, não substituído.

### WhatsApp/Meta

Abstração canônica de canal:

- `channel_accounts`
- capabilities em `channel_accounts.capabilities`
- eventos normalizados.

Estruturas `whatsapp_direct_*` são consideradas **adapter/runtime específico de transporte**, não CRM nem regra de negócio.

Elas podem ser evoluídas ou substituídas internamente quando a Meta direta assumir, sem contaminar Customer Brain.

### PapoAI

`papo-comprar-webhook-v1` é adapter temporário.

Ele já:

- normaliza telefone;
- procura cliente;
- atualiza/cria conversa;
- inicia Sala de Compra;
- registra provider no contexto.

Próxima evolução: também emitir evento normalizado/behavioral sem fazer o core depender do payload PapoAI.

## 3. Estado real encontrado

### Segurança/gates

Marketing:

- enabled = false
- execution_mode = off
- canary = 0
- kill_switch = true
- generation = false
- publishing = false
- IA de imagem/vídeo = false
- require_approval = true

WhatsApp direto:

- enabled = false
- release_mode = off

Automation workflows:

- 2 registros
- 0 habilitados
- kill switches permanecem fechados.

Isso confirma que as fundações podem ser evoluídas sem disparar ações externas.

## 4. Descoberta crítica: Admin público

O Admin oficial atual usa endpoints com `verify_jwt=false`.

Foram encontrados:

- `admin-simple-v2` público;
- `admin-core-v1` público;
- `admin-core-v1` usa service role internamente e possui ações de clientes.

CORS restrito ajuda o navegador, mas **não substitui autenticação**.

Com o novo escopo Customer 360/marketing/Meta, não devemos ampliar PII, campanhas, consentimentos ou controles Meta sobre endpoints públicos.

### Decisão travada

- manter funcionalidades operacionais antigas apenas enquanto necessário;
- **todo novo módulo Customer & Marketing OS sensível deve nascer autenticado**;
- reaproveitar `admin-pin-auth-v1`/Supabase Auth ou proteção equivalente;
- migrar progressivamente as ações de cliente sensíveis para endpoint autenticado;
- não expor novos Customer 360/Consent/Meta/Marketing endpoints em `admin-simple-v2` ou `admin-core-v1` público.

Essa é prioridade CM-1.1.

## 5. RLS — descoberta confirmada

Há 6 tabelas sem RLS:

- `agent_eval_release_markers`
- `whatsapp_basket_media_assets`
- `whatsapp_direct_config`
- `whatsapp_direct_events`
- `whatsapp_direct_state`
- `whatsapp_direct_templates`

As tabelas `whatsapp_direct_*` e `whatsapp_basket_media_assets` hoje possuem privilégios de dados basicamente para `service_role`/postgres, o que reduz a exposição imediata, mas RLS continua necessário como defesa em profundidade.

Não aplicar `ENABLE ROW LEVEL SECURITY` às cegas.

CM-1.1 deve:

1. mapear todos os consumidores;
2. definir policies/grants;
3. testar;
4. habilitar RLS com rollback.

## 6. Sobre “RLS enabled, no policy”

O advisor também lista muitas tabelas com RLS habilitado e sem policies.

Neste projeto isso é frequentemente intencional porque:

- o acesso é server-only;
- anon/authenticated foram revogados;
- Edge Functions usam service role.

Portanto “sem policy” não deve ser tratado automaticamente como erro.

Avaliar por superfície e grants reais.

## 7. Customer 360 existente

O Admin atual já possui uma primeira versão útil de histórico:

- pedidos;
- lifetime value;
- ticket médio;
- última compra;
- intervalo de recompra;
- produtos recorrentes;
- categorias;
- segmentos comerciais;
- detalhe de pedido.

Reaproveitar.

Faltam para o Customer 360 alvo:

- identidades/canais;
- consentimentos;
- timeline consolidada;
- comportamento;
- campanhas recebidas;
- respostas;
- marketing pressure;
- data quality;
- problemas/handoffs;
- afinidade por marca;
- brand loyalty/switchability;
- next best action.

## 8. Segmentação existente

`customer_commercial_segments_v1` já oferece segmentos como:

- primeiro comprador;
- recorrente;
- mensal;
- inativo;
- alto valor;
- comprador de cesta;
- produtos avulsos;
- cesta favorita;
- próximo da recompra.

Decisão:

- reaproveitar como camada inicial;
- criar Segment Engine mais amplo em cima dela;
- não substituir esta view apenas por IA.

## 9. Personalização já existente

`get_personalized_offers_v1` já fornece uma base de ofertas personalizadas no Comprar.

Decisão:

- manter como recomendação determinística inicial;
- evoluir posteriormente com Product/Brand Graph;
- estoque/preço/margem continuam determinísticos.

## 10. Gaps reais a implementar

### CM-1.1
- autenticação da área sensível;
- revisão RLS;
- contract boundary para Admin Customer/Marketing.

### CM-1.2
- Identity Resolver unificando telefone/CPF/Bling/channel identity com confiança/auditoria.

### CM-1.3/1.4
- Customer 360 ampliado;
- captura de eventos muito mais completa;
- timeline.

### CM-1.5
- consolidar `customer_channel_consents` como ledger canônico;
- suppression engine.

### CM-1.6/1.7
- Product Marketing Profile;
- Product/Brand Graph.

### CM-1.8/1.9
- ampliar segmentos e scores usando o que já existe.

### CM-1.10/1.11
- Opportunity Engine;
- Marketing Brain em OBSERVE/SUGGEST.

### CM-1.12/1.13
- Meta Control Plane contract;
- Template Manager/Draft Assistant.

## 11. Convenções travadas

### IDs

- IDs internos: UUID quando a entidade já segue UUID.
- IDs externos nunca substituem o ID interno.
- provider IDs ficam em colunas/metadata específicos.

### Providers

Formato conceitual:

- channel = whatsapp
- provider = papoai | meta_cloud_api | web | outros adapters

Regra de negócio nunca testa `provider='papoai'` para decidir comportamento comercial.

### Eventos

Formato lógico mínimo:

- event_type;
- occurred_at;
- source;
- channel;
- provider;
- customer_id;
- conversation_id;
- subject refs;
- metadata;
- idempotency/evidence key.

### Autonomia

Padrão oficial:

`OFF → OBSERVE → SUGGEST → DRAFT → APPROVAL_REQUIRED → HOMOLOGATION → CANARY → LIVE/AUTONOMOUS`

### Falha

Ações externas sensíveis: fail-closed.

### IA

`SQL/código → Luna → Terra → Sol`.

Escalonar modelo por necessidade, não por padrão.

### Auditoria

Decisões e side effects relevantes precisam registrar:

- input/evidence;
- decisão;
- política/versão;
- confiança;
- ação;
- resultado;
- custo;
- timestamp.

## 12. Estruturas que NÃO devem ser criadas agora

Não criar paralelamente:

- novo `customers_v2`;
- novo `crm_customers`;
- novo `marketing_customers`;
- nova tabela genérica de mensagens;
- novo workflow engine;
- novo action registry;
- novo sistema de campanhas desconectado de `marketing_campaigns`;
- nova abstração de canal fora de `channel_accounts`;
- CRM específico para PapoAI.

## 13. Próximo passo oficial

CM-0 encerrada.

Próxima rodada:

**CM-1.1 — Segurança e fundação**

Ordem:

1. proteger Customer/Marketing/Meta sensível;
2. preparar migração das ações de cliente para endpoint autenticado;
3. revisar as 6 tabelas sem RLS e propor policy/grants;
4. criar testes contratuais de segurança;
5. só então ampliar Customer 360.
