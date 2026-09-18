# Homologação CM-1 — Auditoria de Legado + Evidência Meta V1

Atualizado em 18/09/2026.

## Objetivo

Registrar de forma auditável duas pendências de homologação que não devem depender de memória:

1. risco das flags legadas de `automation_config`;
2. evidência real disponível ou ausente para Meta Direct.

Nenhum gate externo foi aberto nesta rodada.

---

## 1. Auditoria do legado WhatsApp

### Estado atual de `automation_config`

- `automation_enabled=true`
- `outbound_enabled=true`
- `whatsapp_release_mode=live`
- `whatsapp_live_canary_percent=1`

Subgates críticos atualmente fechados:

- `ai_enabled=false`
- `conversation_worker_enabled=false`
- `conversation_worker_dispatch_enabled=false`
- `whatsapp_auto_reply_enabled=false`

### Evidência operacional

`outbound_jobs`:

- sent históricos: 166;
- cancelled históricos: 14;
- error histórico: 1;
- processing histórico: 1;
- jobs criados nas últimas 24h: 0;
- jobs criados nos últimos 7 dias: 0.

`operator_reply_jobs`:

- nenhuma linha encontrada.

### Dependências legadas encontradas no código

Ainda existem funções/migrations históricas que consultam `automation_config` para:

- outbound bridge;
- event dispatch;
- greeting/menu;
- worker;
- sales reply;
- operator reply;
- health/readiness.

Portanto, **não é seguro desligar ou limpar as flags legadas apenas porque o core canônico novo está fail-closed**.

Decisão desta rodada:

> manter `legacy_automation_outbound_live_but_canonical_gate_closed` como warning e não alterar `automation_config` até existir plano explícito de desativação das rotas legadas.

---

## 2. Evidência Meta já presente

No read model `meta_control_plane_account_v1`:

- channel: WhatsApp;
- channel_status: active;
- WABA ID: presente;
- Phone Number ID: presente;
- inbound_enabled: true;
- outbound_enabled: false;
- ai_enabled: false;
- auto_reply_enabled: false;
- canary_percent: 0;
- provider_state: read_only;
- graph_api_version: null;
- readiness_state: foundation_only;
- meta_direct_ready: false.

A configuração dedicada de WhatsApp Direct continua:

- `enabled=false`;
- `release_mode=off`.

---

## 3. Evidência Meta ainda ausente

### Permissões

Tabela `meta_account_permissions`:

- 0 registros.

Logo ainda não existe evidência persistida de permissões concedidas.

As permissões relevantes para Cloud API incluem:

- `whatsapp_business_management`;
- `whatsapp_business_messaging`.

Não marcar permissões como verificadas sem leitura real do token/app.

### Provider health

Tabela `meta_provider_health_snapshots`:

- 0 registros.

Logo ainda não existe snapshot real de qualidade/health/provider.

### Webhook

Tabela `meta_webhook_events`:

- 0 registros.

Logo ainda não existe evidência real de callback Meta recebido e validado pelo pipeline novo.

### Graph API version

`graph_api_version` permanece `null`.

Nesta rodada foi feita pesquisa pública para confirmar documentação atual. Foi possível confirmar requisitos de permissões e webhook, mas não foi obtida uma fonte oficial acessível suficientemente confiável para gravar a versão Graph atual sem risco de suposição.

Decisão:

> não preencher `graph_api_version` manualmente sem evidência oficial ou administrativa verificável.

---

## 4. Estado do preflight Meta Direct

Permanece `ready=false`.

Blockers reais:

1. `graph_api_version_unverified`;
2. `permissions_unverified_or_blocking`;
3. `webhook_not_verified`;
4. `direct_ready_flag_false`.

Nenhum deles deve ser removido artificialmente.

---

## 5. Segurança preservada

Durante toda a rodada:

- `external_activation_authorized=false`;
- canonical outbound = false;
- Meta Direct enabled = false;
- Meta Direct release_mode = off;
- publishing = false;
- templates runtime = 0;
- strategy AI = false;
- nenhum side effect externo novo.

---

## 6. Próxima ação técnica segura

1. manter legado intacto;
2. preparar coleta read-only de permissões reais da Meta;
3. preparar verificação real do webhook;
4. obter Graph API version por evidência oficial/administrativa;
5. persistir provider health somente após consulta real;
6. manter `direct_ready_flag=false` até os demais itens estarem comprovados;
7. reexecutar preflight;
8. somente depois submeter o gate humano de homologação Meta Direct.

