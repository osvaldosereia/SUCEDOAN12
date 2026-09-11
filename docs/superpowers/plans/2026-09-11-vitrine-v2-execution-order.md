# Vitrine V2 Execution Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Executar a simplificação da Dona Antônia sem interromper a produção atual até a Vitrine V2 estar homologada.

**Architecture:** Cada plano produz software testável de forma independente. O Admin pode ser reduzido primeiro; backend e imagem entram antes da nova vitrine; o legado só é apagado depois do corte e smoke test.

**Tech Stack:** GitHub Pages/site estático, JavaScript vanilla, Supabase Postgres/Edge Functions/Storage.

**Spec:** `docs/superpowers/specs/2026-09-11-vitrine-v2-admin-simple-design.md`

## Global Constraints

- Não cortar a raiz pública antes de homologar `vitrine-v2/`.
- Não remover dados comerciais junto com runtime de WhatsApp/Meta.
- Não confiar em preço do navegador.
- Não abrir WhatsApp antes de o pedido estar salvo.
- Imagem pública de produto da Vitrine V2 <= 15360 bytes.

---

### Task 1: Admin Simple V2

**Plan:** `docs/superpowers/plans/2026-09-11-admin-simple-v2.md`

- [ ] Executar o plano completo.
- [ ] Gate: workflow do Admin verde e menu contendo somente Produtos, Cestas básicas e Clientes.

### Task 2: Storefront V2 Backend

**Plan:** `docs/superpowers/plans/2026-09-11-storefront-v2-backend.md`

- [ ] Executar o plano completo.
- [ ] Gate: `create_order` validado com cliente existente e telefone ainda não cadastrado; adulteração de preço rejeitada/recalculada.

### Task 3: Storefront V2 UI

**Plan:** `docs/superpowers/plans/2026-09-11-storefront-v2-ui.md`

- [ ] Executar em `vitrine-v2/` sem alterar a raiz.
- [ ] Gate: fluxo cesta -> personalização -> seções -> extras -> carrinho -> telefone -> pedido salvo -> botão WhatsApp funciona em mobile e desktop.

### Task 4: Storefront Image Pipeline

**Plan:** `docs/superpowers/plans/2026-09-11-storefront-image-pipeline.md`

- [ ] Integrar pipeline ao Admin e gerar variantes dos produtos ativos.
- [ ] Gate: auditoria confirma <= 15360 bytes nas imagens servidas pela Vitrine V2.

### Task 5: Homologação e corte

- [ ] Fazer smoke test de `vitrine-v2/` com dados reais não sensíveis.
- [ ] Confirmar pedido persistido no banco antes do `wa.me`.
- [ ] Confirmar vínculo automático posterior por telefone.
- [ ] Substituir a raiz pública pela Vitrine V2.
- [ ] Verificar produção em mobile e desktop.

### Task 6: Remover WhatsApp/Meta legado

**Plan:** `docs/superpowers/plans/2026-09-11-whatsapp-meta-legacy-removal.md`

- [ ] Executar somente depois do gate de produção da Task 5.
- [ ] Gate: nenhum runtime ativo de Meta API, Flow, Inbox, worker de conversa ou IA de atendimento; somente o link comum `wa.me` permanece para envio manual do pedido já salvo.

### Task 7: Final verification

- [ ] Rodar todos os testes novos.
- [ ] Rodar `deno check` nas Edge Functions mantidas/novas.
- [ ] Rodar advisors Supabase.
- [ ] Confirmar ausência de regressão em Produtos/Cestas/Clientes.
- [ ] Confirmar que página inicial não carrega catálogo completo.
- [ ] Confirmar que o pedido não depende de cadastro prévio.
- [ ] Abrir PR único somente quando todos os gates anteriores estiverem verdes, ou PRs menores na mesma ordem quando revisão incremental for mais segura.
