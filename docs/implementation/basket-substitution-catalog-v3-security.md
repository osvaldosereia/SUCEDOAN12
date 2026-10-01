# Segurança

- `basket_lot_substitution_products` tem RLS habilitado.
- `anon` e `authenticated` não têm acesso direto à tabela.
- O Admin usa RPCs `SECURITY DEFINER` protegidas por `basket_lot_admin_allowed_v1()`.
- A função de lookup interno não é executável por `authenticated`.
- O catálogo não cria nem ativa lotes; a aprovação e a ativação de venda continuam separadas e manuais.
