# Storefront Image Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garantir que toda imagem de produto usada pela Vitrine V2 seja WebP quadrada, alvo 320×320 e com no máximo 15 KB.

**Architecture:** O Admin faz a compressão no navegador com Canvas/WebP em um loop de qualidade/dimensão e envia apenas o resultado otimizado para uma Edge Function autenticada que valida tamanho/tipo e grava a variante pública. Para imagens existentes, o Admin oferece processamento em lote resumível; isso evita adicionar biblioteca pesada à vitrine pública.

**Tech Stack:** Browser Canvas, WebP, Supabase Storage, Edge Function autenticada.

**Spec:** `docs/superpowers/specs/2026-09-11-vitrine-v2-admin-simple-design.md`

## Global Constraints

- Limite rígido de arquivo: `15360` bytes.
- Alvo inicial: 320×320.
- Se qualidade mínima ainda exceder 15 KB, reduzir dimensão em passos controlados; não aceitar arquivo acima do limite.
- Processamento pesado fica no Admin, nunca na vitrine pública.
- `service_role` nunca vai ao browser.

---

### Task 1: Compressor determinístico no Admin

**Files:**
- Create: `admin/image-optimize.js`
- Create: `scripts/test-image-contract-v2.mjs`

**Interfaces:**
- `optimizeStorefrontImage(fileOrBlob) -> Promise<{blob,width,height,bytes,mime}>`.

- [ ] **Step 1: Escrever teste de contrato estático exigindo `MAX_BYTES=15360`, WebP e dimensões-alvo**
- [ ] **Step 2: Implementar leitura para `createImageBitmap` com fallback `Image`**
- [ ] **Step 3: Recortar centralmente para quadrado sem distorcer**
- [ ] **Step 4: Renderizar 320×320 e converter com `canvas.toBlob('image/webp', quality)`**
- [ ] **Step 5: Fazer busca de qualidade entre aproximadamente 0.82 e 0.30 até `blob.size <= 15360`**
- [ ] **Step 6: Se ainda exceder, tentar 288, 256, 224 px; falhar claramente se não chegar ao limite**
- [ ] **Step 7: Commit**

### Task 2: Upload autenticado e validação server-side

**Files:**
- Create: `supabase/functions/admin-storefront-images-v1/index.ts`
- Modify: `supabase/config.toml`
- Create: `scripts/test-admin-storefront-images-v1.mjs`

**Interfaces:**
- Action `upload_product_variant` recebe `product_id`, conteúdo WebP e metadados; retorna URL pública/versionada.

- [ ] **Step 1: Testar que payload acima de 15360 bytes é rejeitado**
- [ ] **Step 2: Exigir JWT administrativo e validar `admin_users` no padrão dos endpoints atuais**
- [ ] **Step 3: Validar `content-type=image/webp`, bytes <=15360 e `product_id` existente**
- [ ] **Step 4: Gravar em bucket/path dedicado, por exemplo `storefront/products/<product_id>.webp`**
- [ ] **Step 5: Atualizar campo/metadata da variante da vitrine no produto sem substituir a imagem original**
- [ ] **Step 6: `deno check` e commit**

### Task 3: Integrar ao editor de Produto

**Files:**
- Modify: `admin/products.js`
- Modify: `admin/index.html`

**Interfaces:**
- Ao escolher imagem, `optimizeStorefrontImage()` roda antes de upload.

- [ ] **Step 1: Mostrar preview, dimensão e peso final em KB**
- [ ] **Step 2: Impedir salvar variante >15 KB**
- [ ] **Step 3: Após upload, salvar URL otimizada como `storefront_image_url` ou campo equivalente confirmado pelo schema**
- [ ] **Step 4: Atualizar a linha/lista do produto sem recarregar a página inteira**
- [ ] **Step 5: Commit**

### Task 4: Otimizar imagens existentes em lote

**Files:**
- Modify: `admin/products.js`
- Create: `admin/image-batch.js`

**Interfaces:**
- `runImageBatch({resumeKey, concurrency:2})` processa apenas produtos ativos sem variante válida.

- [ ] **Step 1: Listar produtos sem `storefront_image_url` válida**
- [ ] **Step 2: Baixar original publicamente acessível com CORS; se falhar, registrar item para revisão manual**
- [ ] **Step 3: Processar no máximo 2 imagens simultâneas**
- [ ] **Step 4: Persistir checkpoint em `localStorage` para retomar sem repetir sucesso**
- [ ] **Step 5: Exibir progresso `processados / pendentes / erros`**
- [ ] **Step 6: Validar amostra e depois lote completo**
- [ ] **Step 7: Commit**

### Task 5: Contrato da Vitrine V2

**Files:**
- Modify: `supabase/functions/storefront-v2/index.ts`
- Modify: `vitrine-v2/baskets.js`
- Modify: `vitrine-v2/products.js`

- [ ] **Step 1: Backend retorna `storefront_image_url` como primeira opção**
- [ ] **Step 2: Vitrine não usa imagem original de produto quando a variante existe**
- [ ] **Step 3: Fallback deve ser um placeholder local leve, não a imagem original pesada**
- [ ] **Step 4: Auditoria automatizada: fazer HEAD/GET em uma amostra e falhar se `Content-Length > 15360`**
- [ ] **Step 5: Commit**
