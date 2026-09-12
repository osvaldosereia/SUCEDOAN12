create index if not exists whatsapp_direct_config_account_idx
  on public.whatsapp_direct_config(whatsapp_account_id)
  where whatsapp_account_id is not null;

create index if not exists whatsapp_direct_events_customer_idx
  on public.whatsapp_direct_events(customer_id,created_at desc)
  where customer_id is not null;

create index if not exists whatsapp_direct_events_order_idx
  on public.whatsapp_direct_events(order_id,created_at desc)
  where order_id is not null;
