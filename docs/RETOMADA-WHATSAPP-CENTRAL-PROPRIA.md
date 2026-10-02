# RETOMADA — Central WhatsApp Própria via Meta Cloud API

**Última atualização:** 2026-10-02  
**Status:** planejamento técnico concluído; implementação ainda não iniciada  
**Objetivo:** permitir atendimento 0975/1018 diretamente no Admin Dona Antônia via Meta Cloud API, com Supabase como verdade canônica e retirada futura do PapoAI sem big-bang.

## 1. Leia estes arquivos antes de continuar

1. `docs/superpowers/specs/2026-10-02-whatsapp-central-propria-meta-design.md`
2. `docs/superpowers/plans/2026-10-02-whatsapp-central-propria-meta.md`
3. este arquivo

Não continuar apenas pela memória de conversa.

## 2. Baseline de planejamento

- Repositório: `osvaldosereia/SUCEDOAN12`
- Main observado ao iniciar documentação: `c2ddc61715c44051ce15c389cc7df70baec548dc`
- Supabase canônico: `ssbesxgaijknwsjbsbcz`
- Branch de documentação: `docs/whatsapp-central-propria-20261002`

Se `main` avançou, rebase/merge com cuidado antes da implementação. Não presumir que paths/runtime permaneceram iguais.

## 3. Identificadores Meta confirmados

### Business

- Business Portfolio: `Super Cestas Cuiabá`
- Business ID: `1055822571753443`

### 0975

- Número: `+5565998150975`
- WABA ID: `1497253794754816`
- Phone Number ID: `945659128620084`
- Plataforma: Cloud API

### 1018

- Número: `+5565984491018`
- WABA ID: `840102181903253`
- Phone Number ID: `1218939807961094`
- Plataforma: Cloud API

### App próprio

- Nome: `cell principal`
- App ID: `1547249776748513`
- Permissões confirmadas: `whatsapp_business_management`, `whatsapp_business_messaging`

### PapoAI

- Meta App ID observado: `469378005718636`
- 0975 agentbot PapoAI: `2796`
- 1018 agentbot PapoAI: `2501`

**Nunca adicionar tokens, App Secret ou verify token neste arquivo.**

## 4. Estado atual dos apps inscritos

Na investigação de 2026-10-02:

- WABA 1018: Papo AI + `cell principal`
- WABA 0975: somente Papo AI

Portanto, a inscrição do app próprio no 0975 faz parte do Task 7, **depois** de webhook próprio estar pronto e 1018 estar estável.

## 5. Prova Meta direta já realizada

Teste controlado:

```text
1018 (Meta Cloud API própria) -> 0975
Mensagem: TESTE META DIRETO 1018
```

Resultado:

- Meta aceitou o POST e devolveu `wamid`: SIM
- mensagem chegou no 0975: SIM
- PapoAI receptor 0975 exibiu inbound: SIM
- Admin receptor 0975 exibiu inbound: SIM
- Supabase receptor registrou inbound: SIM
- PapoAI emissor 1018 exibiu o outbound próprio: NÃO
- Supabase emissor 1018 criou outbound próprio automaticamente: NÃO

**Decisão derivada:** toda mensagem enviada pelo nosso backend deve ser gravada canonicamente no Supabase no momento em que a Meta retornar o `wamid`. Não depender de `message.sent` do PapoAI para outbound próprio.

## 6. Gates atuais — devem permanecer OFF até canário

Último estado confirmado:

- `dona-antonia-0975`
  - `send_enabled=true`
  - `human_send_enabled=false`
  - `homologated_at=null`
  - `outbound_provider='papoai'`

- `dona-antonia-1018`
  - `send_enabled=true`
  - `human_send_enabled=false`
  - `homologated_at=null`
  - `outbound_provider='papoai'`

**Não liberar botão apenas mudando esses booleans.** O backend v2 ainda é PapoAI-hardcoded.

## 7. Código atual relevante

Reaproveitar:

- `vitrine/admin/atendimento/attendance-send.js`
- demais arquivos de `vitrine/admin/atendimento/`
- `supabase/functions/admin-whatsapp-ops-v1/index.ts`
- `supabase/functions/_shared/whatsapp-core-v1.mjs`
- tabelas `conversations`, `whatsapp_messages_v1`, `whatsapp_accounts`, `whatsapp_outbox_v1`, `whatsapp_channel_runtime_v1`

`whatsapp-core-v1.mjs` já contém normalizadores Meta importantes:

- `canonicalMessagesFromMeta(...)`
- `statusEventsFromMeta(...)`

RPCs atuais que NÃO devem ser o contrato final:

- `ops2_admin_attendance_enqueue_text_v2`
- `ops2_admin_attendance_claim_outbox_v2`

Eles exigem provider PapoAI. Criar v3 provider-neutral.

## 8. Legado que não deve ser reativado

Apesar de algumas funções aparecerem como `ACTIVE` no painel do Supabase, o código implantado pode estar deliberadamente aposentado e retornar HTTP 410.

Não reativar:

- `whatsapp-meta-direct-v1` — retired direct Meta transport
- `admin-whatsapp-direct-v1` — retired outside site/vitrine/admin
- `whatsapp-ingest` — legado aposentado
- `whatsapp-ingest-make-v1` — legado aposentado
- `conversation-worker-v3` — legacy AI worker retired
- `dona-antonia-agent-core-v1` — retired operator agent

**Regra:** ler o código da função, não confiar apenas no status `ACTIVE` do deploy.

## 9. IA atual

- `admin-service-intelligence-simple-v1`: útil como inteligência/copiloto do Admin
- `admin-service-intelligence-v1`: inteligência operacional/admin
- nenhum dos dois deve ser tratado como substituto direto da ANA de WhatsApp

ANA própria será uma nova camada conversacional no Task 11.

## 10. DO NOT TOUCH — isolamento do checkout

Até fase explicitamente aprovada, não modificar:

- `shopping-checkout-v2`
- `shopping-chat-checkout-v2`
- `storefront-v2`
- frontend público do checkout
- criação/registro de pedido
- confirmação de pedido
- estoque
- integração Bling do pedido

A Central não deve virar dependência síncrona do checkout.

## 11. Segurança pendente antes da implementação

Tokens temporários Meta apareceram em capturas durante a investigação.

Primeira ação operacional do Task 0:

1. revogar/invalidar tokens temporários expostos;
2. gerar token de usuário de sistema de produção;
3. armazenar somente server-side;
4. configurar App Secret e webhook verify token server-side;
5. confirmar que frontend e Git não contêm segredo.

Não copiar valor de token para documentação, chat, issue ou PR.

## 12. Próxima ação exata

**NÃO começar pelo botão Enviar.**

Executar nesta ordem:

### Próximo lote

1. criar branch/worktree de implementação a partir do `main` mais recente;
2. executar **Task 0 — Safeguard, baseline e secrets**;
3. executar **Task 1 — Outbox provider-neutral v3**;
4. parar e verificar testes/estado antes de Task 2.

Não ativar runtime/gates nesse primeiro lote.

## 13. Como retomar em outra sessão

Use este checklist:

```text
[ ] buscar main atual
[ ] ler design
[ ] ler implementation plan
[ ] ler RETOMADA
[ ] verificar se gates 0975/1018 continuam OFF
[ ] verificar se checkout está saudável
[ ] confirmar tokens temporários expostos foram revogados
[ ] criar branch/worktree isolado
[ ] executar Task 0 com testes
[ ] executar Task 1 com testes
[ ] atualizar este RETOMADA com commit SHA e resultados
[ ] atualizar issue principal
```

Ao final de cada Task, este arquivo deve ser atualizado com:

- último task concluído;
- commit SHA;
- testes executados;
- mudanças de runtime;
- riscos/pendências;
- próxima ação exata.

## 14. Rollback resumido

Enquanto PapoAI estiver em migração/sombra:

```text
1. human_send_enabled=false no canal afetado
2. parar novos claims Meta
3. preservar outbox/mensagens/logs
4. usar fallback Copiar resposta + Abrir PapoAI
5. não reenviar automaticamente eventos uncertain
6. investigar com correlation ID/wamid
```

Rollback da Central nunca deve exigir rollback do checkout.

## 15. Definição de pronto do projeto

Só considerar PapoAI dispensável quando ambos 0975 e 1018 tiverem, pelo sistema próprio:

- inbound;
- outbound humano;
- histórico canônico;
- status;
- templates;
- mídia essencial;
- takeover humano;
- ANA própria ou decisão formal de atendimento exclusivamente humano;
- observabilidade;
- token rotation;
- rollback testado.

Até lá, retirar PapoAI é proibido.
