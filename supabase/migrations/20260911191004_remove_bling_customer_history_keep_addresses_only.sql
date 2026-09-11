-- Escopo final solicitado: importar apenas enderecos dos cadastros do Bling.
-- O historico de compras criado durante a avaliacao foi removido.

drop table if exists public.bling_sales_history_items;
drop table if exists public.bling_sales_history;
