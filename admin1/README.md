# Administração de produtos · Dona Antônia

Painel independente em `/admin1`, com foco em uma operação de catálogo rápida, direta e responsiva.

## Recursos desta etapa

- Lista responsiva de produtos, com imagem, categoria, SKU, GTIN, preço, estoque e situação.
- Busca por nome, SKU, EAN e marca, filtros por categoria, situação e estoque, e paginação.
- Detalhes fiscais e comerciais do catálogo.
- Ativação e desativação explícitas de produtos.
- Produto sem estoque vendável confirmado não pode ser ativado. A reposição não publica automaticamente um produto inativo.
- O estoque exibido usa a fonte atual de estoque vendável e sua confirmação recente, em vez do campo legado de quantidade.
- A migração `20261021140000_admin1_product_availability.sql` desativa produtos quando o espelho atual do estoque confirma saldo vendável zero; espelho ausente ou antigo não é tratado como estoque zero.
- Conferência local de XML de NF-e e rascunhos do produto armazenados apenas no navegador.
- Correspondência conservadora de produto somente por GTIN ou SKU exatos.

## Dados e efeitos

O catálogo é consultado pela Edge Function `admin1-products-read-v1`. A mudança de situação usa exclusivamente `admin1-product-status-v1` e atualiza apenas `is_active` e os timestamps de edição. A função verifica estoque vendável confirmado antes de ativar. A migração usa o espelho de estoque que o site já mantém; não cria uma nova sincronização com o Bling e não reativa produtos automaticamente.

As mudanças desta etapa estão preparadas em código e testes, sem implantação da Edge Function, aplicação da migração ou alterações nos dados do projeto Supabase ativo. XML, correspondências e rascunhos não gravam no banco.

## Organização

- `index.html` e `styles.css`: interface e comportamento responsivo.
- `src/app.js`: apresentação e eventos da tela.
- `src/api.js` e `src/public-api.js`: adaptadores de leitura e mudança explícita de situação.
- `src/product-availability.js`: regra de ativação por estoque.
- `src/product-management.js`: validações de cadastro e identificadores.
- `src/product-drafts.js`: leitura local do XML e rascunhos.
- `tests/`: testes de regras, chamadas de status e leitura de XML.
- `supabase/functions/admin1-product-status-v1/`: gravação limitada ao status do produto.
- `supabase/migrations/`: regra do produto ficar inativo ao zerar o estoque.

## Verificação local

```sh
node --test admin1/tests/*.test.mjs
```
