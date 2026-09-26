-- Dona Antonia Operations 2.0
-- Read-only queue for physical recount blockers before Bling stock cutover.
-- No automatic ERP stock mutation.

create or replace function public.get_ops_stock_recount_queue_v1()
returns jsonb
language sql
security definer
set search_path=public
stable
as $$
  select jsonb_build_object(
    'count',count(*),
    'high',count(*) filter (where a.priority='high'),
    'normal',count(*) filter (where a.priority='normal'),
    'items',coalesce(jsonb_agg(
      jsonb_build_object(
        'attention_id',a.id,'product_id',p.id,'name',p.name,'gtin',p.gtin,'sku',p.sku,
        'gondola_number',case when p.gondola ~ '^\d+$' then p.gondola::integer else null end,
        'shelf_label',p.shelf,'priority',a.priority,
        'legacy_stock',coalesce((a.evidence->>'legacy_stock')::numeric,p.stock,0),
        'bling_physical',coalesce((a.evidence->>'bling_physical')::numeric,0),
        'bling_virtual',coalesce((a.evidence->>'bling_virtual')::numeric,0),
        'bling_product_id',nullif(a.evidence->>'bling_product_id',''),
        'reconciliation_class',a.evidence->>'reconciliation_class',
        'previous_physical_verification_at',a.evidence->>'previous_physical_verification_at',
        'automatic_stock_write',false
      )
      order by case a.priority when 'critical' then 0 when 'high' then 1 else 2 end,p.name
    ),'[]'::jsonb)
  )
  from public.ops_attention a
  join public.products p on p.id::text=a.entity_id
  where a.status in ('open','acknowledged')
    and a.idempotency_key like 'ops2:stock-recount:%';
$$;

revoke all on function public.get_ops_stock_recount_queue_v1() from public,anon,authenticated;
grant execute on function public.get_ops_stock_recount_queue_v1() to service_role;
