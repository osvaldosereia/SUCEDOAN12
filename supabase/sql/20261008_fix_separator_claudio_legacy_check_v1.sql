-- Corrige divergencia entre o identificador usado pela vitrine e a regra legada.
-- Na producao: RPC ops2_set_order_separator_v2 aceita 'claudio', mas o CHECK
-- aceitava apenas 'claudenil'. Preservar ambos para nao invalidar historico.
-- Nenhuma linha de pedido/separacao e regravada nesta migration.
begin;
alter table public.order_separation_assignments_v1
  drop constraint if exists order_separation_assignments_v1_separator_key_check;
alter table public.order_separation_assignments_v1
  add constraint order_separation_assignments_v1_separator_key_check
    check (
      separator_key is null or separator_key = any (
        array['jose','claudio','claudenil','kelly','jovenil']::text[]
      )
    );
commit;
