# Comprar Checkout + Pedidos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o checkout fragmentado do Comprar por um fechamento único dentro do chat, sem carregamento automático de produtos, com cadastro/endereço editável, pagamento na mesma tela, pedido persistido antes do WhatsApp e leitura básica confiável no Admin.

**Architecture:** O front continua modular (`products.js` e `checkout.js`) e usa somente APIs explícitas. O lookup de telefone fica em `shopping-chat-customer-v1`, que retorna somente perfil sanitizado e guarda o cliente encontrado como pendente na sessão. Uma RPC web específica confirma/atualiza o cliente sem exigir CPF, outra RPC web específica confirma o pedido preservando a fonte de verdade `orders`/`order_items`. O WhatsApp só recebe o handoff depois da persistência idempotente; o Admin apenas lê o mesmo pedido.

**Tech Stack:** JavaScript browser sem framework, Node.js `assert` para contratos, Supabase Edge Functions em Deno/TypeScript, PostgreSQL/PLpgSQL, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-15-comprar-checkout-orders-design.md`

## Global Constraints

- Destino oficial do WhatsApp: `https://wa.me/5565998150975`.
- CPF/CNPJ nunca pode ser retornado pelo lookup web, renderizado no checkout ou incluído na mensagem de WhatsApp.
- Rolagem da conversa nunca pode carregar nova página de produtos.
- `admin_test=1` nunca cria pedido real nem abre WhatsApp.
- Falha ao persistir cliente, endereço, pagamento, pedido ou itens bloqueia o handoff para WhatsApp.
- Reabrir o WhatsApp depois de pedido salvo nunca cria pedido duplicado.
- Não substituir `window.fetch` e não adicionar `MutationObserver` global.
- Reutilizar `orders`/`order_items`; o Admin não terá fonte paralela.
- Mudanças SQL web devem ser versionadas e restritas à sessão/cliente corrente.

---

### Task 1: Paginação manual da grade de produtos

**Files:**
- Modify: `scripts/test-comprar-clean-products-v1.mjs`
- Modify: `comprar/products.js`
- Modify: `comprar/styles.css`

**Interfaces:**
- Consumes: `loadMore(requestGeneration)` e estado `hasMore/loading/generation` já existentes.
- Produces: botão `[data-products-more]` que é a única forma de carregar páginas adicionais após a primeira.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao contrato de produtos:

```js
assert.doesNotMatch(js,/addEventListener\(['"]scroll['"]/,'rolagem não pode carregar produtos');
assert.doesNotMatch(js,/function\s+onScroll/,'não deve existir paginação acionada por scroll');
assert.match(js,/data-products-more/,'grade deve possuir botão Ver mais explícito');
assert.match(js,/Ver mais/,'ação manual deve ter texto Ver mais');
const moreHandler=js.match(/function\s+renderLoadMore[\s\S]*?(?=\n\s*function|\n\s*async function)/)?.[0]||'';
assert.match(moreHandler,/loadMore\(generation\)/,'Ver mais deve chamar a próxima página explicitamente');
```

- [ ] **Step 2: Executar o teste e confirmar RED**

Run: `node scripts/test-comprar-clean-products-v1.mjs`

Expected: FAIL porque `products.js` ainda contém `onScroll`/`addEventListener('scroll',...)` e não contém `data-products-more`.

- [ ] **Step 3: Implementar paginação manual mínima**

Em `products.js`, substituir o rodapé textual por uma área de ação explícita:

```js
const bottom=document.createElement('div');
bottom.className='products-loading';
bottom.dataset.productsLoading='1';
host.appendChild(bottom);
```

Manter essa área, mas em `loadMore()` renderizar um botão quando `hasMore`:

```js
function renderLoadMore(){
  const host=activeStage?.querySelector('[data-products-loading]');
  if(!host)return;
  host.innerHTML='';
  if(!hasMore)return;
  const button=document.createElement('button');
  button.type='button';
  button.className='secondary products-more';
  button.dataset.productsMore='1';
  button.textContent='Ver mais';
  button.onclick=()=>loadMore(generation);
  host.appendChild(button);
}
```

Durante `loadMore()`, trocar somente o estado do rodapé: `Carregando…` enquanto ocupado, `renderLoadMore()` no sucesso/finalização quando houver mais, e mensagem de erro quando falhar. Remover completamente:

```js
function onScroll(){...}
window.addEventListener('scroll',onScroll,{passive:true});
```

- [ ] **Step 4: Ajustar CSS do botão**

Adicionar em `comprar/styles.css` apenas espaçamento/alinhamento para `.products-loading` e `.products-more`, sem alterar grid/filtros.

- [ ] **Step 5: Executar contratos**

Run:

```bash
node scripts/test-comprar-clean-products-v1.mjs
node scripts/test-light-shopping-chat-v2.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/test-comprar-clean-products-v1.mjs comprar/products.js comprar/styles.css
git commit -m "fix: trocar paginação automática por Ver mais"
```

---

### Task 2: Lookup sanitizado e confirmação de cliente web sem CPF

**Files:**
- Create: `supabase/migrations/20260915143000_web_checkout_customer_v1.sql`
- Modify: `supabase/functions/shopping-chat-customer-v1/index.ts`
- Create: `scripts/test-comprar-checkout-profile-v1.mjs`
- Modify: `.github/workflows/test-shopping-room.yml`

**Interfaces:**
- Consumes: `lookup_customer_by_phone(p_phone)`, `catalog_sessions.metadata`, `customer_addresses`.
- Produces: `lookup_customer` com `{found:true, profile:{customer_id,name,phone,addresses}}` sem CPF; action `commit_customer` que chama `room_commit_web_customer_v1` e devolve `checkout`.

- [ ] **Step 1: Criar contrato RED do backend**

Criar `scripts/test-comprar-checkout-profile-v1.mjs`:

```js
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const edge=readFileSync('supabase/functions/shopping-chat-customer-v1/index.ts','utf8');
const migration=readFileSync('supabase/migrations/20260915143000_web_checkout_customer_v1.sql','utf8');

assert.match(edge,/action==='lookup_customer'/);
assert.match(edge,/profile:/,'lookup encontrado deve devolver perfil sanitizado');
assert.match(edge,/customer_addresses/,'lookup deve incluir endereços necessários ao checkout');
const lookup=edge.match(/if\(action==='lookup_customer'\)[\s\S]*?(?=\n\s*if\(action===)/)?.[0]||'';
assert.doesNotMatch(lookup,/cpf_cnpj/,'lookup web não pode devolver CPF');
assert.doesNotMatch(lookup,/whatsapp_url/,'lookup web não deve mandar cliente para verificação intermediária no WhatsApp');
assert.doesNotMatch(lookup,/verification_required/,'lookup web não deve exigir confirmação intermediária');
assert.match(edge,/action==='commit_customer'/,'backend deve confirmar cliente no clique final');
assert.match(edge,/room_commit_web_customer_v1/,'commit web deve usar RPC restrita');

assert.match(migration,/create or replace function public\.room_commit_web_customer_v1/);
assert.match(migration,/web_pending_customer_id/,'RPC só pode usar cliente previamente localizado na sessão');
assert.doesNotMatch(migration,/customer_document_required/,'fluxo web não exige CPF para confirmar cliente');
assert.match(migration,/primary_whatsapp_e164/,'RPC pode persistir telefone corrigido');
assert.match(migration,/customer_id=v_customer_id/,'vínculos da sessão devem apontar para o cliente confirmado');
```

- [ ] **Step 2: Rodar e confirmar RED**

Run: `node scripts/test-comprar-checkout-profile-v1.mjs`

Expected: FAIL porque a migration e action `commit_customer` não existem e o lookup ainda retorna verificação por WhatsApp.

- [ ] **Step 3: Criar RPC web versionada**

Criar migration com função:

```sql
create or replace function public.room_commit_web_customer_v1(
  p_public_token text,
  p_customer_id uuid,
  p_name text,
  p_phone text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_session public.catalog_sessions%rowtype;
  v_customer_id uuid;
  v_name text:=nullif(trim(coalesce(p_name,'')),'');
  v_phone text:=public.canonical_phone_br(p_phone);
  v_pending uuid;
begin
  select * into v_session
    from public.catalog_sessions
   where public_token=p_public_token and status='open' and expires_at>now()
   for update;
  if not found then raise exception 'room_unavailable'; end if;
  if v_name is null or length(v_name)<2 then raise exception 'customer_name_required'; end if;
  if v_phone is null then raise exception 'valid_whatsapp_required'; end if;

  v_pending:=nullif(v_session.metadata->>'web_pending_customer_id','')::uuid;
  if p_customer_id is not null then
    if p_customer_id<>coalesce(v_session.customer_id,v_pending) then raise exception 'customer_not_authorized'; end if;
    v_customer_id:=p_customer_id;
    update public.customers
       set name=v_name,primary_whatsapp_e164=v_phone,updated_at=now()
     where id=v_customer_id;
  else
    insert into public.customers(name,primary_whatsapp_e164,preferred_reply,is_active)
    values(v_name,v_phone,'auto',true)
    returning id into v_customer_id;
  end if;

  insert into public.customer_phones(customer_id,phone_e164,source,is_primary,verified_at)
  values(v_customer_id,v_phone,'web_checkout',true,now())
  on conflict (phone_e164) do update
     set is_primary=(public.customer_phones.customer_id=excluded.customer_id),
         verified_at=case when public.customer_phones.customer_id=excluded.customer_id then now() else public.customer_phones.verified_at end;

  update public.catalog_sessions
     set customer_id=v_customer_id,
         metadata=(v_session.metadata-'web_pending_customer_id'-'web_pending_phone')||jsonb_build_object('web_customer_committed_at',now()),
         last_activity_at=now()
   where id=v_session.id;
  update public.carts set customer_id=v_customer_id,updated_at=now() where id=v_session.cart_id and status='draft';
  update public.conversations set customer_id=v_customer_id,wa_contact_e164=v_phone,updated_at=now() where id=v_session.conversation_id;

  return jsonb_build_object('id',v_customer_id,'name',v_name,'phone',v_phone);
end;
$$;

revoke all on function public.room_commit_web_customer_v1(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.room_commit_web_customer_v1(text,uuid,text,text) to service_role;
```

Antes de commit, complementar a RPC com verificação de conflito de telefone para não reassociar telefone já pertencente a outro cliente.

- [ ] **Step 4: Alterar lookup para retorno sanitizado**

Quando `lookup_customer_by_phone` encontrar `match.customer_id`:

1. incrementar limite de tentativa;
2. salvar `web_pending_customer_id` e `web_pending_phone` na metadata;
3. buscar somente `id,name,primary_whatsapp_e164` de `customers`;
4. buscar endereços ativos em `customer_addresses` com campos de entrega;
5. retornar:

```ts
return json(req,{ok:true,found:true,profile:{
  customer_id:customer.id,
  name:clean(customer.name,120),
  phone:clean(customer.primary_whatsapp_e164||phone,40),
  addresses:addresses||[]
}});
```

Não gerar código, `whatsapp_url`, `verification_required` ou CPF.

Adicionar action:

```ts
if(action==='commit_customer'){
  const customerId=clean(body?.customer_id,80)||null;
  const {data,error}=await sb.rpc('room_commit_web_customer_v1',{
    p_public_token:token,
    p_customer_id:customerId||null,
    p_name:clean(body?.name,120),
    p_phone:clean(body?.phone,40)
  });
  if(error)return json(req,{ok:false,error:'customer_commit_failed',detail:error.message},400);
  const {data:checkout}=await sb.rpc('room_checkout_preview',{p_public_token:token});
  return json(req,{ok:true,customer:data,checkout});
}
```

- [ ] **Step 5: Adicionar o novo teste ao workflow**

Em `.github/workflows/test-shopping-room.yml`, adicionar:

```yaml
- run: node scripts/test-comprar-checkout-profile-v1.mjs
```

na etapa de contratos do Comprar.

- [ ] **Step 6: Aplicar migration no projeto e verificar**

Aplicar exatamente a migration aprovada. Depois rodar SQL somente leitura verificando `pg_get_functiondef('public.room_commit_web_customer_v1(text,uuid,text,text)'::regprocedure)` e confirmar que a função existe.

- [ ] **Step 7: Executar contrato e sintaxe**

Run:

```bash
node scripts/test-comprar-checkout-profile-v1.mjs
deno check supabase/functions/shopping-chat-customer-v1/index.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260915143000_web_checkout_customer_v1.sql supabase/functions/shopping-chat-customer-v1/index.ts scripts/test-comprar-checkout-profile-v1.mjs .github/workflows/test-shopping-room.yml
git commit -m "feat: adicionar lookup sanitizado ao checkout"
```

---

### Task 3: Checkout único editável e persistência coordenada

**Files:**
- Modify: `comprar/checkout.js`
- Modify: `comprar/styles.css`
- Modify: `scripts/test-basket-preview-checkout-whatsapp-v1.mjs`
- Modify: `scripts/test-comprar-checkout-profile-v1.mjs`

**Interfaces:**
- Consumes: `customerApi('lookup_customer')`, `customerApi('commit_customer')`, `checkoutApi('save_address')`, `api('set_payment')`, `app.confirmOrder()`.
- Produces: cartão único de perfil/endereço/pagamento e `confirmAndSend(button)` que executa a sequência final.

- [ ] **Step 1: Atualizar testes para o novo fluxo e confirmar RED**

Remover do teste legado as expectativas de `renderVerification`, `checkoutVerifyWhatsApp`, `verification_status` e `location.assign(link.href)`.

Adicionar:

```js
assert.doesNotMatch(checkout,/renderVerification/,'checkout web não deve ter verificação intermediária pelo WhatsApp');
assert.match(checkout,/function renderCheckoutForm/,'dados encontrados devem aparecer em formulário único');
for(const id of ['checkoutName','checkoutPhone','checkoutStreet','checkoutNumber','checkoutNeighborhood','checkoutComplement','checkoutReference','checkoutCity','checkoutState','checkoutPostal']){
  assert.match(checkout,new RegExp(id),`checkout deve renderizar ${id}`);
}
assert.match(checkout,/checkout-payments/,'pagamentos devem aparecer no mesmo formulário');
assert.match(checkout,/Confirmar e enviar pedido/,'botão final deve descrever salvar e enviar');
assert.match(checkout,/customerApi\('commit_customer'/,'clique final deve confirmar cliente antes do pedido');
assert.match(checkout,/checkoutApi\('save_address'/,'clique final deve salvar endereço antes do pedido');
assert.match(checkout,/api\('set_payment'/,'clique final deve salvar pagamento antes do pedido');
assert.match(checkout,/app\.confirmOrder\(payload\)/,'pedido deve ser persistido por último antes do handoff');
```

Run: `node scripts/test-basket-preview-checkout-whatsapp-v1.mjs`

Expected: FAIL porque o checkout ainda usa etapas separadas e verificação intermediária.

- [ ] **Step 2: Simplificar estado local**

Substituir estado de endereço/etapas por:

```js
const local={
  stage:null,
  phone:'',
  profile:null,
  selectedAddressId:null,
  locator:null,
  orderSaved:false,
  whatsappUrl:'',
  opening:false
};
```

`profile` contém `{customer_id,name,phone,addresses}` quando encontrado ou `{customer_id:null,name:'',phone,addresses:[]}` quando novo.

- [ ] **Step 3: Renderizar formulário único depois do lookup**

Criar `renderCheckoutForm()` que desenha os campos de cadastro/endereço e, no mesmo cartão, as quatro opções de pagamento.

Quando houver múltiplos endereços, renderizar chips/botões de seleção acima dos campos. Ao selecionar, copiar o endereço escolhido para os inputs e guardar `selectedAddressId`.

Nenhum CPF deve existir no HTML ou JS.

- [ ] **Step 4: Mover persistência para o clique final**

Criar `formData()` e `confirmAndSend(button)`:

```js
async function confirmAndSend(button){
  if(local.orderSaved){openSavedWhatsApp();return}
  const form=readCheckoutForm();
  validateCheckoutForm(form);
  setButtonBusy(button,true,'Salvando pedido…');
  try{
    const customerResult=await customerApi('commit_customer',{
      customer_id:local.profile?.customer_id||null,
      name:form.name,
      phone:form.phone
    });
    state.checkout=customerResult.checkout||state.checkout;
    state.customer=customerResult.customer||state.customer;

    const addressResult=await checkoutApi('save_address',{
      delivery_address:form.address,
      mode:local.selectedAddressId?'replace':'add',
      address_id:local.selectedAddressId||null
    });
    state.checkout=addressResult.checkout||state.checkout;

    const paymentResult=await api('set_payment',{payment_method:form.payment_method});
    state.payment=paymentResult.payment_method||form.payment_method;

    const payload={payment_method:state.payment,delivery_address:form.address,save_address:true,...(local.locator?{delivery_locator:local.locator}:{})};
    const data=await app.confirmOrder(payload);
    if(!data?.order?.order_id&&!data?.order?.order_number)throw new Error('Não consegui confirmar o número do pedido.');
    local.orderSaved=true;
    local.whatsappUrl=buildWhatsAppUrl(data,form);
    renderSuccess(data);
    openSavedWhatsApp();
  }catch(error){
    showCheckoutError(error);
    setButtonBusy(button,false);
  }
}
```

No modo `admin_test=1`, preservar o transporte de teste atual e não abrir URL externa.

- [ ] **Step 5: Não exigir documento no front**

Eliminar `requires_document`, `checkoutDocument` e qualquer campo CPF do novo cliente no Comprar. O fluxo web não apaga CPF existente no banco; apenas não consulta nem altera esse campo.

- [ ] **Step 6: Estilizar o cartão único**

Em `styles.css`, reaproveitar `.checkout-grid`, `.checkout-payments`, `.checkout-card`. Adicionar somente classes necessárias para selector de endereços e layout compacto; evitar novo sistema visual.

- [ ] **Step 7: Rodar contratos**

Run:

```bash
node scripts/test-basket-preview-checkout-whatsapp-v1.mjs
node scripts/test-comprar-checkout-profile-v1.mjs
node scripts/test-comprar-clean-checkout-v1.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add comprar/checkout.js comprar/styles.css scripts/test-basket-preview-checkout-whatsapp-v1.mjs scripts/test-comprar-checkout-profile-v1.mjs
git commit -m "feat: unificar cadastro endereco e pagamento no checkout"
```

---

### Task 4: Confirmação web sem CPF e handoff confiável ao WhatsApp

**Files:**
- Create: `supabase/migrations/20260915150000_web_checkout_confirm_order_v1.sql`
- Modify: `supabase/functions/shopping-chat-v1/index.ts`
- Modify: `comprar/checkout.js`
- Modify: `scripts/test-comprar-order-admin-v1.mjs`
- Modify: `scripts/test-basket-preview-checkout-whatsapp-v1.mjs`

**Interfaces:**
- Consumes: cart já identificado, endereço já salvo, pagamento em metadata.
- Produces: `room_confirm_web_order_v1(p_public_token,p_delivery_address)` retornando `order_id`, `order_number`, `source`, `catalog_session_id` sem exigir documento; URL `wa.me` final reutilizável.

- [ ] **Step 1: Escrever contrato RED para confirmação web**

Adicionar ao `test-comprar-order-admin-v1.mjs`:

```js
const webConfirm=readFileSync('supabase/migrations/20260915150000_web_checkout_confirm_order_v1.sql','utf8');
assert.match(webConfirm,/create or replace function public\.room_confirm_web_order_v1/);
assert.doesNotMatch(webConfirm,/customer_document_required/,'Comprar web não pode bloquear pedido por ausência de CPF');
assert.match(webConfirm,/confirm_cart_order/,'confirmação web deve continuar usando a fonte de verdade do carrinho');
assert.match(webConfirm,/order_number/,'retorno deve incluir número legível');
assert.match(webConfirm,/catalog_session_id/,'retorno deve incluir sessão');
assert.match(webConfirm,/status='closed'/,'sessão deve fechar somente após pedido criado');
assert.match(roomEdgeWeb,/room_confirm_web_order_v1/,'shopping-chat deve usar a RPC web específica');
```

No teste do WhatsApp:

```js
assert.match(confirm,/openSavedWhatsApp/,'handoff deve ter controlador único');
assert.doesNotMatch(checkout,/setTimeout\(/,'handoff não pode usar redirect atrasado');
assert.doesNotMatch(checkout,/whatsapp:\/\//,'handoff não usa custom scheme');
assert.match(checkout,/https:\/\/wa\.me\/5565998150975|whatsappFallback/,'handoff usa wa.me oficial');
```

- [ ] **Step 2: Rodar e confirmar RED**

Run:

```bash
node scripts/test-comprar-order-admin-v1.mjs
node scripts/test-basket-preview-checkout-whatsapp-v1.mjs
```

Expected: FAIL porque a RPC web não existe e `shopping-chat-v1` ainda chama `room_confirm_order`.

- [ ] **Step 3: Criar `room_confirm_web_order_v1`**

Basear a função na `room_confirm_order` atual, mas remover apenas a condição de documento. Manter:

```sql
if v_session.customer_id is null then raise exception 'customer_identification_required'; end if;
if v_customer.name is null or v_customer.primary_whatsapp_e164 is null then raise exception 'customer_identification_required'; end if;
```

Depois:

```sql
v_result:=public.confirm_cart_order(v_session.cart_id,v_address);
select o.order_number,o.source into v_order_number,v_order_source
  from public.orders o where o.id=(v_result->>'order_id')::uuid;
update public.catalog_sessions
   set status='closed',closed_at=now(),completed_at=now(),last_activity_at=now(),current_view='success'
 where id=v_session.id;
return v_result||jsonb_strip_nulls(jsonb_build_object(
  'delivery_address',v_address,
  'order_number',v_order_number,
  'source',v_order_source,
  'catalog_session_id',v_session.id
));
```

Revogar de `public/anon/authenticated`; conceder apenas a `service_role`.

- [ ] **Step 4: Trocar o endpoint web para RPC nova**

Em `shopping-chat-v1`:

```ts
const {data,error}=await sb.rpc('room_confirm_web_order_v1',{
  p_public_token:token,
  p_delivery_address:finalAddress
});
```

Depois da RPC, atualizar `orders.payment_method` pelo `order_id` como já ocorre. Exigir que `data.order_id` exista antes de retornar sucesso.

- [ ] **Step 5: Implementar handoff único**

No front:

```js
function openSavedWhatsApp(){
  if(!local.whatsappUrl)return;
  const simulated=new URLSearchParams(location.search).get('admin_test')==='1';
  if(simulated)return;
  location.href=local.whatsappUrl;
}
```

O botão de fallback da tela de sucesso é um `<a href="...">Abrir WhatsApp</a>` real com a mesma URL. Nenhum `confirm_order` é chamado nessa tela.

Se a navegação automática continuar vulnerável em navegadores móveis por ocorrer após awaits, implementar reserva de aba/janela apenas a partir do clique explícito e somente se compatível com os testes; se o browser bloquear, o link manual permanece a fonte final de handoff. Nunca reabrir/retornar automaticamente para o chat.

- [ ] **Step 6: Aplicar migration e verificar função**

Aplicar a migration no Supabase e consultar `pg_get_functiondef` da nova RPC. Não alterar a função legada `room_confirm_order`.

- [ ] **Step 7: Teste controlado no banco sem deixar pedido falso**

Executar um teste dentro de transação SQL com `BEGIN`/`ROLLBACK` criando sessão/carrinho temporários compatíveis ou usando harness existente. Verificar antes do rollback:

```sql
select o.id,o.order_number,o.source,o.payment_method,count(oi.id) item_count
from public.orders o join public.order_items oi on oi.order_id=o.id
where o.id=<order_id>
group by o.id;
```

Expected: uma linha, `source='shopping_room'`, `item_count>0`.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260915150000_web_checkout_confirm_order_v1.sql supabase/functions/shopping-chat-v1/index.ts comprar/checkout.js scripts/test-comprar-order-admin-v1.mjs scripts/test-basket-preview-checkout-whatsapp-v1.mjs
git commit -m "fix: persistir pedido antes do handoff para WhatsApp"
```

---

### Task 5: Tela básica de Pedidos no Admin

**Files:**
- Modify: `supabase/functions/admin-orders-comprar-v1/index.ts`
- Modify: `admin-v3/pedidos.html`
- Modify: `admin-v3/pedidos-v2.js`
- Modify: `admin-v3/pedidos-v2.css`
- Mirror compatibility changes where `/admin/` requires the same assets.
- Modify: `scripts/test-comprar-order-admin-v1.mjs`

**Interfaces:**
- Consumes: `orders` e `order_items` persistidos pelo Task 4.
- Produces: lista básica com cliente e detalhe completo usando `admin-orders-comprar-v1`.

- [ ] **Step 1: Criar teste RED para coluna Cliente**

Adicionar:

```js
assert.match(adminApi,/customer_snapshot/,'listagem do Admin deve receber snapshot do cliente');
assert.match(adminOrders,/<th>Cliente<\/th>/,'lista deve mostrar cliente');
assert.match(adminOrdersJs,/customer_snapshot/,'controller deve renderizar nome do cliente');
assert.match(adminOrdersJs,/order_number/);
assert.match(adminOrdersJs,/payment_method/);
assert.match(adminOrdersJs,/Ver pedido/);
```

Run: `node scripts/test-comprar-order-admin-v1.mjs`

Expected: FAIL na coluna/nome do cliente da listagem atual.

- [ ] **Step 2: Incluir snapshot mínimo na listagem API**

Alterar `select` de `list` para incluir `customer_snapshot`. O endpoint continua retornando somente pedidos `storefront_v2` e `shopping_room` e ordenando `created_at desc`.

- [ ] **Step 3: Simplificar tabela para o uso imediato**

Cabeçalho:

```html
<tr><th>Pedido</th><th>Data</th><th>Cliente</th><th>Telefone</th><th>Total</th><th>Pagamento</th><th>Status</th><th>Ações</th></tr>
```

Em `renderRows`:

```js
const customer=o.customer_snapshot||{};
...
<td><strong>${esc(customer.name||'Cliente')}</strong></td>
<td>${esc(o.phone_e164||customer.phone||'—')}</td>
```

Manter `Ver pedido` e o detalhe atual com endereço, pagamento, produtos da cesta, extras, valores e dados operacionais.

- [ ] **Step 4: Ajustar CSS apenas para legibilidade**

Garantir tabela responsiva/rolável no mobile, badges legíveis e dialog de detalhe sem overflow horizontal. Não adicionar dashboard, edição de status, logística ou fiscal.

- [ ] **Step 5: Rodar testes Admin**

Run:

```bash
node scripts/test-comprar-order-admin-v1.mjs
node scripts/check-admin-production.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/admin-orders-comprar-v1/index.ts admin-v3/pedidos.html admin-v3/pedidos-v2.js admin-v3/pedidos-v2.css scripts/test-comprar-order-admin-v1.mjs
git commit -m "feat: simplificar tela de pedidos do Admin"
```

---

### Task 6: Verificação integrada e publicação segura

**Files:**
- Modify only if required by failing tests: `index.html`, `comprar/index.html`, workflow files or cache-bust query strings.

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: PR pronta para revisão com CI verde; sem merge automático.

- [ ] **Step 1: Rodar suíte local/CI de contratos relevante**

Run:

```bash
node scripts/test-comprar-clean-products-v1.mjs
node scripts/test-comprar-clean-checkout-v1.mjs
node scripts/test-comprar-checkout-profile-v1.mjs
node scripts/test-basket-preview-checkout-whatsapp-v1.mjs
node scripts/test-comprar-order-admin-v1.mjs
node scripts/test-light-shopping-chat-v2.mjs
node scripts/check-public-site.mjs
node scripts/check-admin-production.mjs
node --check comprar/products.js
node --check comprar/checkout.js
node --check admin-v3/pedidos-v2.js
```

Expected: todos PASS.

- [ ] **Step 2: Verificar Edge Functions publicadas**

Confirmar que `shopping-chat-customer-v1`, `shopping-chat-v1`, `shopping-checkout-v2` e `admin-orders-comprar-v1` estão `ACTIVE` e com código correspondente à branch/commit após deploy.

- [ ] **Step 3: Fazer smoke test real sem duplicação**

Percorrer uma sessão controlada:

1. selecionar cesta;
2. abrir produtos e verificar que scroll não carrega mais;
3. tocar `Ver mais` e verificar que só uma página adicional chega;
4. digitar telefone existente e verificar nome/endereço editáveis sem CPF;
5. alterar endereço de teste/controlado ou usar cliente próprio de homologação;
6. escolher pagamento;
7. confirmar;
8. verificar `orders` + `order_items` antes do handoff;
9. verificar o mesmo pedido em `admin-orders-comprar-v1`;
10. inspecionar a URL `wa.me/5565998150975` e texto completo;
11. acionar fallback e confirmar que a contagem de pedidos não aumenta.

- [ ] **Step 4: Confirmar `admin_test=1`**

Executar o workflow de Admin V3 real Chat test mode e garantir que nenhum pedido real foi criado e nenhuma navegação externa ocorreu.

- [ ] **Step 5: Criar Pull Request**

PR deve resumir:

- paginação manual;
- checkout único sem CPF;
- persistência antes do WhatsApp;
- pedido visível no Admin;
- testes executados;
- alerta separado das 6 tabelas sem RLS, sem misturar a correção neste PR.

- [ ] **Step 6: Revisar CI e não mesclar automaticamente**

Aguardar todos os workflows relevantes. Se houver falha, corrigir antes de declarar pronto. Quando tudo estiver verde, deixar a decisão de merge para o usuário.
