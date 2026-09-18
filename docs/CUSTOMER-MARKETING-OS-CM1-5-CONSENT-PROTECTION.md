# Customer & Marketing OS — CM-1.5 Consent Ledger e Customer Protection

Atualizado em 18/09/2026.

Status: **V1 IMPLANTADA — MARKETING FAIL-CLOSED POR PADRÃO**.

## Objetivo

Antes de qualquer automação comercial decidir **quem deve receber uma mensagem**, o sistema precisa responder de forma explicável:

- pode receber?
- por qual canal?
- para qual finalidade?
- com qual evidência de consentimento?
- existe algum bloqueio?
- existe pedido em andamento?
- existe atendimento humano em andamento?
- o cliente acabou de interagir?
- já recebeu marketing recentemente?

Nenhuma IA participa dessa decisão.

## Modelo canônico de consentimento

Durante a implantação foi confirmado que `customer_channel_consents` já possuía índices únicos por cliente/canal/finalidade/identidade.

Portanto ela é tratada como **estado atual**, e não como ledger append-only.

Foi criado o ledger real:

`customer_channel_consent_events_v1`

Cada evento armazena:

- customer_id;
- channel;
- identidade de canal ou e-mail;
- purpose;
- status;
- source;
- evidence;
- policy_version;
- event_key;
- recorded_by;
- occurred_at;
- created_at.

Estados suportados:

- unknown;
- granted;
- denied;
- revoked.

## Estado atual + histórico

`record_customer_consent_v1`:

1. valida cliente, canal, finalidade e evidência;
2. grava evento append-only;
3. atualiza o estado atual por UPSERT;
4. não deixa evento antigo sobrescrever estado mais novo;
5. preserva idempotência por `source + event_key`;
6. atualiza `customers.marketing_opt_in` apenas como cache de compatibilidade.

A fonte de verdade passa a ser o consentimento canônico.

## Evidência obrigatória

Consentimento `granted` exige `evidence.method`.

Na ação administrativa protegida, um grant manual só é aceito com:

- método `manual_documented`;
- observação documental mínima.

A UI não oferece um botão simples para “liberar marketing”.

Isso evita transformar um clique administrativo em consentimento fictício.

## Comprar / Sala de Compra

`room_save_customer_preferences` foi conectado ao ledger canônico.

Quando o cliente escolhe sua preferência:

- opt-in explícito → `granted`;
- recusa inicial → `denied`;
- retirada posterior → `revoked`.

Evidência registrada:

- method = explicit_checkbox;
- surface = shopping_room;
- catalog_session_id;
- preference_value;
- policy version.

A tabela antiga `customer_consent_events` continua recebendo o evento por compatibilidade temporária.

`marketing_consents` permanece legado e não recebeu novos requisitos estruturais.

## Suppression Engine

Nova tabela:

`customer_contact_suppressions`

Pode bloquear contato por:

- canal;
- finalidade;
- motivo;
- origem;
- evidência;
- prazo opcional.

Bloqueios administrativos suportados inicialmente:

- customer_request;
- complaint;
- wrong_number;
- manual_hold;
- legal_request.

## Política configurável

`marketing_contact_policy_v1` começa com:

- consentimento granted obrigatório;
- cooldown de 24h;
- bloquear durante pedido em andamento;
- bloquear durante atendimento humano;
- bloquear durante atividade recente do cliente por 60 minutos;
- cliente ativo obrigatório;
- telefone válido obrigatório no WhatsApp;
- identidade de canal vinculada obrigatória.

Esses valores ficam no banco para futura edição segura pelo Admin.

## Função de elegibilidade

`evaluate_customer_contact_eligibility_v1`

Retorna:

- allowed;
- decision;
- reasons;
- consent;
- estado operacional;
- suppressions;
- política aplicada;
- evaluated_at.

Exemplos de reasons:

- marketing_consent_unknown;
- marketing_consent_denied;
- marketing_consent_revoked;
- invalid_or_missing_phone;
- channel_identity_missing;
- active_suppression;
- order_in_progress;
- human_service_in_progress;
- recent_customer_activity;
- marketing_cooldown.

## Smoke tests executados

Foi usado um cliente real elegível apenas como referência de teste, sem deixar dados de teste persistentes.

Cenários confirmados:

1. sem consentimento → suppressed / marketing_consent_unknown;
2. consentimento granted explícito → allowed quando nenhum outro guardrail bloqueia;
3. suppression ativa → suppressed / active_suppression;
4. mudança granted → revoked atualizou o mesmo estado atual e manteve eventos separados no ledger;
5. cache legado `marketing_opt_in` acompanhou o estado canônico.

Todos os registros `cm15_*` de teste foram removidos e o estado original do cliente foi restaurado.

## Customer 360

O backend protegido agora retorna:

- consentimento atual;
- ledger de consentimento;
- avaliação do Customer Protection.

A interface protegida mostra:

- marketing liberado/bloqueado;
- consentimento;
- motivos do bloqueio;
- cooldown;
- suppressions;
- opção de bloqueio manual;
- opção de registrar opt-out/revogação;
- liberação de suppression manual.

## Estado de segurança

Nada disso ativa envio.

Continuam separados:

- elegibilidade do cliente;
- criação de campanha;
- aprovação;
- Meta Control Plane;
- template;
- envio.

A ausência de consentimento resulta em bloqueio por padrão.

## Próximo passo

CM-1.6 — Product Marketing Profile.

O próximo bloco deve enriquecer os produtos para o Marketing Brain usando dados determinísticos primeiro:

- marca;
- categoria;
- função/uso;
- ocasiões;
- compatibilidades;
- margem;
- estoque;
- oferta;
- sazonalidade;
- frequência de recompra;
- relações de produto;
- público provável com evidência comercial.

IA somente onde agregar valor e sempre com política de custo.
