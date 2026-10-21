# Administração de produtos · Dona Antônia

Painel independente em `/admin1`, com foco em uma operação de catálogo rápida, direta e responsiva.

## Recursos desta etapa

- Lista responsiva de produtos, com imagem, categoria, SKU, GTIN, preço, estoque e situação.
- Busca por nome, SKU, EAN e marca, filtros por categoria, situação e estoque, e paginação.
- Detalhes fiscais e comerciais do catálogo.
- Cadastro e edição locais com dados comerciais e fiscais, validade, localização, estoque e fornecedor.
- Ativação e desativação explícitas armazenadas somente no navegador.
- Produto sem estoque vendável confirmado não pode ser ativado. A reposição não publica automaticamente um produto inativo.
- O estoque exibido usa a fonte atual de estoque vendável e sua confirmação recente, em vez do campo legado de quantidade.
- Imagens de produto convertidas no navegador para WebP, limitadas a 1.200 px e 30 KB.
- Conferência local de XML de NF-e e rascunhos do produto armazenados apenas no navegador.
- Correspondência conservadora de produto somente por GTIN ou SKU exatos.

## Dados e efeitos

O catálogo é consultado pela Edge Function de leitura `admin1-products-read-v1`. A camada de escrita permanece bloqueada por `ADMIN1_SUPABASE_WRITES_ENABLED = false`; o adaptador recusa qualquer alteração antes de fazer uma requisição. Cadastro, edição, imagem e mudança de status são gravados apenas no `localStorage` deste navegador.

Esta versão não aplica migrations nem implanta Edge Functions e não altera os dados do Supabase ativo ou da loja pública. O workspace local é útil para testar a operação, mas não sincroniza entre navegadores e não persiste no catálogo. XML, correspondências e rascunhos permanecem locais.

## Organização

- `index.html` e `styles.css`: interface e comportamento responsivo.
- `src/app.js`: apresentação e eventos da tela.
- `src/api.js` e `src/public-api.js`: adaptadores de leitura e bloqueio explícito de escrita no Supabase.
- `src/product-availability.js`: regra de ativação por estoque.
- `src/product-management.js`: validações de cadastro e identificadores.
- `src/product-drafts.js`: leitura local do XML e rascunhos.
- `tests/`: testes de regras, chamadas de status e leitura de XML.
- `supabase/functions/admin1-product-status-v1/` e `supabase/migrations/`: proposta futura versionada; não implantada nem aplicada.

## Verificação local

```sh
node --test admin1/tests/*.test.mjs
```
