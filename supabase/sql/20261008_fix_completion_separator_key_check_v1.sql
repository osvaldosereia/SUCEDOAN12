-- Fecha a terceira incompatibilidade 'claudio' vs 'claudenil' da separacao.
-- A selecao e a marcacao ja usam 'claudio'; a conclusao mantinha CHECK legado.
-- Apenas a constraint, nenhum pedido/estoque/nota e modificado.
begin;
alter table public.order_separation_completions_v1
  drop constraint if exists order_separation_completions_v1_separator_key_check;
alter table public.order_separation_completions_v1
  add constraint order_separation_completions_v1_separator_key_check
  check(separator_key is null or separator_key = any(
    array['jose','claudio','claudenil','kelly','jovenil']::text[]
  ));
commit;
