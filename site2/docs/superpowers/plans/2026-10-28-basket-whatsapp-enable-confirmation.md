# Confirmação de disponibilidade WhatsApp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pedir confirmação explícita antes de habilitar um produto que pode aparecer em várias cestas.

**Architecture:** Alterar o componente React existente para um fluxo inline em dois passos. Reutilizar a mesma função browser autenticada e os mesmos erros do servidor; não adicionar endpoint, estado remoto ou dependência.

**Tech Stack:** Next.js App Router, React, TypeScript, CSS do Admin, Supabase Edge Function existente.

**Spec:** `docs/superpowers/specs/2026-10-28-basket-whatsapp-enable-confirmation-design.md`

## Global Constraints

- Não alterar registros de produto nem publicar mudanças comerciais nesta implementação.
- Preservar autenticação, autorização e validação do gateway/Edge Function existentes.
- Nenhum teste automatizado pode ser criado ou executado; usar somente verificações estáticas essenciais.
- Não mudar tabelas, migrations, secrets, funções remotas ou o contrato público.

## Review Focus

- Primeiro clique deve mostrar confirmação e não chamar a Edge Function.
- Cancelar deve fechar a confirmação sem envio.
- Confirmar deve fazer uma única chamada ao gateway atual.
- Durante a chamada, confirmar/cancelar devem estar desabilitados para impedir repetição.
- Sucessos e erros atuais devem continuar legíveis após a resposta.

---

### Task 1: Confirmar a ativação em duas etapas

**Files:**
- Modify: `src/app/(admin)/cestas/[basketId]/product-whatsapp-enable-action.tsx`
- Modify: `src/app/globals.css`
- Modify: `docs/superpowers/specs/2026-10-28-basket-whatsapp-enable-confirmation-design.md` only if implementation reveals a material mismatch.
- Update: `docs/planning/implementation-ledger.md`

**Interfaces:**
- Consumes: `enableBrowserProductForWhatsapp(productId: string)` and existing error result union.
- Produces: same props and external behavior after confirmed activation; before confirmation, no network mutation occurs.

- [x] **Step 1: Add inline review state** in `BasketProductWhatsappEnableAction`; keep the existing action button as the first step, then render an explanatory message plus “Cancelar” and “Habilitar produto” controls.
- [x] **Step 2: Call the existing gateway only from confirm**; guard repeated submit with `pending`, disable both decision controls during the request, and preserve current success/error copy.
- [x] **Step 3: Add focused styles** matching the current basket card buttons and warning colors without introducing a modal dependency.
- [x] **Step 4: Run essential static checks**: `pnpm exec biome check --write` on the changed TSX, `pnpm typecheck`, and `git diff --check`. Do not run automated tests. Static build `NEXT_OUTPUT_EXPORT=1 NEXT_PUBLIC_BASE_PATH=/site2 pnpm build` also generated all 19 routes.
- [x] **Step 5: Review the diff** against the five Review Focus cases, update the ledger, and commit the scoped change.
