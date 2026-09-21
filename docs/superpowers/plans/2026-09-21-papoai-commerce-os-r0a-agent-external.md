# PapoAI Commerce OS R0-A Agent External Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a fail-closed laboratory endpoint that proves PapoAI Agent External can call Dona Antônia's Supabase backend and receive a deterministic response, without invoking OpenAI, commerce, orders, campaigns, Meta Direct, or Bling.

**Architecture:** A new provider-specific Edge Function `papoai-agent-external-lab-v1` parses the PapoAI Agent External contract through a pure shared module, reuses the existing canonical adapter ingest for identity/conversation, and stores only lab state/evidence in new server-only tables. Provider capabilities are promoted only from observed evidence; all unknown features remain disabled.

**Tech Stack:** Supabase PostgreSQL, Supabase Vault, Supabase Edge Functions/Deno 2, `@supabase/supabase-js@2.112.3`, Node.js 22 tests, PGlite database tests, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-21-papoai-commerce-os-r0a-agent-external-design.md`

## Global Constraints

- Reuse `ingest_channel_adapter_event_v1`, `channel_provider_adapters`, Identity Resolver, `normalized_channel_events`, and canonical `conversations`.
- Do not modify or replace `papo-comprar-webhook-v1` in R0-A.
- OpenAI is not used in R0-A.
- No cart, basket mutation, order creation, Bling write, campaign, template send, Meta Direct activation, publishing activation, strategy AI activation, or external commercial side effect.
- PapoAI outbound stays disabled; `external_activation_authorized` remains false.
- New tables are server-only: RLS enabled, public/anon/authenticated revoked, service_role only.
- New webhook is `verify_jwt=false` only because it implements its own secret validation and is fail-closed.
- A capability remains `unknown` until real evidence exists; UI screenshots may seed only `observed_ui`.
- The laboratory database kill switch defaults to disabled.
- The lab response is deterministic and fixed; no model-generated text.
- Secrets never enter browser code, repository files, response bodies, or logs.

## Review Focus

- **Payload aliases with conflicting values:** canonical precedence must be deterministic and must never select a system/developer message as the customer message. Covered in Task 1 parser tests.
- **PapoAI retrying the same event without a stable message ID:** fallback event key must deduplicate without merging two genuinely different messages. Covered in Task 1 and Task 2 tests.
- **Lab disabled while an authenticated request arrives:** endpoint must return a safe silent/handoff response and must not call commerce/OpenAI. Covered in Task 3 tests.
- **Human pause becomes active while a request is being processed:** state must be re-read immediately before response construction. Covered in Task 3 source-contract test and Task 5 physical acceptance.
- **Capability evidence cannot prove delivery from server response alone:** `agent_external.text_reply` must not become `verified_lab` until the WhatsApp-side observation is confirmed. Covered in Task 2 state transition tests and Task 5 acceptance.

---

## File Structure

- Create `supabase/functions/_shared/papoai-agent-external-contract-v1.mjs` — pure parsing/normalization/response contract; no database or network.
- Create `scripts/test-papoai-agent-external-contract-v1.mjs` — unit tests for the shared contract.
- Create `supabase/migrations/20260921174500_papoai_agent_external_lab_core_v1.sql` — capability evidence, lab config, session/call ledger, Vault secret getter, service-role functions.
- Create `scripts/test-papoai-agent-external-lab-db-v1.mjs` — PGlite tests for fail-closed DB defaults, RLS-facing contract, idempotency, capability transitions.
- Create `supabase/functions/papoai-agent-external-lab-v1/index.ts` — external Agent lab endpoint.
- Create `scripts/test-papoai-agent-external-lab-edge-v1.mjs` — source/contract tests for the Edge Function.
- Modify `supabase/config.toml` — explicit `verify_jwt=false` entry for the custom-auth webhook.
- Modify `.github/workflows/test-admin-v3.yml` — CI path triggers, Deno check, and three new test commands.
- Create `docs/projects/papoai-commerce-os/README.md` — project boundary and architecture.
- Create `docs/projects/papoai-commerce-os/CURRENT-STATE.md` — R0-A state and gates.
- Create `docs/projects/papoai-commerce-os/R0-A-AGENT-EXTERNAL-RUNBOOK.md` — exact lab setup and physical acceptance procedure.

---

### Task 1: Pure PapoAI Agent External contract

**Files:**
- Create: `supabase/functions/_shared/papoai-agent-external-contract-v1.mjs`
- Create: `scripts/test-papoai-agent-external-contract-v1.mjs`

**Interfaces:**
- Consumes: raw decoded JSON payload and request metadata.
- Produces:
  - `normalizePhoneBR(value: unknown): string`
  - `normalizeExternalAgentPayload(body: object): { phoneE164, displayName, sessionKey, messageText, history, externalMessageId, externalEventId, messageType, providerContext }`
  - `stableProviderEventKey(input): Promise<string>`
  - `isReservedLabHandoff(messageText: string): boolean`
  - `buildLabTextResponse({text, sessionKey, correlationId}): object`
  - `buildLabHandoffResponse({text, sessionKey, correlationId, reason}): object`
  - `buildLabSilentResponse({sessionKey, correlationId, reason, pausedUntil?}): object`
  - `sanitizeOutboundText(value: unknown): string`

- [ ] **Step 1: Write the failing contract tests**

Create `scripts/test-papoai-agent-external-contract-v1.mjs` with tests equivalent to:

```js
import assert from 'node:assert/strict';
import {
  normalizePhoneBR,
  normalizeExternalAgentPayload,
  stableProviderEventKey,
  isReservedLabHandoff,
  buildLabTextResponse,
  buildLabHandoffResponse,
  buildLabSilentResponse,
  sanitizeOutboundText,
} from '../supabase/functions/_shared/papoai-agent-external-contract-v1.mjs';

assert.equal(normalizePhoneBR('(65) 98150-9750'), '+5565981509750');

const full=normalizeExternalAgentPayload({
  text:'ignorar fallback',
  messages:[
    {role:'system',content:'segredo interno'},
    {role:'assistant',content:'fala anterior'},
    {role:'user',content:'quero a cesta mini'},
  ],
  contact:{phone_number:'5565981509750',name:'Maria'},
  session:{uid:'sess-1'},
});
assert.equal(full.phoneE164,'+5565981509750');
assert.equal(full.displayName,'Maria');
assert.equal(full.sessionKey,'sess-1');
assert.equal(full.messageText,'quero a cesta mini');
assert.equal(full.history.some(m=>m.role==='system'),false);

const alias=normalizeExternalAgentPayload({
  message:'oi',
  contact:{whatsapp:'65981509750',pushName:'Joana'},
});
assert.equal(alias.phoneE164,'+5565981509750');
assert.equal(alias.sessionKey,'phone:+5565981509750');
assert.equal(alias.messageText,'oi');

assert.throws(
  ()=>normalizeExternalAgentPayload({contact:{phone:'65981509750'}}),
  /empty_message/
);
assert.throws(
  ()=>normalizeExternalAgentPayload({text:'oi',contact:{phone:'123'}}),
  /invalid_phone/
);

const k1=await stableProviderEventKey({sessionKey:'s',messageText:'oi',externalMessageId:'m-1'});
const k2=await stableProviderEventKey({sessionKey:'s',messageText:'texto diferente',externalMessageId:'m-1'});
assert.equal(k1,k2,'stable provider ID must dominate fallback content');

const f1=await stableProviderEventKey({sessionKey:'s',messageText:'oi',occurredBucket:'2026-09-21T17:30'});
const f2=await stableProviderEventKey({sessionKey:'s',messageText:'olá',occurredBucket:'2026-09-21T17:30'});
assert.notEqual(f1,f2,'different fallback messages must not collapse');

assert.equal(isReservedLabHandoff('TESTE_HANDOFF_DONA_ANTONIA'),true);
assert.equal(isReservedLabHandoff('quero falar com atendente'),false,'R0-A has no AI classifier');

assert.deepEqual(buildLabTextResponse({
  text:'Teste ok',
  sessionKey:'s1',
  correlationId:'c1',
}),{
  message:{text:'Teste ok'},
  handoff:false,
  session_id:'s1',
  correlation_id:'c1',
});

assert.equal(buildLabHandoffResponse({
  text:'Transferindo',
  sessionKey:'s1',
  correlationId:'c1',
  reason:'lab_reserved_command',
}).handoff,true);

const silent=buildLabSilentResponse({
  sessionKey:'s1',
  correlationId:'c1',
  reason:'human_active',
});
assert.equal(silent.message,null);
assert.equal(silent.silent,true);
assert.equal(silent.handoff,true);

assert.equal(
  sanitizeOutboundText('[HANDOFF] {"tool":"x"} Olá\u0000 mundo'),
  'Olá mundo'
);

console.log('PASS: PapoAI Agent External pure contract');
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
node scripts/test-papoai-agent-external-contract-v1.mjs
```

Expected: FAIL with module-not-found for `papoai-agent-external-contract-v1.mjs`.

- [ ] **Step 3: Implement the pure shared module**

Create `supabase/functions/_shared/papoai-agent-external-contract-v1.mjs` with:
- deterministic alias precedence matching the supplied integration contract;
- `messages` accepted as array, JSON string, or simple string;
- system/developer entries discarded;
- outbound/internal markers stripped;
- phone normalized to Brazilian E.164;
- session fallback `phone:<E164>`;
- SHA-256 event key using `crypto.subtle.digest`;
- reserved handoff command only for `TESTE_HANDOFF_DONA_ANTONIA`;
- no Supabase/OpenAI imports.

Implementation skeleton:

```js
const clean=(v,max=2000)=>String(v??'')
  .replace(/[\u0000-\u001f\u007f]/g,' ')
  .replace(/\s+/g,' ')
  .trim()
  .slice(0,max);

export function normalizePhoneBR(value){
  let d=String(value??'').replace(/\D/g,'');
  if(d.startsWith('00')) d=d.slice(2);
  if(d.startsWith('0')&&(d.length===11||d.length===12)) d=d.slice(1);
  if(d.length===10||d.length===11) d='55'+d;
  if(!d.startsWith('55')||(d.length!==12&&d.length!==13)) return '';
  return '+'+d;
}

export function sanitizeOutboundText(value){
  return clean(value,4000)
    .replace(/\[HANDOFF\]/gi,'')
    .replace(/\{\s*"(?:tool|function|arguments)"[\s\S]*?\}/gi,'')
    .replace(/\s+/g,' ')
    .trim();
}
```

The remaining exported functions must follow the exact signatures in the Interfaces block and satisfy all tests above.

- [ ] **Step 4: Run the contract test to verify GREEN**

Run:

```bash
node scripts/test-papoai-agent-external-contract-v1.mjs
```

Expected: `PASS: PapoAI Agent External pure contract`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/papoai-agent-external-contract-v1.mjs scripts/test-papoai-agent-external-contract-v1.mjs
git commit -m "feat: add PapoAI external agent contract"
```

---

### Task 2: Provider capability evidence and fail-closed laboratory database

**Files:**
- Create: `supabase/migrations/20260921174500_papoai_agent_external_lab_core_v1.sql`
- Create: `scripts/test-papoai-agent-external-lab-db-v1.mjs`

**Interfaces:**
- Consumes: existing `channel_provider_adapters(id, provider_key, channel, ...)`, `conversations`, and `customers`.
- Produces:
  - table `channel_provider_capability_evidence`;
  - table `channel_provider_agent_labs`;
  - table `channel_provider_agent_lab_sessions`;
  - table `channel_provider_agent_lab_calls`;
  - Vault secret `dona_antonia_papoai_agent_external_lab_key_v1`;
  - RPC `get_papoai_agent_external_lab_key_v1() -> text` service-role only;
  - RPC `set_channel_provider_capability_state_v1(uuid,text,text,text,jsonb) -> jsonb` service-role only;
  - RPC `get_papoai_agent_external_lab_config_v1(uuid) -> jsonb` service-role only;
  - RPC `set_papoai_agent_external_lab_enabled_v1(boolean) -> jsonb` service-role only.

- [ ] **Step 1: Write the failing PGlite database test**

Create `scripts/test-papoai-agent-external-lab-db-v1.mjs`. Bootstrap only the minimum parent tables/roles required, then execute the migration. Assert:

```js
const {PGlite}=require('@electric-sql/pglite');
const db=new PGlite();

await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  create table public.channel_provider_adapters(
    id uuid primary key default gen_random_uuid(),
    provider_key text not null,
    channel text not null,
    status text not null default 'temporary_active',
    inbound_mode text not null default 'active',
    outbound_mode text not null default 'disabled',
    capabilities jsonb not null default '{}'::jsonb,
    metadata jsonb not null default '{}'::jsonb
  );
  create table public.conversations(id uuid primary key default gen_random_uuid());
  create table public.customers(id uuid primary key default gen_random_uuid());
  insert into public.channel_provider_adapters(provider_key,channel)
  values('papoai','whatsapp');
`);

await db.exec(migrationWithoutVaultDoBlockForPglite);

let row=await one(`
  select enabled, fixed_response_text
  from public.channel_provider_agent_labs
  limit 1
`);
assert.equal(row.enabled,false,'lab must default disabled');
assert.match(row.fixed_response_text,/Teste Dona Antônia concluído/);

const states=await db.query(`
  select capability_key,state
  from public.channel_provider_capability_evidence
  order by capability_key
`);
const map=Object.fromEntries(states.rows.map(r=>[r.capability_key,r.state]));
assert.equal(map['agent_external.request'],'observed_ui');
assert.equal(map['agent_external.text_reply'],'unknown');
assert.equal(map['campaign.create'],'unknown');

await db.query(`
  select public.set_channel_provider_capability_state_v1(
    (select id from public.channel_provider_adapters limit 1),
    'agent_external.request',
    'verified_lab',
    'lab_http',
    '{"correlation_id":"c1"}'::jsonb
  )
`);
row=await one(`
  select state,evidence_source
  from public.channel_provider_capability_evidence
  where capability_key='agent_external.request'
`);
assert.equal(row.state,'verified_lab');
assert.equal(row.evidence_source,'lab_http');

await assert.rejects(
  ()=>db.query(`
    select public.set_channel_provider_capability_state_v1(
      (select id from public.channel_provider_adapters limit 1),
      'agent_external.text_reply',
      'verified_production',
      'lab_http',
      '{}'::jsonb
    )
  `),
  /capability_transition_not_allowed/
);

console.log('PASS: PapoAI Agent External DB core is fail-closed');
```

The test helper may strip only the Vault creation/getter block because PGlite has no Supabase Vault extension; it must still assert the migration text contains `vault.create_secret`, `vault.decrypted_secrets`, and service-role-only grants.

- [ ] **Step 2: Run the DB test to verify RED**

Run:

```bash
node scripts/test-papoai-agent-external-lab-db-v1.mjs
```

Expected: FAIL because the migration file does not exist.

- [ ] **Step 3: Implement the migration**

The migration must:

1. Create `channel_provider_capability_evidence` with:
   - unique `(adapter_id, capability_key)`;
   - state check: `unknown|observed_ui|observed_payload|verified_lab|verified_production|unsupported|manual_setup_required`;
   - `evidence_source`, `evidence jsonb`, timestamps;
   - RLS enabled and access only for service_role.

2. Create `channel_provider_agent_labs` keyed by `adapter_id` with:
   - `enabled boolean not null default false`;
   - fixed response `Teste Dona Antônia concluído. Recebi sua mensagem corretamente.`;
   - `burst_window_seconds smallint default 20`;
   - `response_timeout_seconds smallint default 20`;
   - metadata JSON;
   - RLS/service-role only.

3. Create `channel_provider_agent_lab_sessions` with:
   - adapter FK;
   - unique `(adapter_id, provider_session_key)`;
   - phone, canonical conversation/customer IDs;
   - `status active|paused|closed`;
   - `paused_until`;
   - `message_count`;
   - last correlation/message/event IDs;
   - timestamps;
   - RLS/service-role only.

4. Create `channel_provider_agent_lab_calls` with:
   - unique `correlation_id`;
   - adapter/session FKs;
   - `provider_event_key`, external IDs;
   - `request_hash`;
   - processing status `received|duplicate|normalized|responded|handoff|silent|protocol_error|internal_error`;
   - response kind;
   - HTTP status;
   - duration;
   - request/response summary JSON;
   - no raw secret/media;
   - unique `(adapter_id, provider_event_key)` for idempotency.

5. Seed provider capabilities for PapoAI. Use `observed_ui` only for `agent_external.request`; all other requested capabilities default `unknown`.

6. Create the Vault secret once:
```sql
do $$
begin
  if not exists (
    select 1 from vault.secrets
    where name='dona_antonia_papoai_agent_external_lab_key_v1'
  ) then
    perform vault.create_secret(
      replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
      'dona_antonia_papoai_agent_external_lab_key_v1',
      'Shared secret for PapoAI Agent External laboratory webhook'
    );
  end if;
end $$;
```

7. Create the service-role-only getter and capability state transition function. The transition function must reject `verified_production` directly from `unknown|observed_ui|observed_payload`; promotion to production requires current `verified_lab`.

8. Seed `channel_provider_agent_labs.enabled=false`.

- [ ] **Step 4: Run the DB test to verify GREEN**

Run:

```bash
node scripts/test-papoai-agent-external-lab-db-v1.mjs
```

Expected: `PASS: PapoAI Agent External DB core is fail-closed`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260921174500_papoai_agent_external_lab_core_v1.sql scripts/test-papoai-agent-external-lab-db-v1.mjs
git commit -m "feat: add PapoAI external agent lab core"
```

---

### Task 3: Isolated Edge Function for PapoAI Agent External

**Files:**
- Create: `supabase/functions/papoai-agent-external-lab-v1/index.ts`
- Create: `scripts/test-papoai-agent-external-lab-edge-v1.mjs`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes:
  - Task 1 shared parser/response functions;
  - Task 2 lab config/capability tables and Vault getter;
  - existing `ingest_channel_adapter_event_v1`.
- Produces:
  - HTTP POST endpoint `papoai-agent-external-lab-v1`;
  - 401 invalid secret;
  - 400 invalid JSON/message/phone;
  - 200 deterministic lab text, handoff, or silent response;
  - correlation/call ledger;
  - no external commercial side effect.

- [ ] **Step 1: Write the failing Edge Function contract test**

Create `scripts/test-papoai-agent-external-lab-edge-v1.mjs` that reads the source files and asserts:

```js
import fs from 'node:fs';
import assert from 'node:assert/strict';

const edge=fs.readFileSync('supabase/functions/papoai-agent-external-lab-v1/index.ts','utf8');
const config=fs.readFileSync('supabase/config.toml','utf8');

assert.match(edge,/papoai-agent-external-contract-v1\.mjs/);
assert.match(edge,/get_papoai_agent_external_lab_key_v1/);
assert.match(edge,/x-api-key/i);
assert.match(edge,/safeEqual/);
assert.match(edge,/crypto\.randomUUID\(\)/);
assert.match(edge,/ingest_channel_adapter_event_v1/);
assert.match(edge,/channel_provider_agent_lab_sessions/);
assert.match(edge,/channel_provider_agent_lab_calls/);
assert.match(edge,/set_channel_provider_capability_state_v1/);
assert.match(edge,/TESTE_HANDOFF_DONA_ANTONIA/);
assert.match(edge,/paused_until/);
assert.match(edge,/lab_disabled/);
assert.match(edge,/external_side_effect:false/);

assert.doesNotMatch(edge,/OPENAI_API_KEY|openai|gpt-|gemini/i);
assert.doesNotMatch(edge,/room_start_for_conversation_v1/);
assert.doesNotMatch(edge,/orders|bling_commands|marketing_campaign/i);
assert.doesNotMatch(edge,/service[_-]?role.*console|console\.log\([^)]*token/i);

assert.match(config,/\[functions\.papoai-agent-external-lab-v1\][\s\S]*verify_jwt\s*=\s*false/);

console.log('PASS: PapoAI Agent External Edge contract is isolated');
```

Also add an assertion that source re-reads session state after canonical ingest and before choosing the final response, e.g. ordering indexes:
```js
const ingestAt=edge.indexOf('ingest_channel_adapter_event_v1');
const rereadAt=edge.lastIndexOf("from('channel_provider_agent_lab_sessions')");
const respondAt=edge.lastIndexOf('return jsonResponse');
assert.ok(ingestAt>=0&&rereadAt>ingestAt&&respondAt>rereadAt);
```

- [ ] **Step 2: Run the Edge contract test to verify RED**

Run:

```bash
node scripts/test-papoai-agent-external-lab-edge-v1.mjs
```

Expected: FAIL because the Edge Function does not exist.

- [ ] **Step 3: Implement the Edge Function**

Create `supabase/functions/papoai-agent-external-lab-v1/index.ts`.

Required request sequence:

```ts
Deno.serve(async (req: Request) => {
  const started=Date.now();
  const correlationId=crypto.randomUUID();

  if(req.method!=='POST'){
    return jsonResponse({error:'method_not_allowed',correlation_id:correlationId},405);
  }

  // Parse JSON strictly: malformed JSON => 400 invalid_json.
  // Create Supabase service-role client.
  // Load Vault secret through get_papoai_agent_external_lab_key_v1.
  // Validate X-API-Key in constant time.
  // Normalize payload with normalizeExternalAgentPayload.
  // Resolve active PapoAI WhatsApp adapter and lab config.
  // If lab disabled => safe silent/handoff response, no commerce/AI.
  // Compute stable provider event key.
  // Call ingest_channel_adapter_event_v1.
  // Upsert lab session.
  // Insert call ledger with ON CONFLICT for duplicate event.
  // If duplicate, return the previously stored response summary/body contract.
  // Re-read session immediately before response choice.
  // If paused => silent response.
  // If reserved lab handoff => handoff response.
  // Otherwise => fixed lab text response.
  // Record response kind/status/duration.
  // Mark agent_external.request verified_lab only after real canonical ingest succeeds.
  // Do not mark text_reply verified_lab here; server cannot prove WhatsApp delivery.
});
```

Implementation requirements:
- pin `npm:@supabase/supabase-js@2.112.3`;
- use `X-API-Key` as the R0-A authentication mechanism;
- return `Content-Type: application/json; charset=utf-8` and `Cache-Control: no-store`;
- never log payload bodies, secrets, media base64, or tokens;
- request summary may store only message length, whether history/media/reply metadata were observed, IDs, and normalized phone/session keys;
- no intentional 20-second sleep for burst grouping; burst remains unverified until the synchronous provider behavior is observed;
- timeout guard uses the database-configured `response_timeout_seconds` only to choose a safe contingency; it does not call any AI in R0-A.

Update `supabase/config.toml`:

```toml
# PapoAI Agent External lab: public provider webhook with dedicated Vault secret checked inside the handler.
[functions.papoai-agent-external-lab-v1]
verify_jwt = false
```

- [ ] **Step 4: Run syntax and contract tests**

Run:

```bash
deno check supabase/functions/papoai-agent-external-lab-v1/index.ts
node scripts/test-papoai-agent-external-contract-v1.mjs
node scripts/test-papoai-agent-external-lab-edge-v1.mjs
```

Expected: all PASS / no Deno errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/papoai-agent-external-lab-v1/index.ts supabase/config.toml scripts/test-papoai-agent-external-lab-edge-v1.mjs
git commit -m "feat: add PapoAI external agent lab endpoint"
```

---

### Task 4: CI coverage and canonical project handoff

**Files:**
- Modify: `.github/workflows/test-admin-v3.yml`
- Create: `docs/projects/papoai-commerce-os/README.md`
- Create: `docs/projects/papoai-commerce-os/CURRENT-STATE.md`
- Create: `docs/projects/papoai-commerce-os/R0-A-AGENT-EXTERNAL-RUNBOOK.md`

**Interfaces:**
- Consumes: Tasks 1–3 files and test commands.
- Produces: CI guardrails and a canonical continuation point independent from Customer & Marketing OS.

- [ ] **Step 1: Write the failing CI contract assertions**

Extend `scripts/test-papoai-agent-external-lab-edge-v1.mjs` to load `.github/workflows/test-admin-v3.yml` and assert it contains:

```js
assert.match(ci,/supabase\/functions\/papoai-agent-external-lab-v1\/\*\*/);
assert.match(ci,/supabase\/migrations\/\*papoai_agent_external_lab\*/);
assert.match(ci,/scripts\/test-papoai-agent-external-contract-v1\.mjs/);
assert.match(ci,/scripts\/test-papoai-agent-external-lab-db-v1\.mjs/);
assert.match(ci,/scripts\/test-papoai-agent-external-lab-edge-v1\.mjs/);
assert.match(ci,/deno check supabase\/functions\/papoai-agent-external-lab-v1\/index\.ts/);
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
node scripts/test-papoai-agent-external-lab-edge-v1.mjs
```

Expected: FAIL on missing CI paths/commands.

- [ ] **Step 3: Update CI**

In both `push.paths` and `pull_request.paths`, add:
- `supabase/functions/papoai-agent-external-lab-v1/**`;
- `supabase/functions/_shared/papoai-agent-external-contract-v1.mjs`;
- `supabase/migrations/*papoai_agent_external_lab*`;
- the three new test scripts.

In `Validar sintaxe do Admin oficial`, add:
```bash
deno check supabase/functions/papoai-agent-external-lab-v1/index.ts
```

Add three explicit steps:
```yaml
- name: Validar contrato do Agente Externo PapoAI
  run: node scripts/test-papoai-agent-external-contract-v1.mjs
- name: Validar banco do laboratório Agente Externo
  run: node scripts/test-papoai-agent-external-lab-db-v1.mjs
- name: Validar isolamento do endpoint Agente Externo
  run: node scripts/test-papoai-agent-external-lab-edge-v1.mjs
```

- [ ] **Step 4: Create canonical project docs**

`docs/projects/papoai-commerce-os/README.md` must state:
- PapoAI Commerce OS is separate from Customer & Marketing OS;
- PapoAI is transport/CRM/execution;
- Supabase is commercial truth and orchestration;
- R0-A is transport-only;
- no Make dependency;
- current entrypoint docs are `README.md`, `CURRENT-STATE.md`, and the R0-A runbook.

`CURRENT-STATE.md` initial state:
- phase `r0a_lab_ready_for_deploy`;
- external effects `false`;
- lab enabled `false`;
- OpenAI `off`;
- orders/Bling/marketing `off`;
- capability states documented exactly as seeded;
- physical PapoAI evidence pending.

`R0-A-AGENT-EXTERNAL-RUNBOOK.md` must contain:
1. deploy prerequisites;
2. exact function URL shape `https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/papoai-agent-external-lab-v1`;
3. PapoAI Agent External setup fields to inspect;
4. configure POST + `X-API-Key`;
5. enable lab only immediately before the authorized physical test;
6. send a normal test message;
7. send a second message in same session;
8. send `TESTE_HANDOFF_DONA_ANTONIA`;
9. test human pause/silent;
10. disable lab after acceptance;
11. evidence promotion rules.

Do not put the actual secret value in the runbook.

- [ ] **Step 5: Run CI-local commands**

Run:

```bash
node scripts/test-papoai-agent-external-contract-v1.mjs
node scripts/test-papoai-agent-external-lab-db-v1.mjs
node scripts/test-papoai-agent-external-lab-edge-v1.mjs
deno check supabase/functions/papoai-agent-external-lab-v1/index.ts
node scripts/test-cm-1-14-papoai-adapter.mjs
```

Expected: all PASS, proving the original PapoAI adapter contract still holds.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/test-admin-v3.yml scripts/test-papoai-agent-external-lab-edge-v1.mjs docs/projects/papoai-commerce-os
git commit -m "docs: add PapoAI Commerce OS R0-A runbook"
```

---

### Task 5: Deploy dormant R0-A to Supabase and prove non-commercial behavior

**Files:**
- No new source files expected unless deployment verification reveals a defect.
- Runtime target: Supabase project `ssbesxgaijknwsjbsbcz`.

**Interfaces:**
- Consumes: committed migration and Edge Function from Tasks 2–4.
- Produces: dormant deployed function, DB structures, deployment evidence, and exact remaining human action for physical PapoAI validation.

- [ ] **Step 1: Verify current deployed state before writes**

Read:
- deployed `papo-comprar-webhook-v1`;
- list current Edge Functions;
- current `channel_provider_adapters` row for PapoAI;
- current CM-1 safety gates.

Expected before changes:
- PapoAI outbound disabled;
- Meta Direct not activated;
- no R0-A tables/function yet;
- external commercial side effect remains false.

- [ ] **Step 2: Apply the exact committed migration**

Apply `20260921174500_papoai_agent_external_lab_core_v1.sql` to project `ssbesxgaijknwsjbsbcz`.

Immediately query:

```sql
select enabled, fixed_response_text, burst_window_seconds, response_timeout_seconds
from public.channel_provider_agent_labs;

select capability_key,state,evidence_source
from public.channel_provider_capability_evidence
order by capability_key;
```

Expected:
- lab `enabled=false`;
- `agent_external.request=observed_ui`;
- all unproven action capabilities `unknown`.

- [ ] **Step 3: Run database/security verification**

Run Supabase advisors after migration.

Verify:
```sql
select relname, relrowsecurity
from pg_class
where relname in (
  'channel_provider_capability_evidence',
  'channel_provider_agent_labs',
  'channel_provider_agent_lab_sessions',
  'channel_provider_agent_lab_calls'
);
```

Expected: all `relrowsecurity=true`.

Also verify no anon/authenticated privileges on the four tables.

- [ ] **Step 4: Deploy the Edge Function dormant**

Deploy `papoai-agent-external-lab-v1` with `verify_jwt=false`.

Do not enable the DB lab flag yet.

- [ ] **Step 5: Verify fail-closed runtime before physical PapoAI connection**

Unauthenticated POST must return 401.

Authenticated request while lab is disabled must return safe silent/handoff semantics with:
- `message:null`;
- `silent:true`;
- `handoff:true`;
- `reason:'lab_disabled'`;
- a correlation ID.

Verify DB after this request:
- no order created;
- no Bling command created;
- no marketing delivery created;
- no PapoAI outbound activation;
- no capability promoted beyond evidence actually observed.

- [ ] **Step 6: Prepare the one unavoidable human configuration**

The remaining physical action is inside the PapoAI UI because no administrative PapoAI API for Agent External configuration is proven.

Provide the owner:
- endpoint URL;
- method POST;
- header name `X-API-Key`;
- the lab key through a secure one-time display/process, not committed to docs/chat history when avoidable;
- instruction to create/use an isolated PapoAI Agent External for homologation, not replace the production agent yet.

Stop before physical customer-channel activation until the owner confirms that isolated PapoAI agent is configured.

- [ ] **Step 7: Physical acceptance after owner configuration**

Temporarily enable only the lab:
```sql
select public.set_papoai_agent_external_lab_enabled_v1(true);
```

Perform:
1. normal test message -> fixed response visible in WhatsApp;
2. second message -> same session recognized;
3. reserved handoff command -> PapoAI human-transfer behavior observed;
4. human pause -> `silent` behavior observed;
5. no order/marketing/Bling effects.

Promote capability states only for observed facts:
- inbound request reaching endpoint -> `agent_external.request=verified_lab`;
- same provider session on second message -> `agent_external.session=verified_lab`;
- fixed text actually visible in WhatsApp -> `agent_external.text_reply=verified_lab`;
- observed transfer -> `agent_external.handoff=verified_lab`;
- observed silence -> `agent_external.silent=verified_lab`;
- if unsupported, use `unsupported` or `manual_setup_required`, not a fake verification.

Disable lab after test:
```sql
select public.set_papoai_agent_external_lab_enabled_v1(false);
```

- [ ] **Step 8: Record final R0-A evidence**

Update `docs/projects/papoai-commerce-os/CURRENT-STATE.md` with:
- deployed version;
- exact capabilities verified;
- capabilities still unknown/unsupported;
- physical test timestamp;
- lab disabled;
- external commercial effects zero;
- next phase `R0-B Commerce Brain foundation` only if text request/reply/session are verified.

Commit the evidence update.

---

## End-of-Plan Verification

Before calling R0-A complete, run:

```bash
node scripts/test-papoai-agent-external-contract-v1.mjs
node scripts/test-papoai-agent-external-lab-db-v1.mjs
node scripts/test-papoai-agent-external-lab-edge-v1.mjs
node scripts/test-cm-1-14-papoai-adapter.mjs
deno check supabase/functions/papoai-agent-external-lab-v1/index.ts
```

Then verify in Supabase:
- lab disabled;
- PapoAI outbound remains disabled;
- Meta Direct gates unchanged;
- no new order/Bling/marketing side effect from R0-A;
- capability evidence matches only what was physically observed.

A final whole-branch code review must inspect especially:
- authentication bypasses;
- accidental provider capability promotion;
- raw payload/secret leakage;
- idempotency race conditions;
- any accidental dependency on Shopping Room/OpenAI/commerce during R0-A.
