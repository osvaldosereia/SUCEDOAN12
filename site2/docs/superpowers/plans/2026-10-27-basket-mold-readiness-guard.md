# Guarda de prontidão das alternativas do Flow — plano

> Execução inline no projeto; seguir o limite de oito alternativas do emissor. Não rodar testes automatizados nem fazer alterações remotas.

**Objetivo:** impedir que uma etapa alterada do molde retenha uma alternativa ativa/WhatsApp sem foto, preço ou nome válidos e antecipar o limite de oito alternativas na interface.

**Arquitetura:** manter validação autoritativa em `saveAdminBasketMoldOptions()` usando os detalhes atuais de produto; complementar o editor cliente com uma checagem rápida baseada nas flags já projetadas. Preservar opções inativas/desabilitadas fora da contagem do Flow.

**Spec:** `docs/superpowers/specs/2026-10-27-basket-mold-readiness-guard-design.md`.

## Restrições

- Alterar somente a etapa editada; não bloquear correções em outras etapas.
- Opção ativa e habilitada para WhatsApp deve cumprir `productIsReady()` antes de salvar.
- Máximo de 8 opções ativas/habilitadas para WhatsApp por etapa; o servidor continua autoritativo.
- Não corrigir dados do Supabase por SQL, não publicar Flow, não enviar WhatsApp e não alterar Bling.
- Não adicionar nem executar testes automatizados.

## Tarefas

### Task 1: Revalidar todas as opções da etapa alterada

**Arquivo:** `src/lib/supabase/admin-basket-molds.ts`.

- [x] Estender o resultado interno de cada `getAdminProductDetail()` com `requiredForFlow` calculado por `active && whatsappActive`.
- [x] Rejeitar com `product_not_ready` qualquer opção nova inelegível e qualquer opção retida que ainda esteja ativa/WhatsApp mas não passe em `productIsReady()`.
- [x] Continuar contando somente `eligible` para exigir ao menos uma opção e impor o teto de oito.
- [x] Confirmar pela revisão do fluxo que itens inativos/desabilitados continuam removíveis e não contam como elegíveis.

### Task 2: Impedir a nona opção no editor

**Arquivo:** `src/app/(admin)/cestas/[basketId]/mold-editor.tsx`.

- [x] Antes de validar um novo produto, contar as opções com `active === true && whatsappActive !== false` na etapa selecionada; estado desconhecido é contado conservadoramente até a RPC informar a flag.
- [x] Se a contagem for oito, mostrar orientação para retirar uma alternativa ativa/WhatsApp antes de adicionar outra; não chamar `validateBasketMoldProductAction()`.
- [x] Atualizar a mensagem `product_not_ready` para orientar correção do cadastro ou remoção da opção que não passa no Flow.

### Task 3: Registrar evidência e verificar localmente

**Arquivos:** especificação, plano e `docs/planning/implementation-ledger.md`.

- [x] Registrar o snapshot de 27/10/2026 (5 cestas ativas, 118 posições, 97 com alternativa pronta, 21 sem alternativa pronta — 3 sem produto ativo e 18 somente com produtos desabilitados no WhatsApp —, 203 opções prontas, zero acima do limite e zero opção ativa/WhatsApp sem os requisitos estáticos verificados). O snapshot anterior de 93/25/195 foi substituído após nova consulta agregada.
- [x] Registrar que a alteração protege somente edições futuras e não corrige automaticamente as 21 posições pendentes.
- [x] Executar `pnpm typecheck`, `pnpm exec biome check 'src/lib/supabase/admin-basket-molds.ts' 'src/app/(admin)/cestas/[basketId]/mold-editor.tsx'` e `git diff --check`.
- [x] Rever o diff; confirmar que nenhuma ação remota, teste automatizado ou mudança não relacionada foi incluída.
