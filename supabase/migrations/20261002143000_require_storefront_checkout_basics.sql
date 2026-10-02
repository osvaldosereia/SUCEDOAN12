-- Novos pedidos da vitrine precisam nascer prontos para atendimento e entrega.
-- Não altera pedidos antigos.

create or replace function public.enforce_storefront_checkout_basics_v1()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_customer_complete boolean := false;
begin
  if coalesce(new.source, '') <> 'vitrine' then
    return new;
  end if;

  if nullif(btrim(coalesce(new.phone_e164, '')), '') is null
     or nullif(btrim(coalesce(new.payment_method, '')), '') is null
     or nullif(btrim(coalesce(new.delivery_address->>'street', '')), '') is null
     or nullif(btrim(coalesce(new.delivery_address->>'number', '')), '') is null
     or nullif(btrim(coalesce(new.delivery_address->>'district', '')), '') is null
     or nullif(btrim(coalesce(new.delivery_address->>'city', '')), '') is null
     or nullif(btrim(coalesce(new.delivery_address->>'delivery_date', '')), '') is null then
    raise exception 'required_checkout_data' using errcode = 'P0001';
  end if;

  if new.customer_id is null then
    raise exception 'registration_incomplete' using errcode = 'P0001';
  end if;

  select exists(
    select 1
      from public.customers c
     where c.id = new.customer_id
       and c.is_active is distinct from false
       and nullif(btrim(coalesce(c.name, '')), '') is not null
       and nullif(regexp_replace(coalesce(c.cpf_cnpj, ''), '\D', '', 'g'), '') is not null
       and exists (
         select 1
           from public.customer_addresses a
          where a.customer_id = c.id
            and a.is_active is distinct from false
            and nullif(btrim(coalesce(a.street, '')), '') is not null
            and nullif(btrim(coalesce(a.number, '')), '') is not null
            and nullif(btrim(coalesce(a.neighborhood, '')), '') is not null
            and nullif(btrim(coalesce(a.city, '')), '') is not null
       )
  ) into v_customer_complete;

  if not coalesce(v_customer_complete, false) then
    raise exception 'registration_incomplete' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_storefront_checkout_basics_v1 on public.orders;
create trigger trg_enforce_storefront_checkout_basics_v1
before insert on public.orders
for each row
execute function public.enforce_storefront_checkout_basics_v1();
