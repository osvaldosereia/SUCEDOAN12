# Admin Canônico e Ajuda por Chips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar `/admin/` o único Admin oficial e adicionar perguntas rápidas configuráveis dentro da conversa do Chat Comprar sem fechar o composer.

**Architecture:** O Admin atual será consolidado fisicamente em `/admin/`, copiando os ativos necessários hoje mantidos em `admin-v3/` e substituindo links/cargas por caminhos locais. `admin-v3/*.html` vira compatibilidade por redirecionamento. O Chat Comprar reutiliza `shopping-chat-menu-v1`, filtra somente perguntas determinísticas de atendimento e renderiza chips no timeline pelo módulo `comprar/help.js`.

**Tech Stack:** HTML/CSS/JavaScript sem framework, GitHub Pages, Supabase Edge Functions existentes, Node.js para testes de contrato.

**Spec:** `docs/superpowers/specs/2026-09-15-admin-canonico-ajuda-chips-design.md`

## Global Constraints

- `/admin/` é a única interface administrativa oficial.
- O Admin canônico não deve depender de URLs `/admin-v3/...`.
- `/admin-v3/` existe somente como redirecionamento de compatibilidade.
- Perguntas rápidas não usam IA.
- `baskets`, `offers` e `products` não aparecem como perguntas rápidas.
- Texto, áudio e foto continuam disponíveis enquanto a Ajuda estiver aberta.
- `admin_test=1` continua sem criar pedido real.
- Nenhuma regra comercial, checkout ou persistência de pedidos é alterada.

---

### Task 1: Contratos do Admin canônico

**Files:**
- Create: `scripts/test-admin-canonical-v1.mjs`
- Modify: `.github/workflows/admin-v3-chat-center-tests.yml`
- Modify: `.github/workflows/admin-v3-real-chat-test-mode.yml`
- Modify: `.github/workflows/admin-v3-service-strategy-tests.yml`

**Interfaces:**
- Consumes: estrutura atual de `admin/` e `admin-v3/`.
- Produces: contratos que exigem páginas e ativos canônicos em `/admin/`, ausência de dependência `/admin-v3/` no Admin oficial e redirecionamentos legados.

- [ ] **Step 1: Write the failing test**

Criar `scripts/test-admin-canonical-v1.mjs` verificando:

```js
import fs from 'node:fs';
import assert from 'node:assert/strict';

const index=fs.readFileSync('admin/index.html','utf8');
for(const required of ['admin/atendimento.html','admin/imagens-ia.html','admin/nomes-produtos-v3.html','admin/service-strategy.js','admin/chat-real-test.js']){
  assert.equal(fs.existsSync(required),true,`${required} deve existir no Admin canônico`);
}
assert.doesNotMatch(index,/\/admin-v3\//,'Admin oficial não deve carregar caminhos admin-v3');
assert.match(index,/href="\.\/atendimento\.html"/,'Atendimento deve apontar para /admin');
assert.match(index,/href="\.\/imagens-ia\.html"/,'Imagens IA deve apontar para /admin');
assert.match(index,/href="\.\/nomes-produtos-v3\.html"/,'Nomes deve apontar para /admin');

for(const [legacy,target] of [
  ['admin-v3/index.html','/admin/'],
  ['admin-v3/atendimento.html','/admin/atendimento.html'],
  ['admin-v3/imagens-ia.html','/admin/imagens-ia.html'],
  ['admin-v3/nomes-produtos-v3.html','/admin/nomes-produtos-v3.html']
]){
  const html=fs.readFileSync(legacy,'utf8');
  assert.match(html,new RegExp(target.replaceAll('/','\\/')),`${legacy} deve redirecionar para ${target}`);
}
console.log('OK: Admin canônico em /admin');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-admin-canonical-v1.mjs`
Expected: FAIL porque as subpáginas/ativos ainda vivem em `admin-v3/` e `admin/index.html` ainda carrega `/admin-v3/...`.

- [ ] **Step 3: Update CI paths**

Trocar nos três workflows os paths e comandos de testes de `admin-v3/...` para os novos contratos de `admin/...`, mantendo os testes antigos apenas quando ainda cobrirem comportamento compartilhado.

- [ ] **Step 4: Commit failing contracts**

```bash
git add scripts/test-admin-canonical-v1.mjs .github/workflows/admin-v3-*.yml
git commit -m "test: define admin canônico em /admin"
```

---

### Task 2: Consolidar o Admin em `/admin/`

**Files:**
- Modify: `admin/index.html`
- Create/copy: ativos atualmente usados a partir de `admin-v3/` para `admin/`
- Create/copy and adjust: `admin/atendimento.html`
- Create/copy and adjust: `admin/imagens-ia.html`
- Create/copy and adjust: `admin/nomes-produtos-v3.html`
- Modify: `admin-v3/index.html`
- Modify: `admin-v3/atendimento.html`
- Modify: `admin-v3/imagens-ia.html`
- Modify: `admin-v3/nomes-produtos-v3.html`
- Modify: `admin-v3/nomes-produtos.html`
- Modify: `admin-v3/pedidos.html`

**Interfaces:**
- Consumes: blobs e comportamento atuais de `admin-v3/`, `admin/config.js` e Edge Functions existentes.
- Produces: Admin operacional totalmente servido por `/admin/` e URLs legadas que encaminham para ele.

- [ ] **Step 1: Copy active Admin assets**

Copiar para `admin/` os arquivos de `admin-v3/` necessários pelas páginas atuais e seus imports relativos, preservando `admin/config.js`, `admin/index.html` e páginas já existentes quando forem mais novas. O objetivo é que nenhuma página canônica carregue recursos por `/admin-v3/...`.

- [ ] **Step 2: Make `/admin/index.html` self-contained**

Usar somente caminhos locais:

```html
<link rel="stylesheet" href="./styles.css?...">
<link rel="stylesheet" href="./products-inline-controls-v4.css?...">
<a href="./nomes-produtos-v3.html">Nomes dos produtos</a>
<a href="./imagens-ia.html">Imagens IA</a>
<a href="./atendimento.html">Atendimento</a>
<script src="./config.js?... "></script>
<script type="module" src="./app.js?... "></script>
```

Manter as funções atuais do menu: Início, Comprar, Cestas, Produtos, Nomes dos produtos, Imagens IA, Categorias, Pedidos, Clientes, Atendimento e Balanço rápido.

- [ ] **Step 3: Canonicalize Atendimento**

Em `admin/atendimento.html`:

```html
<a class="strategy-back" href="./">← Admin</a>
<div class="eyebrow">Admin</div>
```

Carregar `./styles.css`, `./service-strategy.css`, `./service-chat-center.css`, `./chat-real-test.css`, `./service-strategy.js` e `./chat-real-test.js`.

- [ ] **Step 4: Redirect legacy HTML pages**

Usar redirecionamento preservando query/hash:

```html
<script>
location.replace('/admin/atendimento.html'+location.search+location.hash);
</script>
```

Aplicar o destino equivalente para cada página legada.

- [ ] **Step 5: Run canonical Admin test**

Run: `node scripts/test-admin-canonical-v1.mjs`
Expected: PASS.

- [ ] **Step 6: Commit Admin consolidation**

```bash
git add admin admin-v3 scripts/test-admin-canonical-v1.mjs
git commit -m "feat: consolida admin oficial em /admin"
```

---

### Task 3: Perguntas rápidas no Chat Comprar

**Files:**
- Create: `scripts/test-comprar-help-quick-questions-v1.mjs`
- Modify: `comprar/help.js`
- Modify: `comprar/styles.css`
- Modify: `comprar/index.html`
- Modify: `index.html`
- Modify: `admin/service-strategy.js`
- Modify: `admin/atendimento.html`

**Interfaces:**
- Consumes: `window.DA_COMPRAR_APP.post`, `window.DA_COMPRAR_APP.config.menuApi`, token da sala e resposta pública de `shopping-chat-menu-v1`.
- Produces: `renderQuickQuestions()`, `loadQuickQuestions()`, resposta determinística por `response_text`, botão `Outras dúvidas` e configuração administrativa com nomenclatura “Perguntas rápidas do cliente”.

- [ ] **Step 1: Write the failing help test**

Criar `scripts/test-comprar-help-quick-questions-v1.mjs`:

```js
import fs from 'node:fs';
import assert from 'node:assert/strict';

const help=fs.readFileSync('comprar/help.js','utf8');
const css=fs.readFileSync('comprar/styles.css','utf8');
const admin=fs.readFileSync('admin/service-strategy.js','utf8');
const atendimento=fs.readFileSync('admin/atendimento.html','utf8');

assert.match(help,/menuApi/,'Ajuda deve ler a configuração pública do menu');
assert.match(help,/response_text/,'chips devem responder sem IA');
assert.match(help,/Outras dúvidas/,'deve permitir reabrir as perguntas');
assert.match(help,/baskets.*offers.*products|products.*offers.*baskets/s,'deve reconhecer os tipos de compra para filtrá-los');
assert.match(css,/help-quick-questions/,'deve estilizar os chips dentro da conversa');
assert.match(admin,/Perguntas rápidas do cliente/,'Admin deve nomear corretamente o recurso');
assert.match(atendimento,/Perguntas rápidas/,'Atendimento deve explicar a função');
console.log('OK: perguntas rápidas da Ajuda');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-comprar-help-quick-questions-v1.mjs`
Expected: FAIL porque `help.js` ainda não usa `menuApi` nem renderiza perguntas.

- [ ] **Step 3: Implement deterministic quick questions**

Em `comprar/help.js`, adicionar estado/cache e funções com estas regras:

```js
const PURCHASE_KINDS=new Set(['baskets','offers','products']);
let quickConfig=null;

async function loadQuickQuestions(){
  const data=await app.post(app.config.menuApi,'get');
  const cfg=data?.config||{};
  const items=(Array.isArray(cfg.menu_items)?cfg.menu_items:[])
    .filter(item=>item?.enabled!==false)
    .filter(item=>!PURCHASE_KINDS.has(app.text(item?.kind)))
    .filter(item=>app.text(item?.label)&&app.text(item?.response_text));
  quickConfig={prompt:app.text(cfg.prompt_text)||'Posso te ajudar com alguma dúvida?',items};
  return quickConfig;
}
```

`renderQuickQuestions()` deve remover somente o bloco ativo anterior, criar uma mensagem da Ana, renderizar chips em `.help-quick-questions`, e em cada clique:

```js
app.userDecision(item.label,{className:'help-quick-decision'});
app.assistantMessage(item.response_text,{className:'help-quick-answer'});
```

Depois criar um chip/botão `Outras dúvidas` que chama `renderQuickQuestions()` novamente. Nenhum clique de chip chama `send_text`.

- [ ] **Step 4: Keep composer open**

`open()` deve abrir o composer e chamar `renderQuickQuestions()` sem forçar foco automático no celular. Selecionar chip não fecha o composer. Falha ao carregar perguntas deve apenas deixar o composer disponível.

- [ ] **Step 5: Style conversational chips**

Adicionar CSS com wrap natural:

```css
.help-quick-questions{display:flex;flex-wrap:wrap;gap:8px;max-width:92%;align-self:flex-start}
.help-quick-questions .chip{min-height:38px;padding:8px 12px;border-radius:999px}
.help-other-questions{align-self:flex-start}
```

Sem posição fixa; os chips pertencem ao timeline.

- [ ] **Step 6: Rename Admin configuration**

Em `admin/service-strategy.js`, trocar a cópia visual de “Menu de ajuda / Atalhos rápidos” para “Perguntas rápidas do cliente / Dúvidas frequentes”, mantendo os mesmos IDs, ordem, ativo/inativo e `response_text`. A prévia deve representar chips de atendimento, e itens de compra devem ser identificados como fora da área de perguntas rápidas.

- [ ] **Step 7: Bump browser cache versions**

Atualizar em `comprar/index.html` e `index.html` a versão de `styles.css` e `help.js` para um novo sufixo consistente, sem alterar os outros módulos sem necessidade.

- [ ] **Step 8: Run focused tests**

Run:

```bash
node scripts/test-comprar-help-quick-questions-v1.mjs
node scripts/test-admin-canonical-v1.mjs
node scripts/test-comprar-clean-activation-v1.mjs
```

Expected: PASS.

- [ ] **Step 9: Commit quick questions**

```bash
git add comprar admin index.html scripts/test-comprar-help-quick-questions-v1.mjs
git commit -m "feat: adiciona perguntas rápidas na ajuda do Comprar"
```

---

### Task 4: Full regression and publication readiness

**Files:**
- Test only; modify implementation only if a regression is proven.

**Interfaces:**
- Consumes: Admin canônico + Ajuda por chips concluídos.
- Produces: evidência de que o fluxo atual de Comprar/Admin permanece íntegro.

- [ ] **Step 1: Run relevant local contract suite**

Run all repository tests directly relacionados a Comprar/Admin, incluindo:

```bash
node scripts/test-admin-canonical-v1.mjs
node scripts/test-comprar-help-quick-questions-v1.mjs
node scripts/test-comprar-clean-activation-v1.mjs
node scripts/test-shopping-chat-routing-v1.mjs
```

Expected: PASS.

- [ ] **Step 2: Open PR and wait for CI**

Criar PR para `main` e acompanhar os workflows de Comprar, Admin, sala de compra e site público.

- [ ] **Step 3: Verify all relevant CI checks**

Expected: todos os checks relevantes concluídos com `success` no mesmo head.

- [ ] **Step 4: Merge and verify GitHub Pages**

Mesclar somente após CI verde e confirmar `pages build and deployment` com build e deploy `success`.
