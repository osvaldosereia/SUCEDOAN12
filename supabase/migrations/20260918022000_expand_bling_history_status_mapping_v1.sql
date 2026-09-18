begin;

alter table public.bling_history_status_policy
  drop constraint if exists bling_history_status_policy_canonical_status_check;

alter table public.bling_history_status_policy
  add constraint bling_history_status_policy_canonical_status_check
  check (canonical_status in (
    'confirmed','processing','ready','out_for_delivery',
    'delivered','cancelled','returned','ignored'
  ));

alter table public.bling_history_staging_orders
  drop constraint if exists bling_history_staging_orders_canonical_status_check;

alter table public.bling_history_staging_orders
  add constraint bling_history_staging_orders_canonical_status_check
  check (canonical_status in (
    'confirmed','processing','ready','out_for_delivery',
    'delivered','cancelled','returned','ignored'
  ));

comment on column public.bling_history_status_policy.canonical_status is
  'Status local canônico usado ao promover histórico do Bling; ignored nunca é promovido.';

commit;
