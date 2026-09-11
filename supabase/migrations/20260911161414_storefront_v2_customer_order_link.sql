create or replace function public.customers_link_unclaimed_orders_v2()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform public.link_unclaimed_orders_to_customer_v2(new.id);
  return new;
end;
$$;
revoke all on function public.customers_link_unclaimed_orders_v2() from public,anon,authenticated;

drop trigger if exists customers_link_unclaimed_orders_v2 on public.customers;
create trigger customers_link_unclaimed_orders_v2
after insert or update of primary_whatsapp_e164 on public.customers
for each row execute function public.customers_link_unclaimed_orders_v2();
