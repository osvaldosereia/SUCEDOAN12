-- Arquivo de planejamento, não executar automaticamente no Supabase existente.
-- Valor interno exclusivo do admin: nunca incluir em views nem consultas de vitrine.
alter table da_next.basket_sizes
  add column if not exists private_adjustment_cents bigint not null default 0
  check (private_adjustment_cents >= 0);
-- Total público = soma de itens escolhidos + ajuste privado no backend.
-- Futuro servidor precisa revalidar em transação o total retornado pela cotação.
