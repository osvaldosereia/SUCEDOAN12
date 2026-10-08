-- Corrige os botoes SEPARADO e FALTOU da vitrine original.
-- ops2_set_order_separation_item_v2 ja usa 'claudio'; o CHECK desta tabela
-- permanecia legado ('claudenil'), causando SQL 23514 / HTTP 500.
-- Preserva ambos valores no historico; nao altera pedido, estoque ou fiscal.
begin;
alter table public.order_separation_items_v1
  drop constraint if exists order_separation_items_v1_changed_by_separator_key_check;
alter table public.order_separation_items_v1
  add constraint order_separation_items_v1_changed_by_separator_key_check
  check (
    changed_by_separator_key is null or changed_by_separator_key = any (
      array['jose','claudio','claudenil','kelly','jovenil']::text[]
    )
  );
commit;
