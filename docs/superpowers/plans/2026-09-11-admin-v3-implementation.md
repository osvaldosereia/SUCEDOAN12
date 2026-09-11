# Admin V3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar um Admin V3 simples, legível e diretamente orientado ao controle da Vitrine V3 e da operação essencial.

**Architecture:** `admin-v3/` é uma interface independente dos admins existentes. Uma Edge Function `admin-v3-api` reaproveita as tabelas operacionais existentes e adiciona apenas os controles mínimos da Vitrine V3. Categorias da Vitrine têm configuração persistente própria; cestas usam os campos existentes; produtos recebem um marcador simples de destaque.

**Tech Stack:** HTML/CSS/JavaScript modular, Supabase Edge Functions/Deno, PostgreSQL/Supabase.

**Spec:** `docs/superpowers/specs/2026-09-11-admin-v3-vitrine-v3-design.md`

## Global Constraints

- Manter `/admin/` intacto durante construção.
- Admin V3 segue a decisão operacional atual de acesso direto sem login; não reintroduzir PIN/senha silenciosamente.
- Corpo visual 16–18 px; títulos 22–28 px; botões/inputs com mínimo de 46 px.
- Nada de dashboard complexo, ERP ou automação de marketing.
- Balanço rápido continua em `/contagem/` e não é reimplementado.
- Não importar histórico de compras do Bling.
- Não expor service role no navegador.

---

### Task 1: Contrato e CI do Admin V3

**Files:**
- Create: `scripts/test-admin-v3-contract.mjs`
- Create: `.github/workflows/test-admin-v3-new.yml`

**Interfaces:**
- Produces contract for menu, readable typography, large controls, Vitrine controls, products, baskets, categories, orders, customers and quick-balance shortcut.

- [ ] **Step 1:** Write failing contract requiring `admin-v3/`, `admin-v3-api`, routes Home/Vitrine/Cestas/Produtos/Categorias/Pedidos/Clientes and link to `../contagem/`.
- [ ] **Step 2:** Require CSS root/body >=16px, headings 22–28px and controls >=46px.
- [ ] **Step 3:** Require browser code to contain no server secrets.
- [ ] **Step 4:** Run CI and confirm RED before implementation.
- [ ] **Step 5:** Commit the RED contract.

### Task 2: Minimal storefront-control schema

**Files:**
- Create: `supabase/migrations/<generated>_storefront_v3_controls.sql`

**Interfaces:**
- Table `storefront_v3_categories(name text primary key, is_visible boolean, show_home boolean, sort_order integer, created_at timestamptz, updated_at timestamptz)`.
- Column `products.storefront_featured boolean not null default false`.
- Function `rename_storefront_v3_category(p_old text,p_new text)` callable only by `service_role`.

- [ ] **Step 1:** Create category settings table with RLS enabled and no anon/authenticated policies.
- [ ] **Step 2:** Add product featured column and index only if needed for featured reads.
- [ ] **Step 3:** Add transactional rename function using invoker privileges; revoke from PUBLIC/anon/authenticated and grant to service_role.
- [ ] **Step 4:** Seed settings from existing distinct non-empty product categories with deterministic initial sort order.
- [ ] **Step 5:** Verify schema through read-only SQL and commit migration.

### Task 3: Admin V3 API

**Files:**
- Create: `supabase/functions/admin-v3-api/index.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Public no-login API, consistent with current explicit Admin policy; service role remains server-side.
- Actions: `health`, `dashboard`, `storefront`, `save_storefront`, `products`, `product`, `save_product`, `baskets`, `basket`, `save_basket`, `categories`, `save_category`, `rename_category`, `orders`, `order`, `customers`, `customer`, `save_customer`.

- [ ] **Step 1:** Implement CORS, POST action router, input sanitization and response helpers.
- [ ] **Step 2:** Dashboard counts active/no-image/no-stock products, active baskets, offers and recent storefront orders.
- [ ] **Step 3:** Storefront/category actions control visibility/order/home flags and featured products/baskets.
- [ ] **Step 4:** Product/basket/customer actions reuse existing fields and validation patterns from `admin-simple-v2` without exposing balance-scan writes.
- [ ] **Step 5:** Orders read only `orders`/`order_items` for storefront-origin orders and return phone/status/total/items.
- [ ] **Step 6:** Set `[functions.admin-v3-api] verify_jwt = false` to preserve current explicit no-login Admin decision.
- [ ] **Step 7:** Deno check + contract tests, then commit.

### Task 4: Admin V3 shell and readable visual system

**Files:**
- Create: `admin-v3/index.html`
- Create: `admin-v3/styles.css`
- Create: `admin-v3/config.js`
- Create: `admin-v3/api.js`
- Create: `admin-v3/app.js`

**Interfaces:**
- `api(action,payload)` talks only to `admin-v3-api` using publishable key.

- [ ] **Step 1:** Build menu: Início, Vitrine, Cestas, Produtos, Categorias, Pedidos, Clientes, Balanço rápido.
- [ ] **Step 2:** Use 17px default text, 24–28px page titles, 18–20px section titles, >=46px controls; avoid secondary text below 15px.
- [ ] **Step 3:** Mobile menu and responsive one-column forms with large tap targets.
- [ ] **Step 4:** Add permanent `Ver vitrine` link to `/vitrine-v3/`.
- [ ] **Step 5:** Run contract/syntax tests and commit.

### Task 5: Functional Admin views

**Files:**
- Create: `admin-v3/views/dashboard.js`
- Create: `admin-v3/views/storefront.js`
- Create: `admin-v3/views/products.js`
- Create: `admin-v3/views/baskets.js`
- Create: `admin-v3/views/categories.js`
- Create: `admin-v3/views/orders.js`
- Create: `admin-v3/views/customers.js`
- Modify: `admin-v3/app.js`

**Interfaces:**
- Each view exports `render(host, api, ui)` and keeps one responsibility.

- [ ] **Step 1:** Dashboard shows six simple operational numbers and recent orders.
- [ ] **Step 2:** Vitrine view controls featured baskets/products and links to category ordering; save applies immediately.
- [ ] **Step 3:** Products list supports name/EAN search, basic filters, quick price/category/active/offer/featured edit and full editor for remaining fields.
- [ ] **Step 4:** Cestas supports photo/name/price/composition/order/active/featured and `Ver na vitrine`.
- [ ] **Step 5:** Categorias supports visibility, home flag, order, create and transactional rename.
- [ ] **Step 6:** Pedidos lists storefront orders, detail/items and `Abrir WhatsApp`.
- [ ] **Step 7:** Clientes supports existing practical data including address/Maps without Bling history.
- [ ] **Step 8:** Run all tests and commit.

### Task 6: Database/API deploy and live verification

**Files:**
- No additional functional files unless a verified defect requires a fix.

- [ ] **Step 1:** Apply the single V3 controls migration once.
- [ ] **Step 2:** Deploy `admin-v3-api` with JWT verification disabled according to config.
- [ ] **Step 3:** Smoke-test health/dashboard/categories/products/orders read paths without mutating operational data.
- [ ] **Step 4:** Open PR after Vitrine V3 and Admin V3 suites are green.
- [ ] **Step 5:** Merge only after verification and wait for Pages deployment.
- [ ] **Step 6:** Verify `/admin-v3/` assets are on main; keep `/admin/` unchanged until user approves replacement.
