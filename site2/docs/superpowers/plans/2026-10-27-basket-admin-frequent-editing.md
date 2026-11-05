# Edição frequente de cestas no Admin — Plano

> **Para execução:** implementar inline com `superpowers:executing-plans`; cada item usa checkbox. Testes automatizados estão excluídos por instrução do projeto.

**Objetivo:** permitir ajustar no Admin os campos que afetam a composição mostrada no Flow sem alterar preço/foto do cadastro de produto.

**Arquitetura:** ampliar o editor e o adapter `server-only`, usando o gateway autenticado já ativo `admin-basket-molds-v1?action=save` e o writer `admin_save_basket_mold_v3`; não criar schema nem função nova.

**Tecnologias:** Next.js App Router, Server Actions, TypeScript, Supabase SSR, Edge Function e RPC existentes, Biome.

**Design:** `docs/superpowers/specs/2026-10-27-basket-admin-frequent-editing-design.md`.

## Restrições globais

- Projeto Supabase canônico: `ssbesxgaijknwsjbsbcz`.
- Revalidar sessão, papel e revisão; não aceitar metadados nem campos financeiros extras do browser.
- Preservar categorias, subcategorias, regras condicionais, quantidade legada e metadados server-side.
- O cliente escolhe quantidade `0..6` no Flow; não oferecer campo para `basket_mold_positions.quantity`, que o Flow não lê.
- Nenhuma ativação automática de produtos; nenhuma publicação/envio Meta, escrita Bling ou emissão fiscal.

## Foco de revisão

- Snapshot antigo: rejeitar e manter o rascunho com orientação para atualizar. Etapas novas/removidas são permitidas dentro do limite; cesta vazia não é.
- Quantia interna negativa, malformada, fracionada em menos de centavos ou acima do limite financeiro: rejeitar antes do gateway.
- Chaves de etapa duplicadas/malformadas e alternativas duplicadas na mesma etapa: rejeitar. IDs são chaves temporárias do rascunho; apenas metadados de posições encontradas no molde atual podem ser preservados, e IDs/chaves do browser não são enviados à RPC.
- Metadados, categoria, regra condicional ou preço de produto alterado pelo browser: ignorar e reconstruir a partir da leitura autenticada atual.
- Produto que deixa de ser elegível durante a edição: bloquear salvamento da posição alterada; manter a tela com dados digitados.

---

### Task 1: Editar a configuração efetiva da cesta

**Arquivos:**
- Modificar `src/lib/supabase/admin-basket-molds.ts`
- Modificar `src/app/(admin)/cestas/[basketId]/mold-editor.tsx`
- Modificar `src/app/globals.css`
- Modificar `docs/planning/implementation-ledger.md`

**Interface:** `SaveBasketMoldInput` recebe `basketId`, `revision`, nome, `hiddenAdjustmentCents` e a lista ordenada de posições (`positionId`, `label`, `productIds`). Não recebe preço, categoria, quantidade legada, conditional rule, operador ou metadata.

- [x] Validar no adapter nome, rótulos, centavos inteiros, limite financeiro, chaves UUID das etapas e IDs de produtos; aceitar etapas novas/removidas sem aceitar etapas vazias ou opções novas inelegíveis.
- [x] Usar a ordem enviada pelo Admin para reordenar etapas e opções; reconstruir quantidades legadas e metadados da leitura server-side.
- [x] Enviar nome, acréscimo fixo e posições validadas ao writer existente; preservar configuração condicional e campos de vitrine lidos no servidor.
- [x] Adicionar à tela edição de nome, acréscimo interno, rótulos, inclusão/remoção de etapas e controles acessíveis para subir/descer etapas e alternativas; incluir link para abrir o produto quando WhatsApp estiver desabilitado.
- [x] Explicar a seleção de quantidade `0..6` do cliente e alertar que Flow aberto deve ser reiniciado após edição.
- [x] Verificar com `pnpm typecheck`, Biome focalizado e `git diff --check`; não criar/executar testes automatizados.
- [x] Atualizar o ledger e commit do trabalho no branch atual.
