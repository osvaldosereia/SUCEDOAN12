# Storefront V2 Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar backend seguro para catálogo público, identificação por telefone e criação atômica de pedidos sem depender de Meta, WhatsApp API, Firebase ou Make.

**Architecture:** Uma Edge Function pública `storefront-v2` expõe somente leitura de vitrine e criação de pedido. Dados privados continuam protegidos; a função usa credenciais server-side, recalcula preços/estoque no servidor e grava `orders`/`order_items` de forma transacional por função SQL privada/RPC. O telefone é normalizado e usado como chave auxiliar de vínculo.

**Tech Stack:** Supabase Postgres, RLS, Edge Functions Deno/TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-11-vitrine-v2-admin-simple-design.md`

## Global Constraints

- Verificar changelog/documentação Supabase atual antes de tocar auth/RLS/Edge Functions.
- Nunca expor `service_role` no navegador.
- Pedido sem cliente cadastrado deve ser aceito.
- `customer_id` existente nunca é trocado automaticamente por outro cliente.
- Preço recebido do navegador nunca é fonte de verdade.
- Sem Meta API, webhook, Flow ou IA no backend da vitrine.

---

### Task 1: Auditar schema real e documentar compatibilidade

**Files:**
- Create: `docs/superpowers/plans/storefront-v2-schema-audit.md`

**Interfaces:**
- Produces: tabela de mapeamento entre `products`, `customers`, `orders`, itens de pedido e estruturas de cestas existentes.

- [ ] **Step 1: Verificar Supabase changelog**

Fetch: `https://supabase.com/changelog.md` e checar breaking changes de Edge Functions, Data API, RLS e Auth.

- [ ] **Step 2: Ler docs atuais de RLS/Data API e Edge Functions**
- [ ] **Step 3: Consultar schema real do projeto**

Queries mínimas:
```sql
select table_name,column_name,data_type,is_nullable
from information_schema.columns
where table_schema='public'
  and table_name in ('products','customers','orders','order_items','baskets','basket_template_items')
order by table_name,ordinal_position;
```

- [ ] **Step 4: Mapear índices existentes de telefone e FKs**

```sql
select schemaname,tablename,indexname,indexdef
from pg_indexes
where schemaname='public' and tablename in ('customers','orders');
```

- [ ] **Step 5: Registrar o resultado em `storefront-v2-schema-audit.md` e escolher reutilização em vez de duplicação sempre que possível**
- [ ] **Step 6: Commit**

### Task 2: Criar migração aditiva de pedido por telefone

**Files:**
- Create via CLI: run `supabase migration new storefront_v2_orders` and use the exact generated path printed by the CLI.
- Create: `scripts/test-storefront-v2-schema.mjs`

**Interfaces:**
- Produces: `normalize_storefront_phone_v2(text)`, campos/index necessários em pedidos e função segura de vínculo posterior.

- [ ] **Step 1: Escrever teste estático falhando para os contratos SQL**

O teste deve exigir `phone_e164`, `source`, índice por telefone e regra `customer_id is null` no vínculo automático.

- [ ] **Step 2: Criar migração com o CLI; não inventar timestamp manualmente**

```bash
supabase migration new storefront_v2_orders
```

- [ ] **Step 3: Implementar normalização canônica do telefone brasileiro**

Regra: apenas dígitos; 10/11 dígitos nacionais recebem `55`; entradas `55...` são preservadas; resultado final `+55...`; rejeitar tamanhos inválidos.

- [ ] **Step 4: Adicionar apenas as colunas ausentes no schema real**

Campos-alvo em `orders`: `phone_e164`, `source`, `subtotal`, `total` quando ainda inexistentes/compatíveis.

- [ ] **Step 5: Criar índice parcial**

```sql
create index if not exists orders_unlinked_phone_idx
on public.orders(phone_e164,created_at desc)
where customer_id is null and phone_e164 is not null;
```

- [ ] **Step 6: Implementar `link_unclaimed_orders_to_customer_v2(customer_id uuid)`**

A função deve atualizar somente `orders.customer_id is null` cujo `phone_e164` normalizado corresponde ao telefone do cliente.

- [ ] **Step 7: Revogar execução pública; liberar apenas ao papel/backend administrativo necessário**
- [ ] **Step 8: Executar teste SQL em banco de desenvolvimento/transação e garantir idempotência**
- [ ] **Step 9: Commit**

### Task 3: Criar RPC transacional de criação de pedido

**Files:**
- Add to migration generated for Storefront V2 or create a second migration via `supabase migration new storefront_v2_create_order`.
- Test: `scripts/test-storefront-v2-order-contract.mjs`

**Interfaces:**
- Produces: RPC server-side `create_storefront_order_v2(p_phone text, p_items jsonb, p_basket jsonb default null)` retornando `order_id`, `order_number`, `customer_id`, `phone_e164`, `subtotal`, `total`, `message`.

- [ ] **Step 1: Testar que preço enviado pelo cliente não aparece como fonte de cálculo**
- [ ] **Step 2: Validar cada `product_id` contra `products`, ativo e estoque/disponibilidade**
- [ ] **Step 3: Buscar preço atual no banco e calcular linhas/total server-side**
- [ ] **Step 4: Resolver cliente por telefone normalizado; zero ou um cliente; nunca retornar dados privados**
- [ ] **Step 5: Inserir `orders` e itens na mesma transação**
- [ ] **Step 6: Salvar snapshots `name_snapshot`, `quantity`, `unit_price`, `line_total` conforme o schema real**
- [ ] **Step 7: Retornar mensagem de WhatsApp pronta sem fazer chamada à Meta**
- [ ] **Step 8: Testar rollback: item inválido não pode deixar pedido parcial**
- [ ] **Step 9: Commit**

### Task 4: Edge Function pública `storefront-v2`

**Files:**
- Create: `supabase/functions/storefront-v2/index.ts`
- Modify: `supabase/config.toml`
- Create: `scripts/test-storefront-v2-edge.mjs`

**Interfaces:**
- Actions: `list_baskets`, `get_basket`, `list_sections`, `list_products`, `lookup_customer_by_phone`, `create_order`.

- [ ] **Step 1: Escrever teste de contrato do roteador de actions**
- [ ] **Step 2: Configurar função como pública somente se necessário (`verify_jwt=false`) e manter toda autorização sensível dentro da função/RPC**
- [ ] **Step 3: `list_baskets`: retornar somente cestas ativas e campos públicos**
- [ ] **Step 4: `get_basket`: retornar composição pública, regras de edição e imagem otimizada**
- [ ] **Step 5: `list_sections`: retornar seções com produtos ativos**
- [ ] **Step 6: `list_products`: exigir seção ou busca; `limit` máximo 40; cursor/página; nunca devolver todos os produtos sem filtro**
- [ ] **Step 7: `lookup_customer_by_phone`: retornar apenas `{found:true}`/`{found:false}` e, quando útil, primeiro nome não sensível; não devolver endereço/CPF**
- [ ] **Step 8: `create_order`: chamar RPC transacional e retornar dados do pedido**
- [ ] **Step 9: CORS somente para domínios oficiais necessários**
- [ ] **Step 10: Rodar `deno check supabase/functions/storefront-v2/index.ts`**
- [ ] **Step 11: Commit**

### Task 5: Vínculo posterior ao salvar cliente

**Files:**
- Modify endpoint CRUD administrativo de clientes escolhido no plano Admin.
- Test: `scripts/test-customer-order-link-v2.mjs`

**Interfaces:**
- Consumes: cliente salvo com telefone.
- Produces: chamada idempotente ao vínculo de pedidos órfãos.

- [ ] **Step 1: Criar fixture com pedido `customer_id=null` e telefone igual**
- [ ] **Step 2: Salvar cliente/alterar telefone pelo endpoint administrativo**
- [ ] **Step 3: Chamar vínculo após persistência do cliente**
- [ ] **Step 4: Confirmar que pedido órfão recebe o `customer_id`**
- [ ] **Step 5: Confirmar que pedido já ligado a outro cliente não é alterado**
- [ ] **Step 6: Commit**

### Task 6: Segurança e verificação

- [ ] **Step 1:** rodar advisors do Supabase e corrigir findings relevantes.
- [ ] **Step 2:** verificar RLS nas tabelas expostas.
- [ ] **Step 3:** confirmar que nenhuma resposta pública contém CPF, endereço, token ou chave privilegiada.
- [ ] **Step 4:** testar `create_order` com preço adulterado no request e confirmar total oficial.
- [ ] **Step 5:** testar telefone cadastrado e não cadastrado.
- [ ] **Step 6:** rodar testes Node + `deno check` e registrar resultados no PR.
