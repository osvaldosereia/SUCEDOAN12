# Verificação ao vivo — Admin V3 + Vitrine V3

Data: 2026-09-11

## CI

Workflow `Testar Admin V3 e Vitrine V3`, run `34647744701`: sucesso.

Passaram:
- contrato Vitrine V3;
- contrato catálogo V3;
- contrato Admin V3;
- validação JavaScript V3;
- compilação das Edge Functions V3.

## Supabase

Edge Functions implantadas em produção:
- `catalog-v3`, versão 1, `verify_jwt=false`;
- `admin-v3-api`, versão 1, `verify_jwt=false`.

A ausência de JWT no Admin V3 preserva a decisão explícita já adotada para o Admin oficial. Ambas as funções restringem CORS aos domínios `donaantonia.com.br` e `www.donaantonia.com.br`.

## Smoke tests reais

Executados via `pg_net` contra os endpoints implantados.

Respostas HTTP 200 confirmadas para:
- `catalog-v3?resource=health`;
- `catalog-v3?resource=home`;
- categoria `HIGIENE` com lote de 12;
- busca pública por `arroz`;
- composição da cesta `Economica Bonini`;
- `admin-v3-api` health;
- dashboard;
- storefront;
- categorias;
- produtos;
- cestas;
- pedidos;
- clientes.

Teste de origem não permitida retornou HTTP 403 `origin_not_allowed`.

## Dados observados no smoke

- 9 cestas ativas no catálogo;
- 731 produtos ativos no resumo do Admin;
- 39 categorias V3 configuradas;
- a cesta `Economica Bonini` retornou composição e estoque dos itens;
- o catálogo por categoria e a busca retornaram produtos reais com preço, estoque e imagem.

Nenhum pedido de teste foi criado e nenhuma mutação comercial foi executada durante esta verificação.
