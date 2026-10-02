# RETOMADA — Central WhatsApp Própria via Meta Cloud API

**Última atualização:** 2026-10-02  
**Status:** Task 0 e Task 1 programados e testados no branch; migration v3 ainda NÃO aplicada no Supabase produtivo.  
**Branch atual:** `feat/whatsapp-meta-central-task0-task1`

## 1. Leia antes de continuar

1. `docs/superpowers/specs/2026-10-02-whatsapp-central-propria-meta-design.md`
2. `docs/superpowers/plans/2026-10-02-whatsapp-central-propria-meta.md`
3. `docs/runbooks/whatsapp-meta-central-runbook.md`
4. `docs/checklists/whatsapp-meta-preflight.md`
5. este arquivo

Não continuar apenas pela memória da conversa.

## 2. Objetivo

Permitir atendimento dos canais 0975/1018 diretamente no Admin Dona Antônia pela Meta Cloud API, com Supabase como verdade canônica, migração gradual, rollback por canal e retirada do PapoAI somente no final.

## 3. Identificadores confirmados — não secretos

### Business

- Business Portfolio: `Super Cestas Cuiabá`
- Business ID: `1055822571753443`

### 0975

- Número: `+5565998150975`
- WABA ID: `1497253794754816`
- Phone Number ID: `945659128620084`
- PapoAI agentbot: `2796`

### 1018

- Número: `+5565984491018`
- WABA ID: `840102181903253`
- Phone Number ID: `1218939807961094`
- PapoAI agentbot: `2501`

### App próprio

- Nome: `cell principal`
- App ID: `1547249776748513`
- Permissões confirmadas: `whatsapp_business_management`, `whatsapp_business_messaging`

**Nunca adicionar access token, App Secret ou verify token a este arquivo, issue, PR ou frontend.**

## 4. Prova Meta direta já realizada

Teste controlado anterior:

```text
1018 (Meta Cloud API própria) -> 0975
Mensagem: TESTE META DIRETO 1018
```

Resultado:

- Meta aceitou e retornou `wamid`: SIM
- chegou no 0975: SIM
- PapoAI receptor 0975 exibiu inbound: SIM
- Admin/Supabase receptor exibiu inbound: SIM
- PapoAI emissor 1018 exibiu outbound próprio: NÃO
- Supabase emissor criou outbound automaticamente: NÃO

Decisão: envio próprio deverá ser persistido pelo nosso backend assim que a Meta devolver `wamid`; não depender de `message.sent` do PapoAI.

## 5. Baseline de produção observado no início do Task 0

Runtime:

| Canal | send_enabled | human_send_enabled | homologated_at | inbound_provider | outbound_provider |
| --- | --- | --- | --- | --- | --- |
| 0975 | true | false | null | papoai | papoai |
| 1018 | true | false | null | papoai | papoai |

Histórico observado:

| Canal | Direção | Contagem |
| --- | --- | ---: |
| 0975 | inbound | 1531 |
| 0975 | outbound | 146 |
| 1018 | inbound | 328 |
| 1018 | outbound | 23 |

`whatsapp_outbox_v1` com `purpose='human_attendance'`: **0 linhas**.

Constraints verificadas no banco:

- runtime outbound provider aceita `papoai`, `meta`, `disabled`;
- runtime inbound provider aceita `papoai`, `meta`;
- outbox provider aceita `papoai`, `meta`;
- portanto Task 1 não precisa alterar constraints.

## 6. Task 0 — Safeguard/baseline/secrets

**Status:** código/documentação concluídos no branch.

Arquivos:

- `scripts/test-whatsapp-meta-no-secrets-v1.mjs`
- `docs/runbooks/whatsapp-meta-central-runbook.md`
- `docs/checklists/whatsapp-meta-preflight.md`

Commits relevantes:

- `c5acc5c956207c0d903a85cd77f340cc7d0f5c50` — guard anti-segredo
- `7fcbe7f2703e27272b3a722d75fc32cf027d22a1` — runbook
- `be81dbf5896fc0799bc512e49d67eb9025e3293e` — preflight

Teste executado:

1. token sintético inserido em workspace local -> teste FALHOU como esperado;
2. token sintético removido -> teste PASSOU.

Pendência operacional antes de qualquer canário real:

- revogar tokens temporários que apareceram em capturas;
- gerar token de usuário de sistema de produção;
- armazenar token/App Secret/verify token somente server-side.

Essas ações de credencial não foram executadas por este branch.

## 7. Task 1 — Outbox provider-neutral v3

**Status:** programada e teste estático GREEN; ainda NÃO aplicada no Supabase produtivo.

Arquivos:

- `scripts/test-attendance-provider-neutral-v3.mjs`
- `supabase/sql/20261002_admin_attendance_provider_neutral_v3.sql`

Commits:

- `383e6af48c92a13d08eef7545200853d12fd6706` — teste RED
- `661fb55748db35870da85de7b40cbe3c9676581e` — migration v3

TDD observado:

- RED: teste falhou especificamente com `migration provider-neutral v3 deve existir`.
- GREEN: após criar a migration, teste passou com `OK · outbox v3 é provider-neutral, fail-closed, idempotente e preserva janela/gates.`

Contrato implementado:

- `ops2_admin_attendance_enqueue_text_v3(uuid,text,text)`
- `ops2_admin_attendance_claim_outbox_v3(uuid)`
- provider resolvido pelo `whatsapp_channel_runtime_v1.outbound_provider`;
- somente `papoai` ou `meta` são dispatcháveis;
- janela de 24h preservada;
- `human_send_enabled=true` e `homologated_at is not null` continuam obrigatórios;
- rate limit de 20/60s preservado;
- destino resolvido server-side pela conversa;
- idempotência usa namespace `attendance-v3:`;
- claim valida que provider da outbox ainda é igual ao runtime;
- claim devolve provider, `phone_number_id` e `waba_id` server-side;
- nenhuma dependência de URL PapoAI no v3;
- nenhuma criação otimista de `whatsapp_messages_v1` nesta Task.

### Ruling importante

A migration v3 **não foi aplicada em produção nesta rodada** porque o Task 1 pode ser concluído e revisado como código isolado antes de qualquer DDL externo. Os gates produtivos permanecem totalmente OFF. A aplicação da migration deve ocorrer somente após revisão do branch/PR e imediatamente antes do Task 2/integração que a consuma.

## 8. Isolamento do checkout

Nenhum destes componentes foi alterado:

- `shopping-checkout-v2`
- `shopping-chat-checkout-v2`
- `storefront-v2`
- frontend público do checkout
- criação/registro de pedido
- estoque
- Bling

## 9. Gates — continuam OFF

Não alterar ainda:

```text
0975: human_send_enabled=false, homologated_at=null, outbound_provider=papoai
1018: human_send_enabled=false, homologated_at=null, outbound_provider=papoai
```

Não liberar botão Enviar apenas mudando booleans.

## 10. Legado que não deve ser reativado

- `whatsapp-meta-direct-v1`
- `admin-whatsapp-direct-v1`
- `whatsapp-ingest`
- `whatsapp-ingest-make-v1`
- `conversation-worker-v3`
- `dona-antonia-agent-core-v1`

## 11. Próxima ação exata

1. revisar diff/PR de Task 0 + Task 1;
2. aplicar migration v3 somente após revisão;
3. iniciar **Task 2 — Adapter de envio Meta** em novo ciclo TDD;
4. ainda sem ligar gates e sem cliente real;
5. depois Task 3 — webhook Meta próprio.

## 12. Rollback resumido

Enquanto PapoAI estiver em sombra:

```text
human_send_enabled=false
-> parar novos claims
-> preservar outbox/mensagens/logs
-> fallback Copiar resposta + Abrir PapoAI
-> nunca retry cego de envio uncertain
```

Rollback da Central nunca deve exigir rollback do checkout.
