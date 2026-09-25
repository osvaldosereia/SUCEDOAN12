-- Dona Antonia Operations 2.0
-- Surface delivery runs in the Control Tower without polling external services.

create or replace function public.get_ops_control_tower_summary_v1()
returns jsonb
language sql
security definer
set search_path=public
stable
as $$
  select jsonb_build_object(
    'generated_at', now(),
    'orders', jsonb_build_object(
      'awaiting', (select count(*) from public.orders where status='storefront_received'),
      'confirmed', (select count(*) from public.orders where status='confirmed'),
      'ready', (select count(*) from public.orders where status='ready'),
      'delivered', (select count(*) from public.orders where status='delivered'),
      'cancelled', (select count(*) from public.orders where status='cancelled')
    ),
    'delivery', jsonb_build_object(
      'returning', (select count(*) from public.order_delivery_return_cases where status='returning'),
      'return_review', (select count(*) from public.order_delivery_return_cases where status='returned_review'),
      'planned_runs', (select count(*) from public.ops_delivery_runs where service_date=(now() at time zone 'America/Cuiaba')::date and status='planned'),
      'active_runs', (select count(*) from public.ops_delivery_runs where service_date=(now() at time zone 'America/Cuiaba')::date and status='dispatched'),
      'active_stops', (select count(*) from public.ops_delivery_stops s join public.ops_delivery_runs r on r.id=s.run_id where r.service_date=(now() at time zone 'America/Cuiaba')::date and r.status='dispatched' and s.status='out_for_delivery')
    ),
    'whatsapp', jsonb_build_object(
      'human_required', (select count(*) from public.conversations where channel='whatsapp' and human_required=true),
      'human_mode', (select count(*) from public.conversations where channel='whatsapp' and mode='human')
    ),
    'inventory', jsonb_build_object(
      'active_products', (select count(*) from public.products where is_active=true),
      'zero_or_negative', (select count(*) from public.products where is_active=true and coalesce(stock,0)<=0),
      'expires_90d', (select count(*) from public.products where is_active=true and validity_date is not null and validity_date between current_date and current_date+90),
      'expired', (select count(*) from public.products where is_active=true and validity_date is not null and validity_date<current_date),
      'count_differences_pending', (select count(*) from public.ops_inventory_counts where reconciliation_state='pending_erp_reconciliation'),
      'incidents_open', (select count(*) from public.ops_inventory_incidents where status in ('open','review'))
    ),
    'payments', jsonb_build_object(
      'captured_unsynced', (select count(*) from public.order_payment_settlements where status in ('captured','needs_review') and bling_sync_state in ('blocked_homologation','pending','failed')),
      'sync_failed', (select count(*) from public.order_payment_settlements where status in ('captured','needs_review') and bling_sync_state='failed')
    ),
    'attention', jsonb_build_object(
      'open', (select count(*) from public.ops_attention where status in ('open','acknowledged')),
      'critical', (select count(*) from public.ops_attention where status in ('open','acknowledged') and priority='critical'),
      'high', (select count(*) from public.ops_attention where status in ('open','acknowledged') and priority='high')
    ),
    'approvals', jsonb_build_object(
      'pending', (select count(*) from public.ops_approvals where status='pending')
    ),
    'printing', jsonb_build_object(
      'pending', (select count(*) from public.ops_print_jobs where status='pending'),
      'failed', (select count(*) from public.ops_print_jobs where status='failed'),
      'claimed', (select count(*) from public.ops_print_jobs where status='claimed'),
      'presented', (select count(*) from public.ops_print_jobs where status='presented'),
      'printed', (select count(*) from public.ops_print_jobs where status='printed')
    )
  );
$$;
