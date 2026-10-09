-- Operacional R02 - Auditoria de FRESCOR de saldo Bling (SOMENTE LEITURA).
-- Não é uma migration; não concede GRANT; não produz pedidos ou estoque.
-- Rodar no Supabase canônico apenas com uma identidade de administração.
-- O tempo observado da mirror não prova que a API Bling está fora do ar,
-- mas uma mirror antiga NÃO garante disponibilidade atual.
WITH policy AS (
 SELECT (metadata->>'ops2_stock_authority') AS source_authority,
        (metadata->>'selected_deposit_id') AS selected_deposit,
        (metadata->>'ops2_stock_cutover_at') AS cutover_at
 FROM public.bling_hub_runtime_v2 WHERE id=1
), per_product AS (
 SELECT stock_source_reason,stock_authority,
  is_active,bling_stock_ready,
  effective_sellable_stock,
  mirror_observed_at,
  selected_deposit_id
 FROM public.ops2_sellable_stock_v1
)
SELECT now() AS audited_at,
 p.source_authority,
 p.selected_deposit,
 count(*) FILTER(WHERE s.is_active)::integer AS active_products,
 count(*) FILTER(WHERE s.is_active AND s.bling_stock_ready)::integer
  AS bling_linked_with_selected_deposit,
 count(*) FILTER(WHERE s.is_active AND s.effective_sellable_stock>0)::integer
  AS with_positive_sellable_stock,
 count(*) FILTER(WHERE s.is_active AND s.mirror_observed_at IS NULL)::integer
  AS active_with_missing_mirror_timestamp,
 count(*) FILTER(WHERE s.is_active AND s.mirror_observed_at <
   now()-interval '1 hour')::integer AS active_mirror_older_than_1h,
 count(*) FILTER(WHERE s.is_active AND s.mirror_observed_at <
   now()-interval '24 hours')::integer AS active_mirror_older_than_24h,
 count(*) FILTER(WHERE s.is_active AND s.mirror_observed_at <
   now()-interval '72 hours')::integer AS active_mirror_older_than_72h,
 count(*) FILTER(WHERE s.is_active AND s.effective_sellable_stock>0 AND
   (s.mirror_observed_at IS NULL OR
    s.mirror_observed_at<now()-interval '24 hours'))::integer
  AS positive_sellable_but_mirror_unverified_24h
FROM per_product s CROSS JOIN policy p
GROUP BY p.source_authority,p.selected_deposit;

-- Decision required: business owner/stock integration must define a maximum
-- acceptable mirror age and a refresh/reconciliation plan. This diagnostic
-- deliberately DOES NOT invent a freshness threshold or silently disable
-- 1,000+ products in production.
