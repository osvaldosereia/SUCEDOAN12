-- Orders must be accepted while customer details are pending; staff completes registration over WhatsApp.
-- Keep operational checkout data required, but do not make name, document, or delivery address a purchase gate.
create or replace function public.enforce_storefront_checkout_basics_v1()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.source, '') <> 'vitrine' then
    return new;
  end if;

  if nullif(btrim(coalesce(new.phone_e164, '')), '') is null
     or nullif(btrim(coalesce(new.payment_method, '')), '') is null
     or nullif(btrim(coalesce(new.delivery_address->>'delivery_date', '')), '') is null then
    raise exception 'required_checkout_data' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_storefront_checkout_basics_v1 on public.orders;
create trigger trg_enforce_storefront_checkout_basics_v1
before insert on public.orders
for each row
execute function public.enforce_storefront_checkout_basics_v1();
