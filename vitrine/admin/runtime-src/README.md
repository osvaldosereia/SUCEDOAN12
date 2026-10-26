# Vitrine Admin runtime

O navegador executa `vitrine/admin/admin-runtime.js`, gerado pela concatenação ordenada dos fragmentos desta pasta. Eles compartilham a mesma sessão para preservar os fluxos de Pedidos e as integrações existentes.

## Fragmentos

- `01-core-navigation`: navegação, orçamentos e ponte Meta/PapoAI.
- `02-order-support`: consulta fiscal de Pedidos e autenticação compartilhada do Admin.
- `03-operations`: lista simples de produtos e cestas.
- `04-products`: formulário de produtos e consulta de ocorrências.
- `05-order-stock-review`: registro de itens avariados no fluxo de retorno de Pedidos.
- `07-customers`: edição de clientes e diagnóstico Bling, Meta e Supabase.
- `08-orders-detail` e `09-bootstrap`: detalhe, fiscal e operações preservadas de Pedidos.

Cada fragmento contém declarações completas e é concatenado pelo gerador. Não o carregue diretamente no HTML.

## Build

```sh
node scripts/build-vitrine-admin-runtime.mjs
node scripts/build-vitrine-admin-runtime.mjs --check
```
