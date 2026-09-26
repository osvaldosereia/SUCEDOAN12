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


create or replace function public.ops_apply_stock_recount_result_v1(
 p_product_id uuid,p_count_id uuid,p_counted_quantity numeric,p_operator_label text default null
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v public.ops_attention%rowtype; v_bling numeric; v_match boolean; v_now timestamptz:=now();
begin
 select * into v from public.ops_attention
 where entity_type='product' and entity_id=p_product_id::text
   and status in ('open','acknowledged')
   and idempotency_key='ops2:stock-recount:'||p_product_id::text
 for update;
 if not found then return jsonb_build_object('tracked',false); end if;
 v_bling:=coalesce((v.evidence->>'bling_physical')::numeric,0);
 v_match:=abs(round(p_counted_quantity,3)-round(v_bling,3))<=0.0001;
 update public.ops_attention set
   evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object(
     'latest_count_id',p_count_id,'latest_counted_quantity',round(p_counted_quantity,3),
     'latest_counted_at',v_now,'latest_operator',left(nullif(trim(coalesce(p_operator_label,'')),''),80),
     'matches_bling_physical',v_match,'automatic_stock_write',false),
   status=case when v_match then 'resolved' else 'open' end,
   resolved_at=case when v_match then v_now else null end,
   resolution=case when v_match then 'Recontagem física atual coincide com o saldo físico do Bling; nenhuma escrita de estoque necessária.' else null end,
   resolution_ref=case when v_match then 'inventory-count:'||p_count_id::text else null end,
   recommended_action=case when v_match then recommended_action else 'Contagem física atual difere do Bling. Classificar a causa (entrada documental, perda, sobra ou outra) antes de regularizar o ERP.' end,
   updated_at=v_now
 where id=v.id;
 return jsonb_build_object('tracked',true,'matches_bling_physical',v_match,'bling_physical',v_bling,'counted_quantity',round(p_counted_quantity,3),'attention_status',case when v_match then 'resolved' else 'open' end,'automatic_stock_write',false);
end; $$;

revoke all on function public.ops_apply_stock_recount_result_v1(uuid,uuid,numeric,text) from public,anon,authenticated;
grant execute on function public.ops_apply_stock_recount_result_v1(uuid,uuid,numeric,text) to service_role;
