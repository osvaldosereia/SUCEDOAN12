alter table da_next.bling_product_profiles
  add column purchase_cost_exact numeric(12, 4) not null default 0
  check (purchase_cost_exact >= 0);

comment on column da_next.bling_product_profiles.purchase_cost_exact is
  'Custo de compra exato em até quatro casas decimais; fonte de precisão para catálogo importado.';
