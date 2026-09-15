begin;

alter table public.orders
  drop constraint if exists orders_payment_method_check;

alter table public.orders
  add constraint orders_payment_method_check
  check (
    payment_method is null
    or payment_method in (
      'pix',
      'cash',
      'debit_card',
      'credit_card',
      'food_card',
      'meal_card'
    )
  );

comment on column public.orders.payment_method is
  'Forma de pagamento na entrega: pix, cash, debit_card, credit_card, food_card ou meal_card.';

commit;
