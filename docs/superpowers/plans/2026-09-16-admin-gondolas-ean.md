# Admin Gôndolas por EAN Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar no Admin oficial uma seção de Gôndolas que permita cadastrar gôndolas, vincular/transferir produtos por leitura rápida de EAN e editar a gôndola no cadastro individual do produto, mantendo uma única gôndola principal por produto.

**Architecture:** Reutilizar `warehouse_locations`, `product_location_assignments` e `product_pick_location_v2`. Um RPC transacional, executado somente pelo backend com service role, serializa a movimentação do produto e mantém `products.gondola` sincronizado; uma Edge Function dedicada `admin-gondolas-v1` expõe apenas as operações necessárias ao Admin. O frontend fica dividido entre um cliente API pequeno e um módulo de UI/scanner, com integração mínima no roteador e no editor de produtos existente.

**Tech Stack:** Admin HTML/CSS/JavaScript ES modules, Supabase Edge Functions/Deno/`@supabase/supabase-js`, PostgreSQL, GitHub Actions, Node contract tests.

**Spec:** `docs/superpowers/specs/2026-09-16-admin-gondolas-ean-design.md`

## Global Constraints

- Cada produto pode ter somente uma gôndola principal ativa.
- Não haverá prateleira na interface; `products.shelf` deve permanecer `NULL`/vazio.
- Não importar os 675 valores antigos apagados de gôndola/prateleira.
- Última leitura válida vence e transfere automaticamente, sem confirmação.
- EAN desconhecido nunca cria produto.
- Gôndola desativada não aceita novas leituras.
- `warehouse_locations` + `product_location_assignments` são fonte de verdade; `products.gondola` é espelho de compatibilidade.
- Nenhuma `service_role` vai para o navegador.
- O endpoint seguirá a política pública do Admin oficial (`verify_jwt=false` + CORS estrito para `donaantonia.com.br`), sem ampliar acesso para outras origens.
- Mudanças de banco são estruturais apenas; nenhum dado antigo será restaurado.
- TDD obrigatório: cada tarefa começa por teste falhando e termina com verificação verde.

---

## File Structure

- Create: `admin/gondolas-api-v1.js` — cliente HTTP exclusivo do endpoint de gôndolas.
- Create: `admin/gondolas-v1.js` — rota, lista, criação/renomeação/ativação e tela de leitura rápida.
- Create: `admin/gondolas-v1.css` — estilos da lista e do leitor.
- Modify: `admin/app.js` — reconhecer a rota `gondolas`, carregar o módulo e incluir o seletor no editor de produto.
- Modify: `admin/index.html` — menu `Gôndolas`, CSS novo e cache-bust do `app.js`.
- Create: `supabase/functions/admin-gondolas-v1/index.ts` — API administrativa de gôndolas.
- Modify: `supabase/config.toml` — declarar `admin-gondolas-v1` com `verify_jwt=false`, coerente com o Admin oficial.
- Create via `supabase migration new admin_gondolas_v1`: usar **o caminho exato gerado pelo CLI** em `supabase/migrations/` — índice de unicidade + RPCs transacionais. Não fabricar timestamp manualmente.
- Create: `scripts/test-admin-gondolas-v1.mjs` — contrato completo do módulo.
- Modify: `.github/workflows/test-admin-v3.yml` — executar o novo teste.

---

### Task 1: Invariantes de banco e RPC transacional

**Files:**
- Create: migration gerada por `supabase migration new admin_gondolas_v1` em `supabase/migrations/`
- Test: `scripts/test-admin-gondolas-v1.mjs`

**Interfaces:**
- Produces: `public.set_product_gondola_v1(p_product_id uuid, p_location_id uuid)` → `jsonb`
- Produces: `public.rename_gondola_v1(p_location_id uuid, p_new_name text)` → `jsonb`
- Invariant: índice parcial único em `product_location_assignments(product_id)` quando `active=true AND is_primary=true`.

- [ ] **Step 1: Write the failing contract test**

Criar `scripts/test-admin-gondolas-v1.mjs` começando pelo contrato SQL:

```js
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

const migrations=readdirSync(new URL('../supabase/migrations/',import.meta.url))
  .filter(x=>x.endsWith('_admin_gondolas_v1.sql'));
assert.equal(migrations.length,1,'deve existir exatamente uma migração admin_gondolas_v1');
const sql=readFileSync(new URL(`../supabase/migrations/${migrations[0]}`,import.meta.url),'utf8');
assert.match(sql,/unique index[\s\S]*product_location_assignments[\s\S]*product_id[\s\S]*active[\s\S]*is_primary/i);
assert.match(sql,/set_product_gondola_v1/i);
assert.match(sql,/rename_gondola_v1/i);
assert.match(sql,/for update/i,'movimentação deve serializar o produto');
assert.match(sql,/products[\s\S]*gondola/i);
assert.match(sql,/shelf\s*=\s*null/i);
assert.match(sql,/revoke execute[\s\S]*from public/i);
assert.match(sql,/grant execute[\s\S]*to service_role/i);
```

- [ ] **Step 2: Run the test to verify RED**

Run: `node scripts/test-admin-gondolas-v1.mjs`

Expected: FAIL porque a migração ainda não existe.

- [ ] **Step 3: Generate the migration file correctly**

Run:

```bash
supabase migration new admin_gondolas_v1
```

Use o nome exato retornado pelo CLI. Não criar timestamp manualmente.

- [ ] **Step 4: Implement database invariants and RPCs**

A migração deve conter o equivalente a:

```sql
create unique index if not exists product_location_assignments_one_active_primary_idx
on public.product_location_assignments(product_id)
where active and is_primary;

create unique index if not exists warehouse_locations_active_gondola_name_idx
on public.warehouse_locations(lower(trim(gondola_code)))
where active and shelf_code='GERAL';

create or replace function public.set_product_gondola_v1(
  p_product_id uuid,
  p_location_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_product public.products%rowtype;
  v_target public.warehouse_locations%rowtype;
  v_previous record;
  v_now timestamptz:=clock_timestamp();
begin
  select * into v_product from public.products where id=p_product_id for update;
  if not found then return jsonb_build_object('ok',false,'error','product_not_found'); end if;

  select pla.location_id,wl.gondola_code
  into v_previous
  from public.product_location_assignments pla
  join public.warehouse_locations wl on wl.id=pla.location_id
  where pla.product_id=p_product_id and pla.active and pla.is_primary
  order by pla.created_at desc
  limit 1;

  if p_location_id is not null then
    select * into v_target from public.warehouse_locations where id=p_location_id for update;
    if not found then return jsonb_build_object('ok',false,'error','gondola_not_found'); end if;
    if not v_target.active then return jsonb_build_object('ok',false,'error','gondola_inactive'); end if;
  end if;

  if p_location_id is not null and v_previous.location_id=p_location_id then
    update public.products set gondola=v_target.gondola_code,shelf=null,updated_at=v_now where id=p_product_id;
    return jsonb_build_object('ok',true,'kind','same','product_id',p_product_id,'previous_gondola',v_previous.gondola_code,'current_gondola',v_target.gondola_code);
  end if;

  update public.product_location_assignments
  set active=false
  where product_id=p_product_id and active and is_primary;

  if p_location_id is null then
    update public.products set gondola=null,shelf=null,updated_at=v_now where id=p_product_id;
    return jsonb_build_object('ok',true,'kind','removed','product_id',p_product_id,'previous_gondola',v_previous.gondola_code,'current_gondola',null);
  end if;

  insert into public.product_location_assignments(product_id,location_id,priority,is_primary,active)
  values(p_product_id,p_location_id,1,true,true)
  on conflict(product_id,location_id) do update
    set priority=1,is_primary=true,active=true;

  update public.products set gondola=v_target.gondola_code,shelf=null,updated_at=v_now where id=p_product_id;

  return jsonb_build_object(
    'ok',true,
    'kind',case when v_previous.location_id is null then 'assigned' else 'moved' end,
    'product_id',p_product_id,
    'previous_gondola',v_previous.gondola_code,
    'current_gondola',v_target.gondola_code
  );
end;$$;
```

`rename_gondola_v1` deve bloquear a localização com `FOR UPDATE`, normalizar o nome no backend antes da chamada, atualizar `warehouse_locations.gondola_code` e atualizar `products.gondola` para todos os produtos com vínculo ativo principal naquela localização, dentro da mesma transação.

Revogar execução pública e liberar apenas para `service_role`:

```sql
revoke execute on function public.set_product_gondola_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.set_product_gondola_v1(uuid,uuid) to service_role;
revoke execute on function public.rename_gondola_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.rename_gondola_v1(uuid,text) to service_role;
```

- [ ] **Step 5: Verify the SQL contract is GREEN**

Run: `node scripts/test-admin-gondolas-v1.mjs`

Expected: PASS para os asserts SQL.

- [ ] **Step 6: Verify transaction behavior against Supabase without keeping test data**

Executar em uma transação de teste que termina em `ROLLBACK`: criar duas `warehouse_locations` temporárias e um produto temporário; chamar `set_product_gondola_v1` em A, repetir em A, mover para B, remover; verificar em cada etapa que existe no máximo um vínculo ativo, `products.gondola` acompanha o destino e `products.shelf IS NULL`.

Expected: todos os asserts SQL retornam verdadeiro e a transação é revertida.

- [ ] **Step 7: Run database advisors/security review**

Run: `supabase db advisors` quando disponível; se o CLI não suportar, usar o advisor do MCP. Corrigir qualquer achado introduzido por esta migração antes de prosseguir.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations scripts/test-admin-gondolas-v1.mjs
git commit -m "feat: adicionar invariantes de gondolas"
```

---

### Task 2: Edge Function `admin-gondolas-v1`

**Files:**
- Create: `supabase/functions/admin-gondolas-v1/index.ts`
- Modify: `supabase/config.toml`
- Test: `scripts/test-admin-gondolas-v1.mjs`

**Interfaces:**
- Consumes: `set_product_gondola_v1`, `rename_gondola_v1`
- Produces POST actions: `list_gondolas`, `create_gondola`, `rename_gondola`, `set_gondola_active`, `get_gondola`, `scan_ean`, `remove_product`, `set_product_gondola`, `product_gondola_options`.

- [ ] **Step 1: Extend the test and verify RED**

Adicionar ao teste:

```js
const edge=readFileSync(new URL('../supabase/functions/admin-gondolas-v1/index.ts',import.meta.url),'utf8');
for(const action of ['list_gondolas','create_gondola','rename_gondola','set_gondola_active','get_gondola','scan_ean','remove_product','set_product_gondola','product_gondola_options']){
  assert.match(edge,new RegExp(`action===\\"${action}\\"|action===\\'${action}\\'`));
}
assert.match(edge,/ALLOWED_ORIGINS/);
assert.match(edge,/SUPABASE_SERVICE_ROLE_KEY/);
assert.match(edge,/set_product_gondola_v1/);
assert.match(edge,/rename_gondola_v1/);
assert.match(edge,/product_pick_location_v2/);
const config=readFileSync(new URL('../supabase/config.toml',import.meta.url),'utf8');
assert.match(config,/\[functions\.admin-gondolas-v1\][\s\S]*verify_jwt\s*=\s*false/);
```

Run: `node scripts/test-admin-gondolas-v1.mjs`

Expected: FAIL porque a Edge Function ainda não existe.

- [ ] **Step 2: Implement the Edge Function**

Usar o mesmo CORS do `admin-core-v1`:

```ts
const ALLOWED_ORIGINS=new Set(['https://donaantonia.com.br','https://www.donaantonia.com.br']);
```

Criar o Supabase client somente no servidor com `SUPABASE_SERVICE_ROLE_KEY`.

Normalizar nomes antes de gravar:

```ts
const normalizeName=(v:unknown)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,80);
const nameKey=(v:unknown)=>normalizeName(v).toLocaleLowerCase('pt-BR');
const codeFor=(name:string)=>`GONDOLA:${name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'')}`;
```

`create_gondola` grava:

```ts
{
  code: codeFor(name),
  gondola_code: name,
  shelf_code: 'GERAL',
  pick_sequence: requestedSequence,
  active: true,
  metadata: {kind:'gondola',name_key:nameKey(name)}
}
```

`scan_ean` deve:

```ts
const ean=String(body?.ean??'').replace(/\D/g,'');
const {data:product}=await sb.from('products')
  .select('id,name,gtin,image_url,gondola,shelf')
  .eq('gtin',ean).maybeSingle();
if(!product)return respond({ok:true,kind:'unknown',ean});
const {data:move,error:moveError}=await sb.rpc('set_product_gondola_v1',{
  p_product_id:product.id,
  p_location_id:locationId
});
```

`get_gondola`/busca de produtos deve usar `product_pick_location_v2` filtrando `location_id` e opcionalmente `name/gtin`, com paginação.

`product_gondola_options` retorna a gôndola atual mesmo se inativa + todas as gôndolas ativas.

- [ ] **Step 3: Configure verify_jwt**

Adicionar a `supabase/config.toml`:

```toml
# Gestão de gôndolas do Admin oficial: mesma política pública/CORS estrito do admin-core-v1.
[functions.admin-gondolas-v1]
verify_jwt = false
```

- [ ] **Step 4: Run Deno/static tests**

Run:

```bash
deno check supabase/functions/admin-gondolas-v1/index.ts
node scripts/test-admin-gondolas-v1.mjs
```

Expected: ambos PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/admin-gondolas-v1 supabase/config.toml scripts/test-admin-gondolas-v1.mjs
git commit -m "feat: criar backend de gondolas"
```

---

### Task 3: Rota Gôndolas e leitor rápido no Admin

**Files:**
- Create: `admin/gondolas-api-v1.js`
- Create: `admin/gondolas-v1.js`
- Create: `admin/gondolas-v1.css`
- Modify: `admin/app.js`
- Modify: `admin/index.html`
- Test: `scripts/test-admin-gondolas-v1.mjs`

**Interfaces:**
- `gondolaApi(action,payload={}) -> Promise<object>`
- `loadGondolas() -> Promise<void>` renderiza a lista.
- `openGondola(id) -> Promise<void>` renderiza a tela de leitura.

- [ ] **Step 1: Extend frontend contract test and verify RED**

Adicionar:

```js
const html=readFileSync(new URL('../admin/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../admin/app.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('../admin/gondolas-v1.js',import.meta.url),'utf8');
const api=readFileSync(new URL('../admin/gondolas-api-v1.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../admin/gondolas-v1.css',import.meta.url),'utf8');
assert.match(html,/data-route="gondolas"/);
assert.match(app,/gondolas/);
assert.match(ui,/data-gondola-scan-input/);
assert.match(ui,/scan_ean/);
assert.match(ui,/keydown[\s\S]*Enter/);
assert.match(ui,/Tab/);
assert.match(ui,/Produto não encontrado/);
assert.match(api,/admin-gondolas-v1/);
assert.match(css,/gondola-scan/);
```

Run: `node scripts/test-admin-gondolas-v1.mjs`

Expected: FAIL porque os módulos frontend ainda não existem.

- [ ] **Step 2: Implement the API client**

`admin/gondolas-api-v1.js`:

```js
import {CONFIG} from './runtime-config.js';

export async function gondolaApi(action,payload={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(`${CONFIG.supabaseUrl}/functions/v1/admin-gondolas-v1`,{
      method:'POST',
      headers:{apikey:CONFIG.supabasePublishableKey,'Content-Type':'application/json'},
      body:JSON.stringify({action,...payload}),
      cache:'no-store',
      credentials:'omit',
      signal:controller.signal
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.ok===false)throw new Error(data.detail||data.error||'Não foi possível concluir.');
    return data;
  } finally { clearTimeout(timer); }
}
```

- [ ] **Step 3: Implement the gondola list and scanner module**

`admin/gondolas-v1.js` deve:

- listar cards/linhas com nome, quantidade, status e ações;
- criar gôndola via prompt/form curto;
- renomear;
- ativar/desativar;
- abrir uma gôndola;
- manter o input do leitor focado;
- aceitar Enter/Tab;
- normalizar dígitos;
- aplicar debounce curto para a mesma leitura acidental;
- chamar `scan_ean` imediatamente;
- manter `recentReads` somente na sessão da tela;
- mostrar `assigned`, `same`, `moved` e `unknown` com mensagens do spec;
- permitir remover um produto da gôndola;
- atualizar contador/lista sem recarregar a página inteira.

Estrutura mínima do scanner:

```js
let activeGondolaId='';
let recentReads=[];
let lastEan='';
let lastEanAt=0;

async function captureEan(raw){
  const ean=String(raw??'').replace(/\D/g,'');
  const now=Date.now();
  if(!ean)return focusScanner();
  if(ean===lastEan&&now-lastEanAt<600)return focusScanner();
  lastEan=ean;lastEanAt=now;
  const result=await gondolaApi('scan_ean',{gondola_id:activeGondolaId,ean});
  renderScanResult(result);
  await refreshCurrentGondola({preserveRecent:true});
  focusScanner();
}
```

- [ ] **Step 4: Wire the route into the canonical router**

Em `admin/app.js`:

```js
import {loadGondolas} from './gondolas-v1.js?v=20260916-1';
```

Adicionar `gondolas` ao `routeFromHash()` e ao `loadRoute()`:

```js
if(route==='gondolas')return loadGondolas();
```

Em `admin/index.html`, adicionar no menu logo após Produtos:

```html
<button type="button" data-route="gondolas">Gôndolas</button>
```

Adicionar CSS:

```html
<link rel="stylesheet" href="./gondolas-v1.css?v=20260916-1">
```

Atualizar o cache-bust do `app.js` para uma versão nova e ajustar os testes existentes que fixam essa versão.

- [ ] **Step 5: Run frontend contract tests**

Run:

```bash
node scripts/test-admin-gondolas-v1.mjs
node scripts/test-admin-v3-contract.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add admin/gondolas-api-v1.js admin/gondolas-v1.js admin/gondolas-v1.css admin/app.js admin/index.html scripts/test-admin-gondolas-v1.mjs scripts/test-admin-v3-contract.mjs
git commit -m "feat: adicionar leitura rapida por gondola"
```

---

### Task 4: Campo Gôndola no editor individual do produto

**Files:**
- Modify: `admin/app.js`
- Consume: `admin/gondolas-api-v1.js`
- Test: `scripts/test-admin-gondolas-v1.mjs`

**Interfaces:**
- Consumes action `product_gondola_options`.
- Consumes action `set_product_gondola` with `{product_id,gondola_id|null}`.

- [ ] **Step 1: Add failing product-editor assertions**

```js
assert.match(app,/name="gondola_id"/);
assert.match(app,/product_gondola_options/);
assert.match(app,/set_product_gondola/);
assert.match(app,/Sem gôndola/);
```

Run: `node scripts/test-admin-gondolas-v1.mjs`

Expected: FAIL.

- [ ] **Step 2: Fetch product + gondola options together**

No `openProductEditor(id)`:

```js
const [data,locationData]=await Promise.all([
  api('product',{id}),
  gondolaApi('product_gondola_options',{product_id:id})
]);
```

Renderizar:

```html
<label class="field">
  <span>Gôndola</span>
  <select name="gondola_id">
    <option value="">Sem gôndola</option>
    <!-- gôndolas ativas + atual inativa, se houver -->
  </select>
</label>
```

A opção atual inativa deve aparecer como `Nome (inativa)`; outras inativas não aparecem.

- [ ] **Step 3: Save location before closing the editor**

No submit de `productEditorForm`, manter o `save_product` atual e, antes de fechar:

```js
await api('save_product',{id,patch});
await gondolaApi('set_product_gondola',{
  product_id:id,
  gondola_id:d.gondola_id||null
});
```

Se a segunda chamada falhar, manter o diálogo aberto e exibir erro; nunca tentar gravar `shelf` pelo frontend.

- [ ] **Step 4: Verify product editor contract**

Run:

```bash
node scripts/test-admin-gondolas-v1.mjs
node scripts/test-admin-v3-inline-product-controls.mjs
```

Expected: PASS, sem alterar os controles rápidos da lista.

- [ ] **Step 5: Commit**

```bash
git add admin/app.js scripts/test-admin-gondolas-v1.mjs
git commit -m "feat: editar gondola no cadastro do produto"
```

---

### Task 5: CI, deploy, integração e verificação final

**Files:**
- Modify: `.github/workflows/test-admin-v3.yml`
- Test: `scripts/test-admin-gondolas-v1.mjs`

**Interfaces:**
- CI deve executar o contrato novo em toda mudança relevante do Admin/Supabase.

- [ ] **Step 1: Add the new test to CI**

Adicionar etapa ao workflow:

```yaml
- name: Validar gôndolas por EAN
  run: node scripts/test-admin-gondolas-v1.mjs
```

E incluir os novos paths no filtro do workflow, caso haja `paths:`.

- [ ] **Step 2: Run the complete Admin suite locally/CI-equivalent**

Executar pelo menos:

```bash
node scripts/test-admin-v3-contract.mjs
node scripts/test-admin-v3-inline-product-controls.mjs
node scripts/test-admin-product-verification-expiry-v1.mjs
node scripts/test-admin-product-image-editor-v1.mjs
node scripts/test-admin-gondolas-v1.mjs
deno check supabase/functions/admin-gondolas-v1/index.ts
```

Expected: todos PASS.

- [ ] **Step 3: Apply schema change and deploy the Edge Function**

Aplicar a migração estrutural aprovada no projeto Supabase e fazer deploy de `admin-gondolas-v1` com `verify_jwt=false` conforme `config.toml`.

- [ ] **Step 4: Verify production database invariants**

Consultar:

```sql
select count(*) from public.product_location_assignments where active and is_primary;
select product_id,count(*) from public.product_location_assignments where active and is_primary group by product_id having count(*)>1;
select count(*) from public.products where nullif(trim(coalesce(shelf,'')),'') is not null;
```

Expected antes de uso real: nenhuma duplicidade ativa; `products.shelf` continua 0.

- [ ] **Step 5: Smoke test with temporary production records and cleanup**

Criar uma gôndola de teste e um produto temporário controlado, testar via endpoint: criar → scan → repetir scan → mover para segunda gôndola → remover → EAN desconhecido → desativar gôndola e confirmar bloqueio. Excluir o produto temporário e desativar/remover as localizações de teste ao fim, sem tocar produtos comerciais.

Expected: respostas `assigned`, `same`, `moved`, `removed`, `unknown`, e `gondola_inactive` no cenário correto.

- [ ] **Step 6: Run full GitHub Actions on the feature head**

Esperar todas as suítes disparadas para o head final. Não abrir/atualizar PR como pronto enquanto houver `pending`, `in_progress`, `failure` ou `cancelled` relacionado às mudanças.

- [ ] **Step 7: Open PR, review diff, and only merge with explicit owner approval**

PR deve documentar:

- zero importação de localizações antigas;
- uma gôndola por produto;
- transferência automática pela última leitura;
- `products.shelf` permanece vazio;
- Edge Function nova + migration estrutural;
- evidência RED → GREEN e smoke test.

- [ ] **Step 8: After merge, verify Pages deployment**

Confirmar que o commit do `main` contém o PR e que o workflow `pages build and deployment` terminou `success` para o mesmo SHA.

---

## Self-Review

- Spec coverage: todas as 15 coberturas mínimas do spec estão mapeadas nas Tasks 1–5.
- No data import: nenhuma etapa recria os 675 valores apagados.
- Type/interface consistency: frontend envia `gondola_id`; backend usa `gondola_id` e traduz para `p_location_id`; RPC recebe UUID/NULL.
- Atomicity: movimentação e espelho `products.gondola` ficam dentro do mesmo RPC; rename sincroniza produtos dentro de RPC próprio.
- Security: RPCs são `SECURITY INVOKER`, execução pública revogada e Edge Function usa service role somente no servidor.
- Scope: não adiciona prateleira, multi-localização, inventário por posição, etiquetas físicas ou criação automática de produto por EAN.