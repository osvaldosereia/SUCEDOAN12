# RETOMADA — Central WhatsApp Própria via Meta Cloud API

**Checkpoint canônico:** 2026-10-04 (Cuiabá)  
**Main deste handoff:** `483657139e5a5f1845de1ed33fb24e479cac0497`  
**Supabase canônico:** `ssbesxgaijknwsjbsbcz`  
**Issue mestre:** #630  
**Task mídia:** #649

> Este arquivo é o ponto de retomada obrigatório. Antes de programar: ler os comentários mais recentes de #630/#649, conferir a `main` corrente e auditar runtime/PRs posteriores. Trabalho paralelo no Admin é frequente; nunca assumir que este SHA continua sendo o HEAD.

## Estado executivo

- Tasks 0–8: concluídas/homologadas conforme #630.
- Task 9A — inbound mídia Meta: concluída/homologada.
- **Task 9B — outbound áudio Meta: concluída/homologada bilateralmente.**
- Task 10 — Humano × IA: concluída no escopo do plano.
- **Task 11 — ANA própria: preview autenticado concluído/homologado.**
- **Task 12 — retirada gradual do PapoAI: EM ANDAMENTO.**
- `ana_enabled=false` nos dois canais.
- `campaigns_enabled=false` nos dois canais.
- `meta_media_live_enabled=false` nos dois canais.
- PapoAI **ainda não foi removido**: permanece inbound/shadow/fallback até fechar dependências residuais e testar rollback de cutover por canal.

## Canais e runtime atual

```text
dona-antonia-0975 = +5565998150975
dona-antonia-1018 = +5565984491018
```

Nos dois canais:

```text
inbound_provider = papoai
outbound_provider = meta
capture_enabled = true
send_enabled = true
human_send_enabled = true
ana_enabled = false
campaigns_enabled = false
meta_media_live_enabled = false
meta_media_canary_enabled = true
```

Imagem é um gate independente:
- 0975: `meta_image_live_enabled=true`;
- 1018: `meta_image_live_enabled=false`;
- isso não muda o fato de `meta_media_live_enabled=false` nos dois canais.

## Task 9B — áudio Meta bilateral concluído

### 0975 → 1018

```text
canonical_message_id = e8e8d994-b9c2-4666-9012-3520d5bc715c
provider_message_id = wamid.HBgMNTU2NTg0NDkxMDE4FQIAERgUQ0U4NTgxOTA3M0Y3Q0FCMzFCNEIA
mime_type = audio/ogg
status = delivered
attempt_count = 1
last_error = NULL
```

### 1018 → 0975

```text
canonical_message_id = c82d2e29-1049-469b-992d-359e5c47daa2
provider_message_id = wamid.HBgMNTU2NTk4MTUwOTc1FQIAERgUQ0U4ODU3NThDRjk2QjdDMEU3MzEA
mime_type = audio/ogg
status = delivered
attempt_count = 1
last_error = NULL
```

Sem duplicação e sem fila problemática. O readiness global do 1018 pode continuar `ready=false` porque falta evidência de imagem; isso não invalida a homologação bilateral de áudio.

## Task 11 — ANA própria concluída no preview autenticado

A ANA usada no Admin é **nossa**, não a IA do PapoAI.

Arquitetura:
- Admin autenticado chama `admin-whatsapp-ana-preview-v1`;
- contexto e observabilidade ficam no Supabase canônico;
- chamada de modelo ocorre pela integração OpenAI própria;
- preview é dry-run e não envia nada ao cliente.

Correção de credencial:
- PR #749 mergeado;
- RED CI #430;
- GREEN CI #431 com 53 etapas verdes;
- Edge `admin-whatsapp-ana-preview-v1` publicada como v7, `verify_jwt=true`.

Homologação real autenticada:

```text
status = completed
decision = suggest
confidence = 0.83
model = gpt-6-luna
latency_ms = 4400
attempt_count = 1
last_error = NULL
provider_response_id = presente
outbox automático criado = 0
```

Gates após homologação:

```text
ana_enabled = false
campaigns_enabled = false
```

Não promover ANA automática sem novo gate explícito.

## Task 12 — auditoria de independência do PapoAI

### Inbound próprio Meta

Auditoria das últimas 24h antes deste handoff:
- 8 inbound canônicos apareceram com `provider=papoai`;
- 5/8 tinham o mesmo evento Meta capturado e normalizado, com `cross_provider_duplicate=true` e o mesmo `canonical_message_id`;
- 3/8 restantes pertenciam à mesma conversa legada isolada do 1018, contato `+551141302366`, sem cliente vinculado, com placeholder genérico do PapoAI;
- resultado objetivo: **0 inbound PapoAI sem cobertura Meta em conversa de cliente vinculada ou fora desse legado isolado**.

Mesmo com essa evidência, `inbound_provider` continua `papoai` nos dois canais. Não fazer o cutover de inbound sem fechar as dependências restantes e o rollback por canal.

## PR #751 — confirmação automática de pedido removida do PapoAI

PR #751 foi mergeado na `main`.

```text
merge commit = 483657139e5a5f1845de1ed33fb24e479cac0497
```

O que mudou:
- `admin-orders-v1` deixou de usar `PAPOAI_ORDER_TEMPLATE_WEBHOOK_*`;
- deixou de usar `PAPOAI_ORDER_WEBHOOK_TOKEN`;
- deixou de resolver provider de pedido pelo PapoAI;
- deixou de disparar sinais PapoAI no caminho da confirmação;
- passou a usar o transporte compartilhado `sendTemplateViaMeta`;
- usa os templates utilitários homologados `pedidorecebidosite0975` e `pedidorecebidosite1018`;
- preserva outbox/idempotência e auditoria detalhada do pedido;
- os parâmetros enviados ao template são número do pedido, total formatado, resumo da entrega e pagamento;
- WAMID aceito é persistido no histórico canônico e reconciliado com status Meta;
- falha Meta incerta continua fail-closed, sem retry cego.

TDD/CI:

```text
RED = Checkout Hotfix CI #182
primeiro GREEN intermediário expôs teste legado preso ao PapoAI = #184
GREEN final do PR = Checkout Hotfix CI #187
pós-merge = Checkout Hotfix CI #188 success
pós-merge = WhatsApp Meta Central CI #434 success
```

Nenhum workflow com falha foi encontrado no commit de merge auditado.

### RPC de aceite Meta de pedido

`ops2_accept_order_whatsapp_meta_v1` foi aplicada no Supabase canônico.

Garantias:
- `security definer`;
- `anon` sem EXECUTE;
- `authenticated` sem EXECUTE;
- `service_role` com EXECUTE;
- resolve/cria conversa canônica se necessário;
- grava outbound `template`/`meta` em `whatsapp_messages_v1`;
- grava WAMID na outbox do pedido;
- registra `accepted` via pipeline canônico;
- reaplica status Meta pendentes;
- aceite é atômico: falha no registro de `accepted` aborta/rollbacka a operação.

Smoke transacional:
- aceite PASS;
- idempotência PASS;
- rollback explícito PASS;
- 0 mensagens de teste persistidas;
- 0 outboxes de teste persistidas.

### Edge de pedidos em produção

`admin-orders-v1`:

```text
versão atual = v35
status = ACTIVE
verify_jwt = false
wrapper aponta para = 483657139e5a5f1845de1ed33fb24e479cac0497
```

`verify_jwt=false` é preservado porque essa função usa autenticação interna própria por chave server-side. Não alterar sem revisar o contrato.

Rollback exato conhecido:

```text
versão anterior = v34
commit importado = 5a048e09852c72bcc723fe4f62a83d9adbb8a09e
```

Se o primeiro tráfego real do v35 apresentar erro de transporte/aceite/duplicação, restaurar o wrapper de `admin-orders-v1` para esse commit antes de qualquer outra tentativa.

### Runtime de confirmação de pedidos

```text
ops2_whatsapp_order_runtime_v1.mode = live
canary_order_id = null
```

Não mudar esse runtime para `off`/`canary` sem avaliar impacto, porque isso pode suprimir confirmação de pedido real.

Pós-deploy imediato:
- nenhum novo tráfego de confirmação tinha ocorrido ainda;
- nenhum teste foi forçado para cliente real;
- outbox problemática possuía somente 1 `failed` histórico de 03/10;
- 0 `pending`/`sending`/`retry` novos;
- nenhum WAMID duplicado de `order_confirmation` encontrado.

## Próximas dependências PapoAI a auditar

A Task 12 **não está concluída**. Próxima frente:

1. localizar todas as dependências operacionais restantes do PapoAI na Central;
2. separar dependências históricas/read-only das dependências de produção;
3. priorizar ações ainda expostas no Admin, especialmente emissão de link de catálogo e qualquer fallback operacional;
4. não remover suporte de leitura a mensagens históricas `provider=papoai` antes de decidir retenção/migração;
5. revisar `admin-whatsapp-ops-v1` e RPCs `ops2_*papoai*` ainda alcançáveis pela UI/runtime;
6. preservar caminho de rollback por canal enquanto `inbound_provider=papoai`;
7. somente após zerar dependências operacionais e testar rollback, preparar promoção de `inbound_provider` para `meta` por canal, um canal de cada vez.

## Invariantes de segurança

- branch/PR isolado; nunca programar diretamente em `main`;
- TDD RED→GREEN para mudança funcional;
- CI verde e revisão antes de merge;
- WAMID é identidade externa canônica;
- timeout/estado incerto nunca recebe retry cego;
- não enviar teste a cliente real só para homologar infraestrutura;
- canários 0975↔1018 permanecem restritos quando aplicáveis;
- `meta_media_live_enabled=false` até promoção explícita;
- ANA e campanhas permanecem desligadas;
- preview ANA não pode virar outbound automático por acidente;
- não desligar PapoAI totalmente enquanto `inbound_provider=papoai` ou houver dependência operacional residual;
- preservar leitura do histórico canônico durante a retirada do legado;
- somente APIs oficiais Meta/OpenAI;
- checkpoint obrigatório em #630 e, para mídia, #649.

## Próxima ação exata para retomada

1. ler o comentário mais recente de #630;
2. conferir a `main` atual e PRs posteriores a `483657...`;
3. auditar o Supabase antes de mudar runtime;
4. confirmar `admin-orders-v1` v35 e verificar se já houve primeiro `order_confirmation` real após o deploy;
5. se houver, validar WAMID, `sent/delivered/read`, tentativa, dedupe e fila; rollback v34 se houver anomalia;
6. continuar a Task 12 removendo dependências operacionais PapoAI restantes, começando pelo catálogo/fallback da Central;
7. manter `inbound_provider=papoai`, ANA OFF, campanhas OFF e mídia global OFF até os gates correspondentes;
8. salvar novo checkpoint em #630 ao final da próxima rodada.
