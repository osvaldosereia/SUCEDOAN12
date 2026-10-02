# Central de Atendimento v2 — Fase 1 Base do Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a base confiável da Central v2: uma única fila com troca 0975/1018, ordenação pela última mensagem real, timeline fiel, mídias/localização utilizáveis e preparação segura para capturar outbound do PapoAI.

**Architecture:** Manter `admin-whatsapp-ops-v1` como gateway autenticado do Admin e `papo-external-agent-v1` como entrada do PapoAI. A fila passa a derivar recência apenas de `whatsapp_messages_v1`; mídia do PapoAI é normalizada sem expor URL assinada no browser e materializada sob demanda em storage privado por até 30 dias. Outbound fica atrás de gate até existir payload real homologado de `Mensagem enviada`.

**Tech Stack:** Supabase Postgres/RPC, Supabase Edge Functions (Deno/TypeScript), Supabase Storage privado, JavaScript/HTML/CSS do Vitrine Admin, Node.js `assert` para testes contratuais.

**Spec:** `docs/superpowers/specs/2026-10-02-vitrine-atendimento-central-v2-design.md`

## Global Constraints

- Não usar Make.
- Não expor service role, token PapoAI ou URL secreta no navegador.
- Não liberar `send_text`, `takeover` ou `release` nesta fase.
- Não usar `conversations.updated_at` para ordenar a fila.
- Não elevar conversa por `unread`, `human_required` ou modo humano.
- 0975 e 1018 nunca podem misturar conversas.
- Mídia privada: retenção padrão de 30 dias; metadata textual permanece.
- Não fazer backfill de mídia antiga cuja URL do provedor já expirou.
- Não inferir autoria outbound sem campo confiável no payload.
- O fallback de resposta continua `Copiar resposta` + `Abrir PapoAI`.

## Review Focus

1. Mesmo telefone presente nos dois canais deve continuar isolado por `whatsapp_account_id`; teste de fila e timeline deve provar que 0975 nunca retorna conversa/mensagem do 1018.
2. URL assinada do PapoAI expirada ou host diferente da allowlist deve produzir fallback de mídia indisponível, nunca quebrar a conversa nem ser repassada ao browser.
3. Payload PapoAI com `event` como objeto (`event.type`) e como string deve normalizar `message.received` da mesma forma.
4. Webhook repetido com o mesmo evento/mensagem deve permanecer idempotente e não duplicar `whatsapp_messages_v1` nem asset de mídia.
5. Desktop/tablet/mobile não podem criar scroll horizontal escondido nem perder a conversa aberta durante refresh de 15 s.

---

### Task 1: Sincronizar a implementação ativa do bridge PapoAI para o repositório

**Files:**
- Modify: `supabase/functions/papo-external-agent-v1/index.ts`
- Create: `supabase/functions/_shared/whatsapp-core-v1.mjs`
- Test: `scripts/test-papoai-canonical-baseline-v1.mjs`

**Interfaces:**
- Consumes: função ativa `papo-external-agent-v1` em produção e seu `_shared/whatsapp-core-v1.mjs`.
- Produces: baseline versionado no GitHub com `mirrorCanonicalPapoAi(...)` e `canonicalMessageFromPapoAi(payload, context)` iguais ao runtime antes do bugfix.

- [ ] **Step 1: Escrever o teste de paridade de estrutura**

Criar `scripts/test-papoai-canonical-baseline-v1.mjs` exigindo:

```js
assert.ok(fs.existsSync('supabase/functions/_shared/whatsapp-core-v1.mjs'));
assert.match(edge,/canonicalMessageFromPapoAi/);
assert.match(edge,/mirrorCanonicalPapoAi/);
assert.match(edge,/whatsapp_ingest_event_v1/);
```

- [ ] **Step 2: Rodar e verificar RED**

Run: `node scripts/test-papoai-canonical-baseline-v1.mjs`

Expected: FAIL porque `_shared/whatsapp-core-v1.mjs` ainda não existe na `main` e o bridge versionado está atrás do runtime.

- [ ] **Step 3: Copiar exatamente o código ativo para os dois arquivos, sem mudança comportamental**

Usar a versão ativa do Supabase como fonte, preservando redaction, autorização, `customer_flow_v1`, normalização legada e mirror canônico.

- [ ] **Step 4: Rodar e verificar GREEN**

Run: `node scripts/test-papoai-canonical-baseline-v1.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/papo-external-agent-v1/index.ts supabase/functions/_shared/whatsapp-core-v1.mjs scripts/test-papoai-canonical-baseline-v1.mjs
git commit -m "chore: version canonical PapoAI bridge baseline"
```

### Task 2: Corrigir normalização inbound e preservar metadata útil de mídia/localização

**Files:**
- Modify: `supabase/functions/_shared/whatsapp-core-v1.mjs`
- Modify: `supabase/functions/papo-external-agent-v1/index.ts`
- Create: `scripts/test-papoai-canonical-message-v1.mjs`

**Interfaces:**
- Consumes: `canonicalMessageFromPapoAi(payload, context)` da Task 1.
- Produces: mensagem canônica inbound com `message_type`, `text_body`, `received_at` e `metadata.media`/`metadata.location`, sem URL assinada do provedor na resposta canônica.

- [ ] **Step 1: Escrever testes RED para `event.type`, texto e mídia**

Cobrir fixtures sintéticas/redigidas para:

```js
assert.equal(canonicalMessageFromPapoAi({event:{type:'message.received'},data:{message:{...}}},ctx)?.event_type,'message.received');
assert.equal(image.message.message_type,'image');
assert.equal(audio.message.message_type,'audio');
assert.equal(document.message.message_type,'document');
assert.equal(location.message.message_type,'location');
assert.equal(location.message.metadata.location.latitude,-15.60);
assert.equal('provider_media_url' in image.message.metadata,false);
```

Também testar `event:'message.received'` para compatibilidade.

- [ ] **Step 2: Rodar e verificar RED**

Run: `node scripts/test-papoai-canonical-message-v1.mjs`

Expected: FAIL no caso `event` objeto e/ou nos descriptors de mídia/localização.

- [ ] **Step 3: Implementar normalização mínima**

Em `canonicalMessageFromPapoAi`:

- resolver evento por `root.event.type` quando `root.event` for objeto;
- manter aliases escalares existentes;
- mapear `mimetype/type` para `text|image|audio|document|location|unknown`;
- guardar em `metadata.media` apenas `kind`, `mime_type`, `filename`, `has_provider_url`;
- parsear `description` JSON com `latitude/longitude` para `metadata.location`;
- nunca copiar `media_url` assinado para a mensagem canônica/browser;
- preservar `legacy_capture_id` no mirror para resolução server-side posterior.

- [ ] **Step 4: Rodar testes**

Run: `node scripts/test-papoai-canonical-message-v1.mjs && node scripts/test-papoai-canonical-baseline-v1.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/whatsapp-core-v1.mjs supabase/functions/papo-external-agent-v1/index.ts scripts/test-papoai-canonical-message-v1.mjs
git commit -m "fix: normalize PapoAI inbound media events"
```

### Task 3: Criar fila v2 estritamente cronológica por última mensagem canônica

**Files:**
- Create: `supabase/sql/20261002_admin_attendance_v2_phase1_queue.sql`
- Modify: `supabase/functions/admin-whatsapp-ops-v1/index.ts`
- Create: `scripts/test-admin-attendance-queue-v2.mjs`
- Modify: `scripts/test-admin-attendance-api-v1.mjs`

**Interfaces:**
- Consumes: `whatsapp_messages_v1`, `conversations`, `attendance_conversation_state_v1`.
- Produces: `public.ops2_admin_attendance_queue_v2(p_whatsapp_account_id uuid, p_limit integer default 50, p_search text default null) -> jsonb`.

Fila v2 retorna por item: `conversation_id`, `whatsapp_account_id`, `customer_id`, `display_name`, `phone_e164`, `unread_count`, `last_message_text`, `last_message_type`, `last_message_direction`, `last_message_at`, `has_order`, `registration_incomplete`, `follow_up_at`.

- [ ] **Step 1: Escrever testes RED do contrato SQL/API**

Asserts obrigatórios:

```js
assert.match(sql,/ops2_admin_attendance_queue_v2/);
assert.doesNotMatch(sql,/conversations\.updated_at|c\.updated_at/i);
assert.match(sql,/order by[\s\S]*last_message_at\s+desc/i);
assert.doesNotMatch(sql,/unread_count>0[\s\S]*order by/i);
assert.doesNotMatch(api,/p_filter/);
```

Adicionar teste explícito de escopo por `whatsapp_account_id` e desempate estável por `conversation_id`.

- [ ] **Step 2: Rodar e verificar RED**

Run: `node scripts/test-admin-attendance-queue-v2.mjs`

Expected: FAIL porque RPC v2 não existe e gateway ainda chama v1 com `filter`.

- [ ] **Step 3: Implementar `ops2_admin_attendance_queue_v2`**

Recência = `coalesce(last canonical message timestamp, conversations.created_at)`; `last_inbound_at`/`last_outbound_at` podem continuar sendo devolvidos como metadata, mas não podem vencer uma mensagem canônica mais antiga apenas por atualização administrativa/bridge.

Revogar execução de `public`, `anon`, `authenticated`; conceder somente a `service_role`.

- [ ] **Step 4: Trocar gateway para v2**

`GET action=queue` aceita somente `account_id`, `limit`, `search`; remover passagem de `filter`.

- [ ] **Step 5: Rodar testes**

Run: `node scripts/test-admin-attendance-queue-v2.mjs && node scripts/test-admin-attendance-api-v1.mjs && node scripts/test-admin-attendance-sql-v1.mjs`

Expected: PASS, atualizando o teste v1 apenas onde o contrato mudou intencionalmente.

- [ ] **Step 6: Commit**

```bash
git add supabase/sql/20261002_admin_attendance_v2_phase1_queue.sql supabase/functions/admin-whatsapp-ops-v1/index.ts scripts/test-admin-attendance-queue-v2.mjs scripts/test-admin-attendance-api-v1.mjs scripts/test-admin-attendance-sql-v1.mjs
git commit -m "feat: order attendance queue by canonical messages"
```

### Task 4: Substituir duas filas por uma fila com seletor 0975/1018

**Files:**
- Modify: `vitrine/admin/atendimento/index.html`
- Modify: `vitrine/admin/atendimento/attendance.css`
- Modify: `vitrine/admin/atendimento/attendance.js`
- Modify: `scripts/test-admin-attendance-ui-v1.mjs`
- Modify: `scripts/test-admin-attendance-realtime-v1.mjs`

**Interfaces:**
- Consumes: `GET queue` da Task 3 e `accounts` atual.
- Produces: `state.activeChannel: '0975'|'1018'`, uma única `#queueList` e botões `[data-channel-switch="0975"]`, `[data-channel-switch="1018"]`.

- [ ] **Step 1: Atualizar testes para o layout v2 e rodar RED**

Exigir:

```js
assert.match(html,/data-channel-switch="0975"/);
assert.match(html,/data-channel-switch="1018"/);
assert.match(html,/id="queueList"/);
assert.doesNotMatch(html,/data-filter="unread"|data-filter="human"/);
assert.doesNotMatch(js,/Promise\.all\(\[loadQueue\('0975'\),loadQueue\('1018'\)\]\)/);
```

Também exigir `state.activeChannel`, `fmtQueueStamp` e ausência de dependência de scroll horizontal para a coluna.

- [ ] **Step 2: Rodar e verificar RED**

Run: `node scripts/test-admin-attendance-ui-v1.mjs`

Expected: FAIL porque ainda existem duas colunas/filtros.

- [ ] **Step 3: Implementar HTML/CSS de três áreas**

Desktop: `fila | conversa | contexto`.

Fila:

- dois botões grandes no topo;
- busca;
- placeholder futuro para etiquetas, sem implementar CRUD nesta fase;
- uma lista vertical.

Tablet/mobile mantêm drawer/contexto e botão de voltar.

- [ ] **Step 4: Implementar estado de canal único**

`loadQueue()` usa `state.activeChannel`; troca de canal limpa seleção/conversa exibida e carrega apenas a conta escolhida. Refresh de 15 s atualiza só a fila ativa + conversa selecionada.

- [ ] **Step 5: Rodar testes de UI/refresh/sintaxe**

Run: `node scripts/test-admin-attendance-ui-v1.mjs && node scripts/test-admin-attendance-realtime-v1.mjs && node --check vitrine/admin/atendimento/attendance.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add vitrine/admin/atendimento/index.html vitrine/admin/atendimento/attendance.css vitrine/admin/atendimento/attendance.js scripts/test-admin-attendance-ui-v1.mjs scripts/test-admin-attendance-realtime-v1.mjs
git commit -m "feat: use single WhatsApp-style attendance queue"
```

### Task 5: Criar cache privado de mídia sob demanda

**Files:**
- Create: `supabase/sql/20261002_admin_attendance_media_cache_v1.sql`
- Modify: `supabase/functions/admin-whatsapp-ops-v1/index.ts`
- Create: `scripts/test-admin-attendance-media-api-v1.mjs`

**Interfaces:**
- Consumes: `whatsapp_messages_v1.metadata.legacy_capture_id` e `papoai_webhook_inbox_v2.payload`.
- Produces: `GET action=media&message_id=<uuid>` retornando `{ok,url,mime_type,filename,expires_at}` com URL assinada curta do storage privado.

Criar `attendance_media_cache_v1`:

- `message_id uuid primary key`;
- `object_path text not null`;
- `mime_type text`;
- `filename text`;
- `cached_at timestamptz not null`;
- `expires_at timestamptz not null`.

Bucket privado: `attendance-media-v1`. Retenção padrão controlada por constante backend `MEDIA_RETENTION_DAYS=30`; URL interna assinada por 10 minutos.

- [ ] **Step 1: Escrever teste RED de segurança/contrato**

Exigir:

```js
assert.match(api,/"media"/);
assert.match(api,/attendance-media-v1/);
assert.match(api,/MEDIA_RETENTION_DAYS\s*=\s*30/);
assert.match(api,/storageserver\.bkpppai\.me/);
assert.doesNotMatch(api,/return[^\n]*media_url/i);
```

SQL deve ter RLS, revokes de `public/anon/authenticated` e acesso somente `service_role`.

- [ ] **Step 2: Rodar e verificar RED**

Run: `node scripts/test-admin-attendance-media-api-v1.mjs`

Expected: FAIL.

- [ ] **Step 3: Implementar migration do cache/bucket privado**

Não criar cron. Limpeza de cache expirado será oportunística no endpoint de mídia; metadata da mensagem continua mesmo após apagar objeto.

- [ ] **Step 4: Implementar `GET media`**

Fluxo:

1. validar admin;
2. validar `message_id`;
3. carregar mensagem e `legacy_capture_id`;
4. se cache válido, gerar signed URL de 10 min;
5. senão ler payload do inbox server-side;
6. extrair `media_url`, validar protocolo HTTPS e hostname allowlist `storageserver.bkpppai.me`;
7. baixar com limite de 20 MiB e MIME permitido;
8. salvar em bucket privado;
9. upsert do cache com `expires_at = now()+30 days`;
10. retornar somente signed URL interna.

- [ ] **Step 5: Rodar testes**

Run: `node scripts/test-admin-attendance-media-api-v1.mjs && node scripts/test-admin-attendance-api-v1.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/sql/20261002_admin_attendance_media_cache_v1.sql supabase/functions/admin-whatsapp-ops-v1/index.ts scripts/test-admin-attendance-media-api-v1.mjs
git commit -m "feat: add private attendance media cache"
```

### Task 6: Renderizar imagem, áudio, documento e localização na timeline

**Files:**
- Modify: `vitrine/admin/atendimento/attendance.js`
- Modify: `vitrine/admin/atendimento/attendance.css`
- Create: `scripts/test-admin-attendance-media-ui-v1.mjs`
- Modify: `scripts/test-admin-attendance-ui-v1.mjs`

**Interfaces:**
- Consumes: mensagens com `message_type`, `metadata.media`, `metadata.location` e `GET media` da Task 5.
- Produces: `renderMediaMessage(msg)`, `renderLocationMessage(msg)`, `resolveMedia(messageId)` no cliente.

- [ ] **Step 1: Escrever testes RED**

Exigir no JS/DOM:

- `<img>` para `image` após resolver mídia;
- `<audio controls>` para `audio`;
- link/botão de arquivo com filename para `document`;
- card com latitude/longitude e link de mapa para `location`;
- fallback `Mídia indisponível` quando `GET media` falhar;
- `window.open`/href de mapa gerado apenas de coordenadas numéricas válidas.

- [ ] **Step 2: Rodar e verificar RED**

Run: `node scripts/test-admin-attendance-media-ui-v1.mjs`

Expected: FAIL porque `renderMessage` ainda mostra placeholders.

- [ ] **Step 3: Implementar renderização**

Texto continua simples. Para imagem/áudio/documento, chamar `resolveMedia` de forma assíncrona apenas para mensagens da página atual (máx. 30). Localização não chama media API.

Imagem abre viewer simples/modal; documento usa `download` apenas quando compatível e sempre oferece `Abrir`; áudio usa player nativo.

- [ ] **Step 4: Garantir scroll e refresh**

Carregamento assíncrono de mídia não pode mudar conversa selecionada, perder posição ao carregar mensagens antigas nem reabrir painel fechado.

- [ ] **Step 5: Rodar testes**

Run: `node scripts/test-admin-attendance-media-ui-v1.mjs && node scripts/test-admin-attendance-ui-v1.mjs && node scripts/test-admin-attendance-realtime-v1.mjs && node --check vitrine/admin/atendimento/attendance.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add vitrine/admin/atendimento/attendance.js vitrine/admin/atendimento/attendance.css scripts/test-admin-attendance-media-ui-v1.mjs scripts/test-admin-attendance-ui-v1.mjs
git commit -m "feat: render WhatsApp media in attendance timeline"
```

### Task 7: Reconciliar mensagens inbound recentes que ficaram fora do histórico

**Files:**
- Create: `supabase/sql/20261002_papoai_inbound_reconcile_v1.sql`
- Create: `scripts/test-papoai-inbound-reconcile-v1.mjs`

**Interfaces:**
- Consumes: capturas `message.received` já presentes em `papoai_webhook_inbox_v2`, metadata de conversa/canal e `whatsapp_ingest_event_v1`.
- Produces: RPC service-role-only `ops2_reconcile_papoai_inbound_v1(p_since timestamptz, p_limit integer default 500) -> jsonb`.

- [ ] **Step 1: Escrever teste RED de idempotência/segurança**

Exigir que RPC:

- processe apenas `message.received` sem `canonical_message_id`;
- use `whatsapp_ingest_event_v1` em vez de `insert` direto;
- limite lote a 500;
- não leia arquivo do servidor;
- revogue de `public/anon/authenticated` e conceda somente `service_role`.

- [ ] **Step 2: Rodar e verificar RED**

Run: `node scripts/test-papoai-inbound-reconcile-v1.mjs`

Expected: FAIL.

- [ ] **Step 3: Implementar RPC idempotente**

Extrair apenas o formato inbound já observado. Não tentar reconstruir mídia cujo provider URL expirou; persistir texto/tipo/metadata disponíveis. Registrar resultado por contagem: `processed`, `duplicates`, `skipped`, `errors`.

- [ ] **Step 4: Rodar teste**

Run: `node scripts/test-papoai-inbound-reconcile-v1.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/sql/20261002_papoai_inbound_reconcile_v1.sql scripts/test-papoai-inbound-reconcile-v1.mjs
git commit -m "feat: reconcile captured PapoAI inbound messages"
```

### Task 8: Phase 1B — homologar e persistir `Mensagem enviada` sem liberar envio pelo Admin

**Status:** BLOQUEADA até obter um payload real controlado de `Mensagem enviada` do PapoAI. Tasks 1–7 podem ser lançadas sem esta task.

**Files:**
- Create after sample: `scripts/fixtures/papoai-message-sent-v1.redacted.json`
- Create: `scripts/test-papoai-outbound-canonical-v1.mjs`
- Modify: `supabase/functions/_shared/whatsapp-core-v1.mjs`
- Modify: `supabase/functions/papo-external-agent-v1/index.ts`

**Interfaces:**
- Consumes: payload real redigido de `Mensagem enviada` com canal/sessão/mensagem.
- Produces: evento canônico `direction='outbound'` em `whatsapp_messages_v1` com autoria somente se explicitamente disponível.

- [ ] **Step 1: No PapoAI, habilitar temporariamente `Mensagem enviada` apenas para captura controlada**

Esta é a única parte desta task executada fora desta janela. Não alterar `Mensagem recebida`; filtrar pelo canal de teste; não enviar mensagem nova apenas para gerar evento se não houver contato autorizado.

- [ ] **Step 2: Salvar fixture redigida e escrever teste RED**

O teste deve validar `provider_message_id`, `phone_e164`, `direction='outbound'`, `message_type`, timestamp e `whatsapp_account_id` correto. Se autoria não existir, `sender_kind` deve ser `unknown/system` conforme contrato, nunca inferido.

- [ ] **Step 3: Rodar RED**

Run: `node scripts/test-papoai-outbound-canonical-v1.mjs`

Expected: FAIL até o adapter reconhecer o payload real.

- [ ] **Step 4: Implementar adapter mínimo baseado exclusivamente na fixture observada**

Não reutilizar heurística do inbound se os campos forem diferentes. Preservar idempotência por ID externo/event key.

- [ ] **Step 5: Rodar integração**

Run: `node scripts/test-papoai-outbound-canonical-v1.mjs && node scripts/test-papoai-canonical-message-v1.mjs && node scripts/test-admin-attendance-queue-v2.mjs`

Expected: PASS e fila preparada para mover conversa pelo outbound persistido.

- [ ] **Step 6: Commit**

```bash
git add scripts/fixtures/papoai-message-sent-v1.redacted.json scripts/test-papoai-outbound-canonical-v1.mjs supabase/functions/_shared/whatsapp-core-v1.mjs supabase/functions/papo-external-agent-v1/index.ts
git commit -m "feat: ingest PapoAI outbound messages canonically"
```

### Task 9: Verificação integrada e implantação segura da Fase 1A

**Files:**
- Verify only; no new production file unless a failing regression requires a targeted fix.

**Interfaces:**
- Consumes: Tasks 1–7.
- Produces: branch pronta para PR, migrations aplicáveis e Edge Functions prontas para deploy.

- [ ] **Step 1: Rodar suíte completa da Central**

Run:

```bash
node scripts/test-papoai-canonical-baseline-v1.mjs
node scripts/test-papoai-canonical-message-v1.mjs
node scripts/test-admin-attendance-sql-v1.mjs
node scripts/test-admin-attendance-queue-v2.mjs
node scripts/test-admin-attendance-api-v1.mjs
node scripts/test-admin-attendance-ui-v1.mjs
node scripts/test-admin-attendance-realtime-v1.mjs
node scripts/test-admin-attendance-media-api-v1.mjs
node scripts/test-admin-attendance-media-ui-v1.mjs
node scripts/test-papoai-inbound-reconcile-v1.mjs
node scripts/test-admin-attendance-integration-v1.mjs
node --check vitrine/admin/atendimento/attendance.js
```

Expected: todos PASS.

- [ ] **Step 2: Confirmar gates de segurança**

Asserts finais:

- `send_text`, `takeover`, `release` não estão em `SAFE_POST_ACTIONS`;
- `human_send_enabled=false` nos dois canais;
- nenhum webhook PapoAI secreto está em código;
- `admin-whatsapp-ops-v1` continua autenticando em `admin_users`;
- bucket de mídia é privado.

- [ ] **Step 3: Aplicar migrations na ordem**

1. `20261002_admin_attendance_v2_phase1_queue.sql`
2. `20261002_admin_attendance_media_cache_v1.sql`
3. `20261002_papoai_inbound_reconcile_v1.sql`

Executar reconciliação inbound em lotes limitados, começando por período recente, e verificar contagens antes de ampliar.

- [ ] **Step 4: Deploy Edge Functions**

Deploy:

- `papo-external-agent-v1` com parser corrigido;
- `admin-whatsapp-ops-v1` com queue v2/media.

Não alterar PapoAI outbound nesta etapa.

- [ ] **Step 5: Smoke test de produção**

Validar:

- 0975 mostra somente 0975;
- 1018 mostra somente 1018;
- trocar canal é imediato;
- conversa mais recente está no topo;
- abrir conversa não fecha no refresh;
- imagem/áudio/documento/localização recentes têm fallback funcional;
- respostas continuam somente via copiar + abrir PapoAI.

- [ ] **Step 6: Commit de correções de verificação, se houver**

Somente mudanças estritamente necessárias para regressões encontradas; repetir Step 1 após qualquer correção.

---

## Plan Decomposition After Phase 1

Não implementar os módulos abaixo dentro desta branch da Fase 1. Após a Fase 1 estar estável, criar planos independentes:

1. **Fase 2 — Organização:** etiquetas internas, editor de respostas rápidas, barra `Catálogo | Respostas | Produtos | Mais`.
2. **Fase 3 — Comercial:** seleção múltipla de produtos, quantidades, handoff para orçamento/venda e gerenciador/cache de templates.
3. **Fase 4 — Inteligência e controle:** copiloto, resumo sob demanda, produtos mencionados e gates de takeover/release da ANA.

O outbound da Task 8 é um subfluxo 1B e pode ser concluído depois do lançamento da Fase 1A sem bloquear as melhorias internas já seguras.
