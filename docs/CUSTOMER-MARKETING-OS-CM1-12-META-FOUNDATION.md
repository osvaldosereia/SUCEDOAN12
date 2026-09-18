# Customer & Marketing OS — CM-1.12 Meta Foundation

Atualizado em 18/09/2026.

Status: **V1 IMPLANTADA — CONTROL PLANE CONTRATUAL, READ-ONLY E FAIL-CLOSED**.

## Objetivo

Criar o contrato definitivo do Meta Control Plane sem depender da saída imediata do PapoAI.

A arquitetura passa a separar:

- canal canônico;
- provider atual;
- capacidade;
- saúde;
- permissões;
- políticas;
- templates;
- flows;
- webhooks;
- erros;
- readiness para conexão direta.

## Reuso

A fundação não criou um novo cadastro de canal.

Reutiliza:

- `channel_accounts` como identidade canônica do canal;
- `whatsapp_accounts` para WABA/phone number já conhecidos;
- `whatsapp_direct_templates` como biblioteca local existente;
- `experience_channel_capabilities` e capabilities do canal;
- eventos normalizados do Customer OS.

## Estruturas novas

### whatsapp_direct_template_versions

Versionamento local do template existente.

Guarda:

- versão;
- corpo;
- categoria;
- idioma;
- mídia;
- botões;
- components;
- finalidade;
- meta_status;
- meta_template_id;
- rejection reason;
- snapshot do provider.

A criação dessa estrutura prepara CM-1.13 sem submeter template à Meta.

### meta_policy_registry

Registro versionado das políticas/capacidades Meta.

Campos:

- policy_key;
- version;
- capability;
- regra;
- restrictions;
- requirements;
- fonte;
- vigência/revisão;
- status;
- fail_closed.

A tabela nasce vazia. Não inventamos política nem vigência sem fonte verificada.

### meta_account_permissions

Permissões por channel_account.

Estados:

- unknown;
- granted;
- missing;
- expired;
- revoked;
- not_applicable.

Ausência de verificação não equivale a granted.

### meta_flow_registry

Registro local dos Flows Meta:

- local_key;
- meta_flow_id;
- status;
- categoria;
- endpoint;
- versões;
- health.

### meta_provider_health_snapshots

Snapshots de saúde do provider:

- provider_state;
- graph_api_version;
- WABA;
- phone;
- phone/account quality;
- messaging limit;
- webhook state;
- template state;
- flow state;
- health score;
- errors;
- capabilities;
- permissions.

### meta_webhook_events

Envelope operacional de webhook sem criar uma segunda timeline de negócio.

Armazena:

- event_name;
- provider_event_id;
- payload_hash;
- signature_verified;
- normalized_event_id;
- processing_status;
- metadata.

### meta_control_plane_errors

Erro operacional Meta centralizado por:

- operação;
- code/subcode;
- mensagem;
- retryable;
- severity;
- request ref;
- resolução.

## Read Model

`meta_control_plane_account_v1` combina:

- channel_accounts;
- whatsapp_accounts;
- último health snapshot;
- templates;
- Flows;
- permissões.

## Readiness

`evaluate_meta_direct_readiness_v1` é fail-closed.

Para considerar conexão direta pronta para homologação exige:

- WABA;
- phone_number_id;
- Graph API version verificada;
- permissões verificadas;
- webhook verificado;
- flag explícita meta_direct_ready;
- outbound ainda desligado.

O último ponto é intencional: estar tecnicamente pronto não ativa envio.

## Estado atual observado

A conta atual possui:

- WABA conhecido;
- phone_number_id conhecido;
- provider atual: PapoAI;
- provider state do novo control plane: READ_ONLY;
- outbound direto: desligado;
- meta_direct_ready: false;
- Graph API version: não verificada;
- permissões: ainda não verificadas;
- webhook direto: ainda não verificado.

Resultado do readiness inicial: **ready=false**.

Bloqueios iniciais:

- graph_api_version_unverified;
- permissions_unverified_or_blocking;
- webhook_not_verified;
- direct_ready_flag_false.

Esse estado é o esperado para CM-1.12: contrato implantado sem ativação externa.

## Segurança

Todas as novas tabelas:

- RLS ativado;
- sem acesso anon/authenticated;
- service_role only.

Tokens, app secret e credenciais não são gravados nessas tabelas.

Segredos continuam fora da camada relacional de configuração pública.

## Side effects

CM-1.12 não:

- envia WhatsApp;
- muda provider ativo;
- publica Flow;
- submete template;
- altera consentimento;
- liga outbound;
- habilita Meta Direct.

`external_side_effect=false`.

## Próximo passo oficial

CM-1.13 — Template Draft Assistant.

Usará a biblioteca e o versionamento local implantados aqui para:

- listar;
- criar;
- editar;
- versionar;
- validar;
- associar finalidade/estratégia/criativo;
- manter DRAFT/manual inicialmente.

Submit/monitor futuro será feito pelo Meta Control Plane sem redesenhar o template.
