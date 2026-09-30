# Balanço EAN com Cadastro Automático Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar `Estoque > Balanço` em um fluxo mobile rápido por câmera/EAN que resolve produtos conhecidos, recupera produtos inativos, cadastra EANs novos com evidência interna/Bling/foto, atualiza gôndola e validade e sincroniza o saldo oficial pelo fluxo canônico do Bling.

**Architecture:** O frontend continua no `vitrine/admin/index.html`, mas toda decisão de produto/estoque fica no gateway canônico `admin-products-live-v1`. O backend ganha um módulo interno focado em balanço para resolver EAN, preparar produto desconhecido e confirmar contagem; A4 e scanner passam a compartilhar a mesma semântica de commit. A imagem usa `product-image-openai-v1` já implantada, sem nova Edge Function e sem novo motor de estoque.

**Tech Stack:** HTML/CSS/JavaScript sem bundler, Supabase Edge Functions/Deno TypeScript, PostgreSQL/Supabase, Bling Hub existente, OpenAI image pipeline existente.

**Spec:** `docs/superpowers/specs/2026-09-30-balance-ean-auto-registration-design.md`

## Global Constraints

- `Bling` permanece autoridade oficial quando `ops2_stock_authority = bling`.
- Não reativar Edge Functions aposentadas e não criar nova Edge Function para a feature.
- `GTIN` exato é a identidade primária; matching aproximado por nome nunca cria vínculo automático.
- Produto novo pode existir operacionalmente incompleto, mas não pode ser publicado com preço zero, identidade conflitante ou vencido.
- NCM/CEST não podem ser inventados por IA.
- Reutilizar `product-image-openai-v1` para upload da foto original e padronização.
- Scanner e A4 devem terminar no mesmo caminho de persistência/estoque.
- A câmera é o caminho principal no celular; busca manual por nome/EAN continua sempre disponível.
- Nenhuma operação de imagem pode bloquear a próxima leitura do funcionário.

## Review Focus

- EAN lido duas vezes ou por dois operadores ao mesmo tempo não pode duplicar produto.
- Produto inativo por motivo não relacionado a vencimento não pode ser republicado cegamente.
- Produto com múltiplos lotes ativos não pode receber validade global silenciosamente.
- Falha/timeout no Bling não pode ser mostrada como balanço concluído.
- Navegador sem `BarcodeDetector` deve continuar funcional via busca manual e captura alternativa.

---

### Task 1: Contrato e módulo canônico do balanço

**Files:**
- Create: `supabase/functions/admin-products-live-v1/inventory-balance.ts`
- Modify: `supabase/functions/admin-products-live-v1/index.ts`
- Create: `scripts/test-balance-ean-contract.mjs`

**Interfaces:**
- Consumes: cliente Supabase do gateway; callbacks existentes de lookup/vínculo/estoque Bling e lotes.
- Produces: `resolveInventoryBalanceEan(ctx, input)`, `prepareInventoryUnknown(ctx, input)`, `commitInventoryBalance(ctx, input)`, `inventoryBalanceStatus(ctx, input)`.

- [ ] **Step 1: Write the failing contract test**

Criar `scripts/test-balance-ean-contract.mjs` para exigir no source:
- as quatro ações `inventory_balance_resolve_ean`, `inventory_balance_prepare_unknown`, `inventory_balance_commit`, `inventory_balance_status`;
- inclusão das ações de escrita na allowlist correta;
- import do módulo `./inventory-balance.ts`;
- ausência de chamada às funções aposentadas `inventory-product-research-v1`, `inventory-fast-balance-v3` e `product-name-normalizer-v1`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-balance-ean-contract.mjs`
Expected: FAIL porque as ações/módulo ainda não existem.

- [ ] **Step 3: Create the module shell and route actions**

`inventory-balance.ts` deve concentrar normalização de EAN, readiness comercial, resolução de fonte, criação idempotente por GTIN e o contrato de commit. `index.ts` apenas autentica, aplica role e roteia as quatro ações.

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/test-balance-ean-contract.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

`git add supabase/functions/admin-products-live-v1 scripts/test-balance-ean-contract.mjs && git commit -m "feat(balance): add canonical inventory balance contract"`

### Task 2: Resolver EAN e cadastrar produto desconhecido com segurança

**Files:**
- Modify: `supabase/functions/admin-products-live-v1/inventory-balance.ts`
- Modify: `supabase/functions/admin-products-live-v1/index.ts`
- Modify: `scripts/test-balance-ean-contract.mjs`

**Interfaces:**
- `inventory_balance_resolve_ean` input: `{ ean, operator? }`.
- Output conhecido: `{ state:"known", product, commercial_readiness, source:"products" }`.
- Output identificado fora de `products`: `{ state:"created"|"recovered", product, commercial_readiness, sources:[...] }`.
- Output não identificado: `{ state:"photo_required", ean, unknown_id, research_summary }`.

- [ ] **Step 1: Extend failing tests**

Adicionar assertions de source/contract para exigir:
- lookup inicial em `products.gtin` sem filtrar `is_active`;
- consulta de `purchase_xml_items` por `commercial_gtin` e `tax_gtin`;
- consulta de `product_fiscal_evidence.gtin`;
- uso do caminho de Bling por GTIN exato;
- `products_gtin_key` tratado como corrida idempotente;
- `inventory_unknown_eans` usado quando não houver identidade suficiente.

- [ ] **Step 2: Implement resolution order**

Implementar precedência por campo conforme a spec: cadastro canônico > Bling exato > XML/evidência > foto/pendente. Nunca usar similaridade de nome para criar vínculo.

- [ ] **Step 3: Implement provisional canonical product creation**

Produto novo recebe `source_system="balance_auto_registration"`, `is_active=false` até readiness comercial, metadados de fontes/confiança e GTIN único. Em conflito de insert, reler o produto vencedor pelo GTIN.

- [ ] **Step 4: Implement commercial readiness**

Readiness precisa exigir: nome não-placeholder, GTIN, `price>0`, categoria canônica, imagem utilizável, não vencido e sem conflito de identidade. Retornar lista explícita de bloqueadores para a UI.

- [ ] **Step 5: Run tests**

Run: `node scripts/test-balance-ean-contract.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

`git add supabase/functions/admin-products-live-v1 scripts/test-balance-ean-contract.mjs && git commit -m "feat(balance): resolve and register products by ean"`

### Task 3: Unificar commit de estoque, gôndola e validade

**Files:**
- Modify: `supabase/functions/admin-products-live-v1/inventory-balance.ts`
- Modify: `supabase/functions/admin-products-live-v1/index.ts`
- Modify: `scripts/test-balance-ean-contract.mjs`

**Interfaces:**
- `inventory_balance_commit` input: `{ product_id, ean, counted_quantity, gondola_number, expiration_date?, lot_id?, operator, source }`.
- Output: `{ product, count, location, validity, stock:{ state, before, counted, difference, job_id?, verified }, commercial_readiness }`.

- [ ] **Step 1: Add failing stock/lot contract tests**

Exigir no source:
- validação `gondola_number` 1..9999;
- criação/reativação da gôndola existente;
- registro em `ops_inventory_counts`/rotina canônica já existente;
- caminho de set stock no Bling quando autoridade = `bling`;
- sucesso somente após verificação do job/saldo;
- estados `matched`, `stock_synced`, `stock_synced_review_pending`, `sync_error`;
- proteção explícita para múltiplos lotes ativos.

- [ ] **Step 2: Implement location + validity rules**

Aplicar gôndola sem destruir `shelf` desnecessariamente. Para validade: atualizar global apenas sem lotes; um lote ativo pode ser atualizado; múltiplos lotes retornam `lot_selection_required`; produto vencido nunca vira comercialmente ativo.

- [ ] **Step 3: Implement unified stock write**

Reusar o Hub/caminho que já cria vínculo Bling quando necessário e escreve saldo. Não considerar concluído se o job não foi verificado. Manter trilha de reconciliação quando a contagem divergir do saldo anterior.

- [ ] **Step 4: Route legacy `balance_confirm` through the new commit**

Preservar compatibilidade temporária da ação existente, mas fazer o corpo delegar ao novo commit para evitar duas semânticas.

- [ ] **Step 5: Run tests**

Run: `node scripts/test-balance-ean-contract.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

`git add supabase/functions/admin-products-live-v1 scripts/test-balance-ean-contract.mjs && git commit -m "feat(balance): unify inventory commit with bling"`

### Task 4: Fazer A4 usar o mesmo commit canônico

**Files:**
- Modify: `supabase/functions/admin-products-live-v1/index.ts`
- Modify: `scripts/test-balance-ean-contract.mjs`

**Interfaces:**
- `inventory_sheet_apply` continua com o contrato de UI atual, mas cada linha aprovada chama a mesma rotina de `inventory_balance_commit` com `source:"sheet_a4"`.

- [ ] **Step 1: Add failing A4 delegation test**

Exigir que `inventorySheetApply` use a rotina canônica e não replique uma escrita de estoque independente.

- [ ] **Step 2: Replace duplicate persistence path**

Manter estados/retry atuais da folha, porém mapear o resultado do commit canônico para os estados de linha existentes (`applied`/`error`) e preservar releitura/correção.

- [ ] **Step 3: Run tests**

Run: `node scripts/test-balance-ean-contract.mjs`
Expected: PASS.

- [ ] **Step 4: Commit**

`git add supabase/functions/admin-products-live-v1 scripts/test-balance-ean-contract.mjs && git commit -m "refactor(balance): share commit between scanner and a4"`

### Task 5: Nova UX mobile com duas abas e câmera prioritária

**Files:**
- Modify: `vitrine/admin/index.html`
- Create: `scripts/test-balance-mobile-ui.mjs`

**Interfaces:**
- Frontend chama somente `inventory_balance_resolve_ean`, `inventory_balance_prepare_unknown`, `inventory_balance_commit`, `inventory_balance_status` para o fluxo novo.
- Câmera usa `navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ideal:"environment"} } })`.
- Detector usa `BarcodeDetector` para `ean_13`, `ean_8`, `upc_a`, `upc_e` quando disponível.

- [ ] **Step 1: Write failing UI contract test**

Exigir:
- subabas `Leitor EAN` e `Folhas A4`;
- elemento `<video>` com `playsinline` e camera traseira;
- busca manual única por nome/EAN;
- campos estoque, gôndola e validade no card do produto;
- botão `Salvar e próximo`;
- fallback visível quando `BarcodeDetector` não existir;
- fluxo A4 preservado.

- [ ] **Step 2: Split the existing Balance presentation into sub-tabs**

`Leitor EAN` vira default. `Folhas A4` contém toda a UI de foto/QR já existente. `Avaria / Vencido / Retorno` permanece ação separada e não polui o fluxo normal.

- [ ] **Step 3: Implement live camera lifecycle**

Ao entrar em `Leitor EAN`, iniciar câmera traseira. Parar tracks quando sair da aba/página. Após leitura válida, aplicar debounce por EAN, pausar reconhecimento enquanto o card está em edição e retomar após `Salvar e próximo`.

- [ ] **Step 4: Implement manual search fallback**

Campo aceita nome ou EAN; sugestões usam endpoint existente de produtos ou uma busca estreita adicionada ao gateway. Selecionar resultado deve abrir exatamente o mesmo card do scanner.

- [ ] **Step 5: Implement known-product card**

Mostrar foto, nome, EAN, status, estoque oficial, gôndola atual e validade. Pré-preencher gôndola/validade; quantidade recebe foco operacional. Botões e campos devem caber em uma mão no mobile.

- [ ] **Step 6: Run UI contract test**

Run: `node scripts/test-balance-mobile-ui.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

`git add vitrine/admin/index.html scripts/test-balance-mobile-ui.mjs && git commit -m "feat(balance): add mobile camera inventory flow"`

### Task 6: Produto novo, foto real e imagem IA sem bloquear a contagem

**Files:**
- Modify: `vitrine/admin/index.html`
- Modify: `supabase/functions/admin-products-live-v1/inventory-balance.ts`
- Modify: `scripts/test-balance-mobile-ui.mjs`
- Modify: `scripts/test-balance-ean-contract.mjs`

**Interfaces:**
- `inventory_balance_prepare_unknown` garante `product_id` provisório e retorna `{ product_id, photo_required, commercial_readiness }`.
- Upload da foto usa `product-image-openai-v1` multipart `{ product_id, file }`.
- Padronização usa `product-image-openai-v1` JSON `{ event:"standardize", product_id }`.

- [ ] **Step 1: Add failing unknown-product tests**

Exigir estados visíveis `Pesquisando`, `Produto novo`, `Foto enviada`, `Cadastro salvo`, `Imagem preparando`, `Concluído/pendente`; garantir que `Salvar e próximo` não dependa do término da padronização.

- [ ] **Step 2: Implement unknown card**

Quando resolver retornar `photo_required`, oferecer `Tirar foto do produto` como ação principal, manter EAN travado e permitir preencher estoque/gôndola/validade antes da imagem final.

- [ ] **Step 3: Upload original and persist immediately**

Após upload original com sucesso, usar a própria foto como imagem operacional temporária. O cadastro/contagem já pode ser confirmado.

- [ ] **Step 4: Start standardization separately**

Disparar padronização e refletir `image_ai_status`; erro de IA não desfaz cadastro/contagem. Produto permanece fora da vitrine até readiness comercial se faltar preço/categoria/imagem válida.

- [ ] **Step 5: Run tests**

Run: `node scripts/test-balance-ean-contract.mjs && node scripts/test-balance-mobile-ui.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

`git add vitrine/admin/index.html supabase/functions/admin-products-live-v1 scripts && git commit -m "feat(balance): register unknown products from camera"`

### Task 7: Implantação e verificação operacional

**Files:**
- Modify if needed: `docs/projects/dona-antonia-operations-2/HANDOFF.md`
- No schema migration expected unless implementation proves an existing required field/index is absent.

**Interfaces:**
- Production Edge Function: `admin-products-live-v1`.
- Existing image function remains `product-image-openai-v1`.

- [ ] **Step 1: Run the complete static suite**

Run: `node scripts/test-balance-ean-contract.mjs && node scripts/test-balance-mobile-ui.mjs`
Expected: PASS.

- [ ] **Step 2: Deploy `admin-products-live-v1` with all source files**

Deploy `index.ts` + `inventory-balance.ts` preserving the function's current JWT/auth configuration.

- [ ] **Step 3: Read-only database verification**

Confirmar:
- `products.gtin` continua unique;
- runtime permanece `ops2_stock_authority='bling'`;
- `inventory_unknown_eans` registra um EAN de teste controlado apenas se o teste for explicitamente escolhido; caso contrário validar estrutura sem inserir dado;
- nenhum produto foi duplicado por GTIN.

- [ ] **Step 4: Controlled functional smoke tests**

Executar sem cliente real:
1. EAN conhecido ativo: resolver, abrir card, não salvar estoque de produção sem intenção explícita;
2. EAN conhecido inativo: confirmar bloqueadores/readiness sem publicação indevida;
3. busca manual por nome/EAN;
4. navegador com câmera: permissionamento/início/parada;
5. fallback sem `BarcodeDetector`;
6. fluxo A4 abre e continua operacional.

- [ ] **Step 5: Verify logs after smoke tests**

Checar logs do gateway por 4xx/5xx, timeout de Bling e erros de import/módulo. Corrigir antes de considerar concluído.

- [ ] **Step 6: Update handoff**

Registrar versão implantada, testes executados, limitações físicas ainda pendentes e caminho de rollback.

- [ ] **Step 7: Commit docs**

`git add docs/projects/dona-antonia-operations-2/HANDOFF.md && git commit -m "docs(balance): record camera balance rollout"`
