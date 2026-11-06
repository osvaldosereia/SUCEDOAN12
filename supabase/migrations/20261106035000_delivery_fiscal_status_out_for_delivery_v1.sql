begin;

alter table public.order_fiscal_controls
  drop constraint if exists order_fiscal_controls_delivery_status_check;

alter table public.order_fiscal_controls
  add constraint order_fiscal_controls_delivery_status_check
  check (
    delivery_status = any (
      array[
        'pending'::text,
        'out_for_delivery'::text,
        'delivered'::text,
        'failed'::text,
        'cancelled'::text,
        'returned'::text
      ]
    )
  );

commit;
