insert into public.product_lifecycle_audit (
  organization_id, product_id, event, actor_type, actor_label,
  previous_active, new_active, previous_expiration_date, new_expiration_date,
  details, created_at
)
select
  p.organization_id,
  p.id,
  'auto_expired_deactivation',
  'system',
  'Sistema · regra de validade',
  true,
  false,
  p.expiration_date,
  p.expiration_date,
  jsonb_build_object('backfilled',true,'stock_after',coalesce(p.stock_quantity,0)),
  coalesce(p.deactivated_at,p.updated_at,now())
from public.products p
where p.active=false
  and p.deactivation_reason='expired'
  and p.expiration_date is not null
  and not exists (
    select 1
      from public.product_lifecycle_audit a
     where a.organization_id=p.organization_id
       and a.product_id=p.id
       and a.event='auto_expired_deactivation'
  );
