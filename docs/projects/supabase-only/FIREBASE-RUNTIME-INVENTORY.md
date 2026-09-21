# Firebase Runtime Inventory — Dona Antônia

Checkpoint: 2026-09-21

Escopo: somente Dona Antônia no repositório `SUCEDOAN12`. Referências de Caneca Fácil e do App Dona Antônia isolado não fazem parte desta migração.

## Já migrado / protegido na Rodada 1

- `supabase/functions/inventory-fast-v1/index.ts` — Supabase-only; publicado em produção.
- `supabase/functions/inventory-fast-balance-v3/index.ts` — Supabase-only; publicado em produção.
- `supabase/functions/product-image-openai-grid18-v1/*` — sem consulta Firebase live; publicado em produção.
- `supabase/functions/product-image-openai-v2/index.ts` — sem consulta Firebase live; publicado em produção.
- `supabase/functions/admin-products-live-v1/index.ts` — API administrativa consolidada e autenticada; publicado em produção.
- `validades/validades-supabase-v1.js` — implementação Supabase-only pronta na branch.

## Rodada 2 — dependências ativas prioritárias

### Cadastro rápido
Entrada ativa: `cadastro/index.html`.

Arquivos com dependência Firebase/Make:
- `cadastro/cadastro-v10.js`
- `cadastro/cadastro-taxonomia-v1.js`
- `cadastro/product-edit-controls.js`

Versões antigas encontradas:
- `cadastro/cadastro-v7.js`
- `cadastro/cadastro-v8.js`

Regra: migrar a entrada ativa; versões antigas devem ser marcadas como legado e não receber nova lógica.

### Cestas rápidas
Entrada ativa: `cesta-mobile/index.html`.
- `cesta-mobile/cesta-mobile.js` lê produtos via serviço Firebase.

Regra: catálogo e persistência canônica passam para Supabase (`products`, `basket_templates`, `basket_template_items`). GitHub JSON deixa de ser fonte de verdade.

### Kits
Entrada ativa: `kit-mobile/index.html`.
- `kit-mobile/kit-app-v3.js` lê catálogo do Firebase.
- `kit-mobile/kit-manager-v1.js` ainda contém configuração Firebase.
- `kit-mobile/kit-instagram-queue.js` lê produtos do Firebase.

Versão antiga:
- `kit-mobile/kit-app-v2.js`.

Regra: produto sempre vem de Supabase; recursos de publicação/IA permanecem pausados até revisão posterior.

## Rodada 3 — legado operacional Dona Antônia

### Contagem
- `contagem/contagem.js`
- `contagem/contagem-resultados-v2.js`
- `contagem-v2/config.js`

O modo rápido novo já usa Supabase. A rodada deve verificar qual UI antiga ainda é alcançável e retirar fallback/config Firebase.

### Produção/Admin legado
- `producao-v2/js/config.js`
- `producao-v2/js/nfe-import-save-fix.js`
- `producao-v2/js/duplicate-product.js`
- `producao-v2/js/direct-product-save.js`
- `producao/catalog-sync-admin.js`
- `producao/compra-rapida-admin.js`
- `producao/pedido.html`

Há também arquivos de canecas/Make dentro de `producao-v2`; eles devem ser separados do escopo Dona Antônia antes de qualquer remoção.

### Site e ferramentas auxiliares
- `site/compra-rapida-v2.js`
- `orcamento/index.html`
- `estoque.html`

## Rodada 4 — gate zero Firebase

Buscar no runtime Dona Antônia por:
- `firebaseio.com`
- `firebaseUrl`
- `DEFAULT_FIREBASE`
- `FIREBASE_DATABASE_URL`
- chamadas `.json` contra RTDB
- workflows/scripts de sincronização Firebase

Cada ocorrência restante deve ser classificada como:
1. runtime ativo — bloqueia desligamento;
2. código legado não referenciado — arquivar/remover;
3. documento/teste histórico — permitido;
4. outro projeto (Caneca Fácil/App isolado) — fora do escopo.

O gate final só passa quando a categoria 1 for zero.
