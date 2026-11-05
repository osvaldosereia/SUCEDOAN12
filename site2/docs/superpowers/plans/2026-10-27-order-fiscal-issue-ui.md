# Emissão de NF-e no painel do pedido — Implementation Plan

> **Sequenciamento do proprietário (27/10/2026):** esta é a última fase do projeto. O código local deste plano não deve ser publicado nem habilitado antes da conclusão dos fluxos de atendimento, clientes, Flow, Catálogo, pedidos, separação e integração com o Bling sem emissão. A emissão automática também precisa permanecer desligada até este gate final.

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Expor no Admin a recuperação manual de NF-e já suportada pelo gateway, sem ultrapassar os bloqueios fiscais existentes.

**Architecture:** A leitura do gateway inclui `can_issue`; uma Server Action autenticada revalida o pedido e chama a ação fiscal existente no Edge Function. A tela só oferece o comando elegível, exige confirmação explícita e mantém a entrega bloqueada até a autorização da Sefaz.

**Tech Stack:** Next.js Server Actions, React `useActionState`, TypeScript e Edge Function Supabase existente.

**Spec:** `docs/superpowers/specs/2026-10-27-order-fiscal-issue-ui-design.md`

## Global Constraints

- Usar Supabase original Dona Antônia, projeto `ssbesxgaijknwsjbsbcz`.
- Não criar caminho fiscal paralelo, segredo no cliente, DDL, deploy, emissão ou escrita remota.
- Revalidar sessão e elegibilidade no servidor; o gateway existente é a autoridade fiscal.
- Só iniciar entrega quando `authorized=true` e `can_dispatch=true`.
- Manter interface curta e didática, em português.
- Sem testes automatizados nesta fatia; executar somente typecheck, Biome focado e `git diff --check`.

## Review Focus

- POST forjado ou pedido em outro estado: rejeitar antes de chamar o gateway.
- Elegibilidade revogada entre render e submit: gateway permanece autoridade e recusa emissão.
- NF-e autorizada ou geração em reconciliação: não oferecer nem repetir comando manual.
- Timeout/estado `processing`: não afirmar autorização nem liberar expedição.
- Erro de configuração fiscal: não contornar `can_issue` nem iniciar entrega.

---

### Task 1: Projetar e chamar a emissão fiscal existente

**Files:**
- Modify: `src/lib/supabase/admin-orders.ts`

**Interfaces:**
- `OrderFiscalStatus.canIssue` projeta `payload.can_issue`.
- `issueAdminOrderFiscal(orderId)` envia `action=order_fiscal_issue_v4`, `id` e `confirmation="EMITIR_NFE"`; retorna somente `issued`, replay, estágio e número da NF-e, ou erro reduzido.

- [x] Adicionar a ação ao union de `gatewayPost` e mapear `can_issue` na leitura.
- [x] Implementar adaptador que aceite apenas UUID e devolva projeção reduzida do resultado fiscal.
- [x] Confirmar formatação do arquivo com Biome.

### Task 2: Guardar o comando em Server Action

**Files:**
- Modify: `src/app/(admin)/pedidos/actions.ts`

**Interfaces:**
- `issueOrderFiscalAction(previous, formData)` valida sessão, pedido UUID, confirmação `yes`, status `ready` e `canIssue=true` antes do POST; revalida `/pedidos/{id}` depois da resposta.

- [x] Criar a Server Action usando o mesmo padrão `SeparationActionState`.
- [x] Mapear conflitos e indisponibilidade para mensagens simples sem incluir detalhes do gateway.
- [x] Confirmar formatação do arquivo com Biome.

### Task 3: Tornar emissão e bloqueio claros em Expedição

**Files:**
- Modify: `src/app/(admin)/pedidos/[id]/dispatch-panel.tsx`

- [x] Mostrar o comando somente quando a NF-e não estiver autorizada, `canIssue=true` e não houver `invoice_generation_recovery_required`.
- [x] Pedir confirmação explícita antes da solicitação.
- [x] Explicar que a solicitação pode ficar em processamento e que a saída só é liberada após autorização.
- [x] Preservar a confirmação separada de iniciar entrega.
- [x] Tratar `stage=rejected` como rejeição observada, sem anunciar solicitação enviada.
- [x] Confirmar formatação do arquivo com Biome.

### Task 4: Registrar evidência local

**Files:**
- Modify: `docs/planning/implementation-ledger.md`
- Modify: `docs/planning/caderno-tecnico.md`

- [x] Registrar o contrato existente do gateway e os bloqueios que a UI preserva.
- [x] Registrar typecheck, Biome e `git diff --check`; explicitar que a chamada fiscal real não ocorreu.

## Verification

- `pnpm typecheck`
- `pnpm exec biome check` nos arquivos TypeScript alterados
- `git diff --check`
