# Customer & Marketing OS — CM-1.14 PapoAI Adapter temporário

Atualizado em 18/09/2026.

Status: **V1 IMPLANTADA — PAPOAI ISOLADO ATRÁS DE ADAPTER CANÔNICO; OUTBOUND DO ADAPTER DESLIGADO**.

## Objetivo

Manter o PapoAI como canal temporário sem permitir que Customer OS, Marketing OS, identidade, eventos ou Shopping Room dependam do formato específico de payload do fornecedor.

Arquitetura:

```text
PapoAI
  → parser do adapter
  → ingest_channel_adapter_event_v1
  → Identity Resolver
  → Normalized Event
  → Customer OS
  → consumidores downstream
```

A futura troca para Meta Direct deve exigir um novo adapter, não uma reconstrução do core.

## Estruturas

### channel_provider_adapters

Registra provider + canal + conta canônica.

PapoAI nasce com:

- status: temporary_active;
- inbound_mode: active;
- outbound_mode: disabled;
- replacement_target: meta_direct;
- business_logic_dependency: false;
- tag_read_state: unknown;
- tag_write_state: unknown.

### channel_provider_contact_states

Estado mínimo conhecido pelo provider:

- external_contact_id;
- external_user_id;
- telefone normalizado;
- nome observado;
- customer_id quando resolvido;
- channel_identity_id;
- tags quando realmente vierem no webhook;
- provider_context;
- first/last seen.

Essa tabela não substitui `customers`.

### channel_provider_event_receipts

Ledger de ingestão/idempotência do provider.

Guarda:

- provider event key;
- message/event id;
- normalized_event_id;
- conversation_id;
- customer_id;
- processing status;
- contexto técnico.

## Core canônico

`ingest_channel_adapter_event_v1` não conhece PapoAI.

Recebe campos normalizados e executa:

1. valida provider/canal/conta;
2. verifica adapter;
3. cria event key determinístico se o provider não entregar ID;
4. aplica idempotência;
5. usa `resolve_customer_identity_v1`;
6. usa `observe_customer_channel_identity_v1`;
7. encontra/cria a conversa canônica;
8. grava `normalized_channel_events`;
9. atualiza estado do contato do provider;
10. registra receipt;
11. devolve IDs canônicos.

Nenhuma IA é usada.

## Refatoração do webhook PapoAI

`papo-comprar-webhook-v1` passou a fazer somente o trabalho que pertence ao adapter:

- autenticar o webhook;
- aceitar JSON/form;
- encontrar campos possíveis do payload PapoAI;
- normalizar telefone;
- normalizar tipo da mensagem;
- detectar tags/etiquetas quando realmente presentes;
- montar o contrato canônico;
- chamar `ingest_channel_adapter_event_v1`.

Foram retiradas do Edge provider-specific as responsabilidades diretas de:

- resolver identidade;
- observar identidade;
- inserir normalized_channel_events;
- manter lógica própria de conversa.

Essas responsabilidades agora pertencem ao core canônico.

## Shopping Room

Depois que o evento já foi normalizado, o Shopping Room continua sendo iniciado para preservar o comportamento atual.

A metadata da sessão agora usa nomes neutros:

- entry_source = channel_adapter;
- provider_key;
- provider_contact_id;
- provider_contact_name;
- provider_external_user_id;
- adapter_customer_found;
- adapter_received_at;
- adapter_version.

Campos `papo_*` não são mais necessários ao downstream.

## Tags

O adapter procura tags somente em campos observáveis do webhook, como:

- tags;
- labels;
- etiquetas;
- contact.tags;
- sender.tags;
- variantes equivalentes.

Regra importante:

- não afirmamos que leitura de tags é suportada até o campo realmente aparecer;
- `tag_read_state` começa como `unknown`;
- ao observar o campo no webhook pode virar `observed_webhook`;
- `tag_write_state` continua `unknown`;
- nenhuma escrita de tag no PapoAI foi implementada sem evidência de API confiável.

Portanto o projeto continua preparado para aproveitar etiquetas sem inventar uma capacidade que ainda não foi comprovada.

## Smoke test

Foi executado um contato temporário no core canônico.

O teste confirmou:

- identity resolution: matched;
- normalized event: 1;
- receipt: 1;
- provider contact state: 1;
- tags observadas e armazenadas;
- external_side_effect=false.

Os registros de smoke foram removidos em seguida e o estado de capacidade de tags foi devolvido para `unknown`, pois uma fixture de teste não serve como evidência real de capacidade do PapoAI.

## Segurança

Todas as tabelas novas:

- RLS;
- service_role only;
- sem anon/authenticated.

O webhook continua protegido pelo token dedicado existente.

O adapter não envia mensagem, não controla consentimento, não executa campanha e não habilita Meta Direct.

## Custo

IA da CM-1.14: **zero**.

Parsing, identidade, normalização, idempotência e tags são determinísticos.

## Critério de saída

Cumprido na V1 estrutural:

- Customer OS recebe evento canônico;
- o core não conhece PapoAI;
- downstream do Shopping Room recebe metadata neutra;
- trocar o provider deixa de exigir reescrita de CRM/eventos.

## Próximo passo oficial

CM-1.15 — Central de Relacionamento.

Consolidar em uma superfície administrativa:

- visão geral;
- clientes;
- segmentos;
- oportunidades;
- produtos;
- marcas;
- Marketing Brain;
- Templates;
- Meta Foundation;
- qualidade dos dados;
- auditoria.
