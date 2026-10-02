# Central WhatsApp Própria via Meta Cloud API — Implementation Plan

> **For implementation:** Use superpowers:executing-plans. Implement in small batches with tests and verification after every task.

**Goal:** Migrar gradualmente o atendimento WhatsApp da Dona Antônia para uma integração própria com a Meta Cloud API, preservando a Central v2, mantendo Supabase como verdade canônica e retirando o PapoAI somente depois de uma migração comprovada e reversível.

**Architecture:** A Central continua chamando `admin-whatsapp-ops-v1`. O gateway passa a usar uma outbox provider-neutral e um adapter Meta próprio. Mensagens aceitas pela Meta são gravadas imediatamente no histórico canônico com o `wamid`; webhooks próprios reconciliam inbound e status. PapoAI permanece em sombra/fallback durante o canário. ANA própria é adicionada depois que o transporte humano estiver estável.

**Tech Stack:** HTML/CSS/JavaScript do Vitrine/Admin, Supabase Postgres/RPC, Supabase Edge Functions (Deno/TypeScript), Meta WhatsApp Cloud API, Node.js scripts de teste existentes no repositório, GitHub Actions conforme padrões já usados no projeto.

---

## Regras de execução

1. Nunca trabalhar direto em `main`.
2. Criar branch/worktree isolado para cada lote relevante.
3. Teste primeiro, implementação depois.
4. Uma fase só avança com evidência verificável da fase anterior.
5. Não ativar gates de produção antes do canário explícito.
6. Não armazenar access token, App Secret, verify token ou URL secreta no GitHub.
7. Não tocar no checkout público durante esta migração.
8. 1018 é o primeiro canário; 0975 só depois.
9. Não remover PapoAI das WABAs antes da fase final.
10. Se houver timeout de envio com resultado incerto, não repetir cegamente.
11. Usar `wamid` como identidade externa canônica para dedupe/reconciliação.
12. Antes de afirmar que algo funciona, rodar os testes e consultar o estado real do Supabase/logs.

## Baseline conhecido

- Repo: `osvaldosereia/SUCEDOAN12`
- Baseline de planejamento: `c2ddc61715c44051ce15c389cc7df70baec548dc`
- Supabase: `ssbesxgaijknwsjbsbcz`
- App Meta próprio: `1547249776748513`
- 0975: WABA `1497253794754816`, Phone Number ID `945659128620084`
- 1018: WABA `840102181903253`, Phone Number ID `1218939807961094`
- Gates atuais: `human_send_enabled=false`, `homologated_at=null` em ambos
- Outbound atual do Admin ainda está PapoAI-hardcoded
- Teste Meta direto 1018 -> 0975 já comprovou Graph send real

---

# Task 0 — Safeguard, baseline e secrets

**Objetivo:** começar a implementação sem deixar token exposto, sem alterar produção por acidente e com um baseline reprodutível.

### Files

- Create: `docs/runbooks/whatsapp-meta-central-runbook.md`
- Create: `docs/checklists/whatsapp-meta-preflight.md`
- Modify only if needed: `.gitignore`
- Test/Create: `scripts/test-whatsapp-meta-no-secrets-v1.mjs`

### Step 1: escrever teste de vazamento de segredo

Criar um teste que falhe se arquivos versionados contiverem padrões conhecidos de token Meta ou nomes de secrets com valor literal.

Exemplo de intenção:

```js
assert.equal(matches.length, 0, 'Meta secrets must never be committed');
```

Não colocar token real no fixture.

### Step 2: rodar teste e confirmar baseline

Run:

```bash
node scripts/test-whatsapp-meta-no-secrets-v1.mjs
```

Expected:

```text
PASS
```

Se falhar por segredo histórico atual, não apagar sem investigar; registrar arquivo e corrigir de forma segura.

### Step 3: checklist operacional de segurança

Documentar no runbook:

- revogar tokens temporários expostos durante a investigação;
- gerar token de usuário de sistema para produção;
- guardar token somente em secret store server-side;
- guardar App Secret e verify token server-side;
- confirmar permissões mínimas;
- confirmar WABA/Phone Number IDs;
- confirmar gates ainda OFF;
- confirmar fallback PapoAI funcionando;
- confirmar checkout saudável.

### Step 4: baseline de banco/read-only

Registrar sem segredos:

- runtime dos dois canais;
- counts de mensagens por canal/direction;
- status das Edge Functions relevantes;
- nenhum outbox `human_attendance` inesperado.

### Step 5: commit checkpoint

```bash
git add docs scripts

git commit -m "test: add WhatsApp Meta migration preflight"
```

**Rollback:** nenhum runtime foi alterado; basta descartar branch.

---

# Task 1 — Outbox provider-neutral v3

**Objetivo:** remover dependência PapoAI do contrato de fila sem quebrar v2.

### Files

- Create: `supabase/sql/20261002_admin_attendance_provider_neutral_v3.sql`
- Create: `scripts/test-attendance-provider-neutral-v3.mjs`
- Reference, do not mutate destructively: `supabase/sql/20261002_admin_attendance_papoai_webhook_send_v1.sql`

### Step 1: escrever testes antes da migration

Cobrir:

- conversa válida dentro de 24h cria outbox;
- destino diferente da conversa é bloqueado;
- texto vazio é bloqueado;
- texto grande é bloqueado;
- janela fechada é bloqueada;
- idempotency key repetida com mesmo conteúdo retorna duplicate;
- idempotency key repetida com conteúdo diferente retorna conflito;
- rate limit preservado;
- provider vem do runtime do canal, não de literal `papoai`;
- canal não homologado continua bloqueado.

Run:

```bash
node scripts/test-attendance-provider-neutral-v3.mjs
```

Expected antes da implementação: FAIL controlado porque RPCs v3 ainda não existem.

### Step 2: criar RPCs v3

Criar, com nomes explícitos, por exemplo:

- `ops2_admin_attendance_enqueue_text_v3(...)`
- `ops2_admin_attendance_claim_outbox_v3(...)`

Regras:

- não remover v2;
- não alterar gates existentes;
- permitir provider `meta` apenas quando runtime do canal estiver explicitamente preparado;
- retornar dados mínimos para adapter;
- manter advisory lock/idempotência;
- não carregar token da Meta no SQL.

### Step 3: aplicar migration somente em ambiente permitido

Antes de produção, revisar SQL e rodar testes estáticos.

### Step 4: repetir testes

Expected: PASS.

### Step 5: commit checkpoint

```bash
git add supabase/sql scripts

git commit -m "feat: add provider-neutral attendance outbox v3"
```

**Rollback:** gateway continua usando v2; v3 pode existir sem efeito.

---

# Task 2 — Adapter de envio Meta

**Objetivo:** encapsular Graph API em uma unidade pequena, testável e sem acesso pelo navegador.

### Files

- Create: `supabase/functions/_shared/whatsapp-meta-transport-v1.mjs`
- Create: `scripts/test-attendance-meta-send-v1.mjs`
- Create: `scripts/fixtures/meta-send-text-success.redacted.json`
- Create: `scripts/fixtures/meta-send-error.redacted.json`

### Step 1: testes unitários

Cobrir:

- monta endpoint a partir de `phone_number_id`;
- envia `messaging_product=whatsapp`;
- normaliza telefone E.164;
- inclui texto corretamente;
- sucesso exige `messages[0].id`/wamid;
- 4xx vira erro determinístico;
- 5xx/timeout vira estado retryable/uncertain conforme fase da request;
- token nunca aparece em erro/log serializado;
- não registra body sensível completo por padrão.

### Step 2: implementar adapter

Interface sugerida:

```js
await sendTextViaMeta({
  accessToken,
  phoneNumberId,
  toE164,
  text,
  graphVersion,
  correlationId,
});
```

Retorno normalizado:

```js
{
  ok: true,
  provider: 'meta',
  providerMessageId: 'wamid....'
}
```

### Step 3: configuração

- token: secret server-side;
- Graph version: configuração explícita, não espalhada em vários arquivos;
- nenhum token no frontend.

### Step 4: testes

Run:

```bash
node scripts/test-attendance-meta-send-v1.mjs
```

Expected: PASS.

### Step 5: commit checkpoint

```bash
git add supabase/functions/_shared scripts

git commit -m "feat: add Meta WhatsApp transport adapter"
```

**Rollback:** adapter ainda não é chamado por produção.

---

# Task 3 — Webhook Meta próprio

**Objetivo:** receber diretamente da Meta inbound e status com autenticação e dedupe.

### Files

- Create: `supabase/functions/whatsapp-meta-webhook-v1/index.ts`
- Create: `scripts/test-whatsapp-meta-webhook-v1.mjs`
- Create fixtures:
  - `scripts/fixtures/meta-webhook-inbound-text.redacted.json`
  - `scripts/fixtures/meta-webhook-status-sent.redacted.json`
  - `scripts/fixtures/meta-webhook-status-delivered.redacted.json`
  - `scripts/fixtures/meta-webhook-status-read.redacted.json`
  - `scripts/fixtures/meta-webhook-status-failed.redacted.json`

### Step 1: testes de challenge GET

Cobrir verify token correto/incorreto sem revelar valor.

### Step 2: testes de assinatura POST

Cobrir:

- assinatura válida;
- assinatura ausente;
- assinatura inválida;
- body alterado depois da assinatura.

### Step 3: normalização

Reusar de `supabase/functions/_shared/whatsapp-core-v1.mjs`:

- `canonicalMessagesFromMeta(payload, accountResolver)`;
- `statusEventsFromMeta(payload)`.

Não duplicar parser Meta sem necessidade.

### Step 4: resolver canal

Resolver `phone_number_id -> whatsapp_account_id` usando `whatsapp_accounts`.

Falhar fechado se Phone Number ID desconhecido.

### Step 5: persistência idempotente

- inbound por wamid;
- status por wamid + tipo/timestamp quando necessário;
- sem IA síncrona dentro do webhook;
- HTTP 200 rápido após persistência mínima válida.

### Step 6: testes

```bash
node scripts/test-whatsapp-meta-webhook-v1.mjs
```

Expected: PASS.

### Step 7: deploy sem subscription nova no 0975

Deploy da função não deve alterar subscriptions automaticamente.

### Step 8: commit checkpoint

```bash
git add supabase/functions/whatsapp-meta-webhook-v1 scripts

git commit -m "feat: add authenticated Meta WhatsApp webhook"
```

**Rollback:** retirar callback/subscription própria; PapoAI continua inscrito.

---

# Task 4 — Canonical outbound, status e dedupe

**Objetivo:** tornar Admin/Supabase a fonte correta do outbound próprio.

### Files

- Create: `supabase/sql/20261002_whatsapp_meta_canonical_outbound_v1.sql`
- Create: `scripts/test-attendance-meta-dedupe-v1.mjs`
- Potential modify: `_shared/whatsapp-core-v1.mjs` only if tests show a missing provider-neutral helper

### Step 1: teste RED

Casos:

- Graph success + wamid cria exatamente uma outbound row;
- sender kind humano é preservado;
- status webhook atualiza mesma mensagem;
- replay do mesmo status não duplica;
- PapoAI shadow com mesmo wamid não cria segunda mensagem;
- inbound com wamid diferente cria outra mensagem;
- `failed` preserva erro normalizado sem segredo.

### Step 2: função/RPC de registro de aceite

Criar operação transacional para:

- vincular outbox;
- gravar `provider_message_id=wamid`;
- `provider='meta'`;
- `direction='outbound'`;
- `sender_kind='human'` ou `ai` explícito;
- atualizar outbox.

### Step 3: reconciliação de status

Status nunca deve criar outbound fictício sem evidência; se status chegar antes da row por corrida, registrar evento pendente/reconciliar de forma segura.

### Step 4: testes PASS

```bash
node scripts/test-attendance-meta-dedupe-v1.mjs
```

### Step 5: commit

```bash
git add supabase/sql scripts supabase/functions/_shared

git commit -m "feat: canonicalize Meta outbound and status"
```

**Rollback:** dados canônicos não são apagados; desligar adapter/gate.

---

# Task 5 — Gateway e capability do Admin

**Objetivo:** fazer o botão Enviar usar Meta somente quando o canal estiver homologado.

### Files

- Modify: `supabase/functions/admin-whatsapp-ops-v1/index.ts`
- Modify: `vitrine/admin/atendimento/attendance-send.js`
- Create/Modify: `scripts/test-admin-attendance-meta-send-ui-v1.mjs`
- Create/Modify gateway tests conforme convenção existente

### Step 1: testes RED do gateway

Cobrir:

- capability OFF quando runtime não homologado;
- capability ON somente com provider `meta`, `send_enabled`, `human_send_enabled`, `homologated_at` e secret/config válidos;
- `send_text` chama v3, não v2;
- Graph success retorna accepted + wamid;
- Graph error preserva draft e exibe erro claro;
- serviço fechado retorna `service_window_closed`;
- nenhuma request sai do browser direto para Graph API.

### Step 2: implementar provider switch interno

O gateway escolhe adapter por runtime; não espalhar `if channel == 1018` pela UI.

### Step 3: UI

- botão habilita por capability;
- Enter envia / Shift+Enter quebra linha;
- loading evita duplo clique;
- sucesso limpa draft apenas após aceite seguro;
- falha mantém draft;
- fallback permanece durante migração.

### Step 4: testes

```bash
node scripts/test-admin-attendance-meta-send-ui-v1.mjs
```

Rodar também testes existentes da Central/PapoAI para evitar regressão.

### Step 5: commit

```bash
git add supabase/functions/admin-whatsapp-ops-v1 vitrine/admin/atendimento scripts

git commit -m "feat: route Admin WhatsApp send through provider adapter"
```

**Rollback:** gate OFF; fallback continua.

---

# Task 6 — Canário 1018

**Objetivo:** validar produção controlada sem afetar clientes aleatórios.

### Pré-condições

- token de produção rotacionado e seguro;
- webhook próprio validado;
- `cell principal` inscrito no 1018;
- testes 0-5 PASS;
- 1018 ainda gate OFF antes do canário;
- destino de homologação explicitamente autorizado.

### Passos

1. Capturar baseline de logs/mensagens.
2. Configurar runtime 1018 para provider `meta` mas manter `human_send_enabled=false` até o último momento.
3. Fazer dry-run/capability.
4. Ativar gate apenas do 1018.
5. Enviar uma mensagem pelo **botão do Admin** para o destino autorizado.
6. Confirmar:
   - Graph accepted/wamid;
   - outbound aparece imediatamente no Admin 1018;
   - chega ao destinatário;
   - sent/delivered/read reconciliam quando aplicável;
   - não duplica;
   - destinatário responde e inbound entra uma vez;
   - PapoAI pode continuar em sombra, mas não é usado como fonte canônica do send.
7. Repetir idempotency test sem gerar segunda mensagem.
8. Observar erros/logs.

### Critério de promoção

Somente promover 1018 para uso normal depois de uma pequena janela estável e sem duplicidade/erro de canal.

### Rollback

- `human_send_enabled=false` no 1018;
- provider/gate volta ao estado seguro;
- fallback PapoAI permanece;
- não reenviar evento uncertain.

### Commit/documentação

Atualizar runbook com evidência, sem conteúdo sensível.

---

# Task 7 — Subscription e canário 0975

**Objetivo:** tornar o 0975 equivalente ao 1018.

### Pré-condição

1018 estável.

### Passos

1. Confirmar webhook próprio operacional.
2. Inscrever `cell principal` na WABA 0975 via mecanismo oficial Meta.
3. Confirmar `subscribed_apps` mostra PapoAI + app próprio durante sombra.
4. Confirmar inbound Meta chega ao endpoint próprio sem quebrar PapoAI.
5. Aplicar provider runtime do 0975 ainda com gate OFF.
6. Repetir exatamente o protocolo de canário do Task 6.
7. Só então habilitar uso normal.

**Rollback:** desativar gate próprio; se necessário remover apenas subscription do app próprio, mantendo PapoAI.

---

# Task 8 — Templates fora da janela

**Objetivo:** permitir operação oficial fora das 24h sem texto livre indevido.

### Files

- Create: `supabase/functions/_shared/whatsapp-meta-templates-v1.mjs`
- Create: `supabase/sql/20261002_whatsapp_templates_cache_v1.sql`
- Modify: `admin-whatsapp-ops-v1`
- Modify: `vitrine/admin/atendimento/*`
- Create: `scripts/test-attendance-meta-templates-v1.mjs`

### Testes

- lista templates aprovados da WABA correta;
- não mistura 0975/1018;
- valida idioma/nome/componentes;
- texto livre bloqueado fora de 24h;
- template aprovado pode ser enviado quando permitido;
- parâmetros faltantes bloqueiam antes do Graph call;
- resposta wamid é canonicalizada.

### UI

Quando janela fechar:

- explicar motivo;
- oferecer templates aprovados;
- não induzir operador a copiar texto livre para contornar política.

---

# Task 9 — Mídia inbound/outbound

**Objetivo:** eliminar dependência do PapoAI para mídia essencial.

### Files

- Create: `supabase/functions/_shared/whatsapp-meta-media-v1.mjs`
- Extend: `whatsapp-meta-webhook-v1`
- Modify: Admin media proxy/rendering if required
- Tests: `scripts/test-attendance-meta-media-v1.mjs`

### Ordem de suporte

1. imagem;
2. áudio/voz;
3. documento;
4. vídeo;
5. localização;
6. sticker/contato conforme necessidade.

### Regras

- download server-side;
- buckets privados;
- MIME e tamanho validados;
- não confiar em URL enviada pelo cliente;
- retenção documentada;
- outbound usa Graph/media ID ou mecanismo oficial vigente;
- canonical message conserva wamid.

---

# Task 10 — Estado humano/IA

**Objetivo:** tornar o controle de atendimento explícito e independente do PapoAI.

### Files

- Create migration se necessário para constraints/audit, sem duplicar campos existentes
- Modify: `admin-whatsapp-ops-v1`
- Modify: `vitrine/admin/atendimento/*`
- Create tests: `scripts/test-attendance-human-ai-state-v1.mjs`

### Contrato

Usar campos existentes de `conversations`:

- `mode`;
- `human_takeover_at`;
- `ai_resume_at`;
- `assigned_admin_user_id`;
- `last_human_message_at`.

### Testes

- assumir => IA bloqueada;
- mensagem humana atualiza estado/audit;
- voltar IA => somente operação explícita;
- corrida IA vs humano resolve a favor do takeover;
- nenhuma resposta automática após takeover.

---

# Task 11 — ANA própria

**Objetivo:** substituir a inteligência conversacional do PapoAI somente depois do transporte estar estável.

### Files sugeridos

- Create: `supabase/functions/whatsapp-ana-worker-v1/index.ts`
- Create: `supabase/functions/_shared/ana-policy-v1.mjs`
- Create: `supabase/sql/20261002_whatsapp_ana_jobs_v1.sql`
- Create: `scripts/test-whatsapp-ana-worker-v1.mjs`

### Princípios

- nova implementação; não reativar workers HTTP 410;
- event/job assíncrono após inbound persistido;
- aborta se conversa não está `mode='ai'`;
- contexto vem do Supabase canônico;
- catálogo/estoque/preço/pedido lidos de fontes oficiais internas;
- mesma outbox Meta do humano;
- sender_kind `ai` explícito;
- no máximo uma resposta por inbound salvo regra específica;
- dedupe por inbound wamid/job key;
- limite de tamanho e chamadas;
- fallback para humano em baixa confiança/tema não suportado.

### Rollout

1. dry-run: gera sugestão sem enviar;
2. comparar com atendimento real;
3. canário em conversas autorizadas;
4. somente depois automação por canal.

### Não confundir

`admin-service-intelligence-*` continua copiloto do operador; não é a ANA do WhatsApp.

---

# Task 12 — Retirada do PapoAI

**Objetivo:** remover dependência somente quando a operação própria estiver completa.

### Gate de entrada

Ambos 0975 e 1018 devem ter:

- inbound Meta próprio estável;
- outbound humano estável;
- status;
- templates;
- mídia essencial;
- takeover humano;
- ANA própria estável ou decisão formal de operação humana;
- observabilidade;
- rollback testado.

### Passos

1. Exportar/snapshot lógico de configurações relevantes do PapoAI sem segredos.
2. Confirmar que nenhum checkout/pedido depende sincronamente dele.
3. Desativar primeiro automações PapoAI não essenciais.
4. Monitorar.
5. Remover subscription/partner apenas depois de janela segura.
6. Confirmar inbound/outbound próprio continua normal.
7. Documentar data de corte.

**Rollback:** enquanto acesso ainda existir, restaurar subscription/fallback conforme procedimento documentado.

---

# Task 13 — Cleanup, observabilidade e operação contínua

**Objetivo:** terminar com sistema simples, auditável e sustentável.

### Trabalho

- retirar RPCs v2 PapoAI-specific quando nenhum consumidor existir;
- aposentar funções PapoAI bridge quando comprovadamente sem uso;
- manter funções 410 legadas apenas até janela de segurança definida, depois remover conforme política do projeto;
- dashboard/queries de saúde por canal;
- alertas para webhook invalid signature, Graph errors, queue stuck, failed/uncertain;
- DLQ/replay seguro para inbound/status;
- rotação de token documentada;
- auditoria de RLS e privilégios;
- runbook de incidentes;
- teste mensal simples por canal, sem cliente real quando possível;
- documentação da Meta atualizada com versão Graph vigente.

### Test suite final

Rodar todos os scripts novos mais testes existentes da Central, checkout e pedidos relevantes.

No mínimo:

```bash
node scripts/test-attendance-provider-neutral-v3.mjs
node scripts/test-attendance-meta-send-v1.mjs
node scripts/test-whatsapp-meta-webhook-v1.mjs
node scripts/test-attendance-meta-dedupe-v1.mjs
node scripts/test-admin-attendance-meta-send-ui-v1.mjs
node scripts/test-attendance-meta-templates-v1.mjs
node scripts/test-attendance-meta-media-v1.mjs
node scripts/test-attendance-human-ai-state-v1.mjs
node scripts/test-whatsapp-ana-worker-v1.mjs
```

Adicionar também os testes existentes descobertos no branch no momento da execução.

Expected: todos PASS.

---

# Critérios de rollback global

Interromper promoção e voltar o gate do canal para OFF se ocorrer qualquer um:

- mensagem em canal errado;
- duplicidade real;
- perda de histórico canônico;
- Graph aceita mas nosso sistema não registra wamid;
- IA responde durante takeover humano;
- inbound deixa de aparecer;
- token/segredo aparece no frontend/log;
- efeito colateral no checkout;
- erro de status que gere retry cego;
- divergência grave entre destinatário e `wa_contact_e164`.

Rollback padrão:

```text
human_send_enabled = false
-> parar claims novos
-> preservar outbox/mensagens/logs
-> fallback Copiar resposta + Abrir PapoAI
-> investigar
-> não apagar evidências
```

---

# Checkpoints de projeto

Após cada Task:

1. atualizar `docs/RETOMADA-WHATSAPP-CENTRAL-PROPRIA.md`;
2. registrar commit SHA;
3. marcar checklist da issue principal;
4. anotar testes executados e resultado;
5. anotar se houve mudança de runtime;
6. anotar rollback disponível;
7. não depender da memória da conversa para continuar.

Esse procedimento é obrigatório justamente porque a migração pode atravessar várias sessões e dias de trabalho.
