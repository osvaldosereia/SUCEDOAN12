# Homologação CM-1 — Meta Policy Registry + Preflight Fail-Closed V1

Atualizado em 18/09/2026.

## Objetivo

Consolidar regras oficiais do WhatsApp/Meta em um registro operacional versionado e tornar o preflight do Meta Direct estritamente fail-closed, sem ativar outbound, publishing, templates ou qualquer outro efeito externo.

## Escopo desta rodada

Esta rodada é somente de conhecimento operacional de políticas, verificação técnica, endurecimento preventivo, readiness read-only e documentação.

Ela **não autoriza** Meta Direct, outbound, publicação, campanha, submissão de template, alteração de consentimento, aumento de canary ou ativação externa.

`external_activation_authorized=false` permanece obrigatório.

## Meta Policy Registry

Migration:

`supabase/migrations/20260919071000_cm_1_meta_policy_registry_verified_v1.sql`

Foram cadastradas oito políticas operacionais fail-closed:

1. `whatsapp_opt_in_required`;
2. `whatsapp_opt_out_required`;
3. `whatsapp_business_initiated_template_required`;
4. `whatsapp_customer_service_window_24h`;
5. `whatsapp_automation_human_escalation`;
6. `whatsapp_data_privacy_sensitive_identifiers`;
7. `whatsapp_commerce_policy_required`;
8. `whatsapp_regulated_verticals_fail_closed`.

Fonte oficial registrada:

`https://business.whatsapp.com/policy`

Regras modeladas incluem opt-in antes de contato proativo, respeito ao opt-out, template aprovado para conversa iniciada pela empresa, janela de atendimento de 24 horas, escalonamento humano em automações, proteção de dados, conformidade de comércio e fail-closed para verticais reguladas quando a elegibilidade não estiver comprovada.

## Readiness do Policy Registry

Função:

`public.meta_policy_registry_readiness_v1()`

Contrato:

- service-role only;
- nenhum side effect;
- exige 8/8 políticas;
- exige fonte;
- exige `fail_closed=true`;
- considera revisão stale após 30 dias;
- nunca autoriza ativação externa.

Snapshot após implantação:

- ready: true;
- required: 8;
- active required: 8;
- missing: 0;
- stale: 0;
- sem fonte: 0;
- não fail-closed: 0;
- `external_side_effect=false`;
- `external_activation_authorized=false`.

ACL verificada:

- anon execute: false;
- authenticated execute: false;
- service_role execute: true;
- anon select na tabela: false;
- authenticated select: false;
- service_role select: true.

## Gate humano

O fato de o Policy Registry estar tecnicamente pronto **não altera automaticamente** o gate:

`meta_policy_registry_verification=pending`

A validação técnica e a aceitação humana são etapas separadas.

## Meta Direct — estado observado

Conta canônica:

- WABA presente;
- Phone Number ID presente;
- inbound canônico: true;
- outbound canônico: false;
- AI: false;
- auto reply: false;
- canary: 0%;
- `meta_direct_ready=false`.

Configuração:

- `whatsapp_direct_config.enabled=false`;
- `release_mode=off`.

Readiness:

`public.evaluate_meta_direct_readiness_v1(channel_account_id)`

Resultado:

- ready: false;
- mode: READ_ONLY;
- WABA: true;
- Phone Number ID: true;
- outbound fail-closed: true;
- Graph API version: não verificada;
- permissões: não verificadas;
- webhook: não homologado;
- direct-ready flag: false.

Bloqueios atuais:

1. `graph_api_version_unverified`;
2. `permissions_unverified_or_blocking`;
3. `webhook_not_verified`;
4. `direct_ready_flag_false`.

Nenhum desses bloqueios deve ser removido por inferência.

## Hardening da Graph API

Foi detectado que duas Edge Functions possuíam fallback local para `v26.0`. Isso poderia mascarar uma configuração não verificada em uma futura homologação.

### `whatsapp-meta-direct-v1`

- fallback removido;
- `META_GRAPH_VERSION` precisa existir;
- formato obrigatório: `vN.N`;
- sem versão válida, readiness não é declarado;
- sem versão válida, caminho POST retorna `meta_graph_version_unverified`;
- assinatura HMAC continua obrigatória;
- gate `enabled/release_mode` continua obrigatório;
- nenhum outbound foi aberto.

Deploy:

- version 2;
- `verify_jwt=false` preservado porque é endpoint de webhook;
- validação de assinatura HMAC continua protegendo POST.

### `admin-whatsapp-direct-v1`

- fallback removido;
- dashboard só declara conjunto seguro quando a versão Graph é explícita e válida;
- sincronização de templates falha fechado com `meta_graph_version_unverified`;
- `secureReady()` agora exige versão Graph;
- ativação continua owner-only e depende de credenciais/gates.

Deploy:

- version 4;
- `verify_jwt=true`.

## Graph API — regra de evidência

Nesta rodada não foi possível validar documentalmente uma versão corrente específica da Graph API com confiança suficiente.

Portanto:

- banco canônico permanece com `graph_api_version=null`;
- nenhuma versão foi inferida pelo código;
- nenhuma versão foi persistida apenas porque existia fallback;
- o blocker permanece ativo.

A versão só deve ser registrada quando houver evidência oficial ou administrativa verificável.

## Permissões Meta

`meta_account_permissions` continua sem evidência real suficiente.

Não criar linhas artificiais `granted`.

O readiness exige pelo menos uma permissão observada e nenhuma permissão bloqueadora.

## Webhook

O código possui verificação de challenge, assinatura `x-hub-signature-256` para POST, HMAC com App Secret e hard gate de `whatsapp_direct_config`.

Porém o Control Plane ainda não tem evidência runtime de webhook homologado, portanto `webhook_ready=false` permanece correto.

## Testes / contratos

Criados:

- `scripts/test-cm-1-meta-policy-registry-v1.mjs`;
- `scripts/test-cm-1-meta-direct-graph-version-gate.mjs`.

As mesmas asserções foram reproduzidas contra o HEAD após os deploys e passaram: oito políticas presentes, fonte oficial, fail-closed, nenhuma abertura de gate na migration, nenhum fallback de Graph API, bloqueio de versão não verificada, assinatura HMAC preservada, release OFF preservado e owner gate do Admin preservado.

Isso é validação de contrato equivalente; não deve ser descrito como workflow CI executado.

## Auditoria pós-DDL

Supabase Advisors foram executados.

Não foi identificada regressão específica causada pelo Policy Registry. Persistem avisos preexistentes do projeto, principalmente RLS enabled/no policy em tabelas server-only, índices não utilizados e alguns índices duplicados.

Não corrigir avisos globais fora do escopo desta homologação sem rodada própria.

## Estado final da rodada

CM-1 continua:

- 20 critérios;
- 14 verified;
- 6 implemented;
- 0 blocked;
- internal homologation liberada;
- `cm1_complete=false`;
- `external_activation_authorized=false`;
- Meta Direct OFF;
- outbound OFF;
- publishing OFF;
- templates runtime OFF;
- AI strategy OFF.

O Policy Registry está tecnicamente preparado, mas os gates humanos e o preflight do Meta Direct continuam separados e fechados.


## Central de Relacionamento — visibilidade do preflight

Também foi concluída a exposição read-only do preflight na aba **Meta Foundation**.

Migration:

`supabase/migrations/20260919072000_cm_1_meta_policy_command_center_v1.sql`

`relationship_command_summary_v1()` passou para `cm1.15-v2` e agora inclui:

- `meta_policy_registry`;
- `meta_direct_readiness`.

A interface agora mostra:

- Policy Registry 8/8;
- políticas stale/sem fonte;
- fail-closed;
- status Meta Direct;
- lista legível dos blockers;
- aviso explícito de que a tela não ativa nada.

Cache da Central:

`20260918-5`

Segurança verificada:

- `relationship_command_summary_v1()` permanece service-role only;
- anon execute=false;
- authenticated execute=false;
- service_role execute=true;
- `external_side_effect=false`;
- não existe alteração de `outbound_enabled`, `release_mode` ou autorização externa nesta migration.

A validação de contrato da Central passou integralmente.
