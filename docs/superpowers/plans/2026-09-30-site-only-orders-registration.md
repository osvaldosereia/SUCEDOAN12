# Site-only Orders & Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar site/Supabase a única origem de cadastro e pedidos, eliminar dependência de Flow, criar cadastro avulso em `/cadastro` e implementar seleção de entrega com corte às 11h.

**Architecture:** `storefront-v2` será a API pública canônica para consulta, cadastro e criação do pedido. O checkout e `/cadastro` usarão a mesma validação de cliente/endereço/CPF; o backend validará novamente cadastro e data antes de criar o pedido. As estruturas antigas de Flow permanecem para histórico, mas seus triggers de cadastro/outbound deixam de operar.

**Tech Stack:** HTML/CSS/JavaScript estático, Supabase Edge Functions (Deno/TypeScript), PostgreSQL/RPC, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-30-site-only-orders-registration-papoai-design.md`

## Global Constraints
- Pedidos novos somente pelo site; PapoAI/WhatsApp não cria pedido.
- Sem Flow para novos cadastros.
- Telefone continua sendo a chave prática de reconhecimento.
- Cadastro avulso não cria pedido, reserva ou movimenta estoque.
- Cadastro obrigatório: nome, CPF/CNPJ, telefone, rua, número, bairro e Cuiabá/Várzea Grande.
- Complemento, referência e CEP opcionais.
- Corte de entrega às 11:00 em `America/Cuiaba`; domingo e feriado nacional fechados.
- Oferecer primeira data operacional + duas datas operacionais seguintes.
- Manter histórico antigo de Flow; não apagar tabelas/dados.
- Não usar Make/n8n.

## Review Focus
- Telefone reconhecido por token/código não pode ser substituído silenciosamente por outro cliente.
- CPF/CNPJ inválido deve bloquear cadastro e pedido.
- Data manipulada no navegador deve ser recusada pelo backend.
- Domingo/feriado não pode aparecer nem ser aceito.
- Cadastro avulso repetido para mesmo telefone deve atualizar o mesmo cliente, não duplicar.

---

### Task 1: Contrato canônico de cadastro e entrega

**Files:**
- Create: `supabase/sql/20260930_site_only_registration_checkout_v1.sql`
- Test: `scripts/test-site-only-order-registration.mjs`

**Interfaces:**
- Produces: `ops2_upsert_storefront_registration_v1(...) -> jsonb`; desativação dos triggers Flow/outbound; estado canônico de cadastro reutilizável.
- Consumes: `ops2_valid_cpf_cnpj_v1`, `ensure_storefront_customer_v2`, `ops2_customer_registration_state_v1`.

- [ ] Escrever teste estático que exija RPC de cadastro, validação CPF/CNPJ, restrição Cuiabá/Várzea Grande e desativação dos triggers Flow/outbound.
- [ ] Rodar e confirmar falha.
- [ ] Implementar SQL mínimo idempotente.
- [ ] Rodar teste e confirmar sucesso.
- [ ] Aplicar migration no Supabase e validar com consultas reais sem criar pedido.

### Task 2: `storefront-v2` como API única de cliente e entrega

**Files:**
- Modify: `supabase/functions/storefront-v2/index.ts`
- Test: `scripts/test-site-only-order-registration.mjs`

**Interfaces:**
- Consumes: RPC `ops2_upsert_storefront_registration_v1` da Task 1.
- Produces: ações `customer_lookup`, `customer_register`, `delivery_options`; `submit_order` exige cadastro completo e `delivery_date` válida.

- [ ] Estender teste para exigir corte 11h, três datas operacionais e validação server-side de `delivery_date`.
- [ ] Rodar e confirmar falha.
- [ ] Implementar endpoints e endurecer `submit_order`.
- [ ] Rodar teste e confirmar sucesso.
- [ ] Publicar nova versão de `storefront-v2` e testar endpoints somente leitura/registro controlado.

### Task 3: Checkout obrigatório e página `/cadastro`

**Files:**
- Modify: `index.html`
- Modify: `vitrine/index.html`
- Create: `cadastro/index.html`
- Test: `scripts/test-site-only-order-registration.mjs`

**Interfaces:**
- Consumes: `customer_lookup`, `customer_register`, `delivery_options`, `submit_order` da Task 2.
- Produces: checkout com confirmação/edição de endereço, cadastro curto obrigatório, escolha de data; cadastro avulso público.

- [ ] Estender teste para exigir `/cadastro`, campos obrigatórios, confirmação de endereço, seletor de data e ausência de copy/controle dependente de Flow.
- [ ] Rodar e confirmar falha.
- [ ] Implementar checkout e página de cadastro reutilizando o telefone vindo de identidade.
- [ ] Rodar teste e confirmar sucesso.
- [ ] Verificar paridade entre `index.html` e `vitrine/index.html` no fluxo de checkout.

### Task 4: Retirada definitiva da dependência de Flow e documentação do PapoAI

**Files:**
- Create: `docs/projects/dona-antonia-operations-2/PAPOAI-SITE-ONLY-HANDOFF-2026-09-30.md`
- Test: `scripts/test-site-only-order-registration.mjs`

**Interfaces:**
- Consumes: URL pública `/cadastro` e regras finais do checkout.
- Produces: prompt operacional exato para Work/PapoAI e checklist de automações a desativar/configurar.

- [ ] Estender teste para garantir que documentação proíba Flow/pedido no WhatsApp e contenha link `/cadastro` + marketing +10 dias.
- [ ] Rodar e confirmar falha.
- [ ] Criar handoff final para Work/PapoAI.
- [ ] Rodar teste completo.
- [ ] Revisar diff final e validar requisitos do spec.
