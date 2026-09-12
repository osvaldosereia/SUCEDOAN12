begin;

-- Itens com preço válido podem ter a quantidade aumentada/reduzida na cesta.
-- Itens sem preço continuam protegidos pela política fixa existente.
update public.basket_template_items bti
   set quantity_editable = true,
       updated_at = now()
  from public.basket_templates bt,
       public.products p
 where bt.id = bti.basket_id
   and p.id = bti.product_id
   and bt.is_active = true
   and bt.is_whatsapp_active = true
   and bti.quantity_editable = false
   and coalesce(p.price,0) > 0;

-- Sessões já abertas também recebem a política nova, para o cliente não precisar
-- recomeçar a compra para conseguir aumentar a quantidade.
update public.cart_items ci
   set metadata = jsonb_set(coalesce(ci.metadata,'{}'::jsonb),'{quantity_editable}','true'::jsonb,true),
       updated_at = now()
  from public.carts c,
       public.products p
 where c.id = ci.cart_id
   and p.id = ci.product_id
   and c.status = 'draft'
   and ci.source in ('basket','substitution')
   and coalesce(p.price,0) > 0
   and coalesce((ci.metadata->>'quantity_editable')::boolean,false) = false;

-- customers.primary_whatsapp_e164 é a fonte de verdade do número principal.
-- Todo outro número já ligado ao mesmo cliente permanece como número extra.
create or replace function public.customer_phone_primary_guard()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_primary text;
begin
  select c.primary_whatsapp_e164
    into v_primary
    from public.customers c
   where c.id = new.customer_id;

  new.is_primary := (
    nullif(public.normalize_phone_digits(new.phone_e164),'') is not null
    and public.normalize_phone_digits(new.phone_e164) = public.normalize_phone_digits(v_primary)
  );
  return new;
end;
$$;

revoke all on function public.customer_phone_primary_guard() from public,anon,authenticated;
grant execute on function public.customer_phone_primary_guard() to service_role;

-- Corrige registros existentes antes de ativar a proteção para novas gravações.
update public.customer_phones cp
   set is_primary = (
     nullif(public.normalize_phone_digits(cp.phone_e164),'') is not null
     and public.normalize_phone_digits(cp.phone_e164) = public.normalize_phone_digits(c.primary_whatsapp_e164)
   )
  from public.customers c
 where c.id = cp.customer_id
   and cp.is_primary is distinct from (
     nullif(public.normalize_phone_digits(cp.phone_e164),'') is not null
     and public.normalize_phone_digits(cp.phone_e164) = public.normalize_phone_digits(c.primary_whatsapp_e164)
   );

drop trigger if exists customer_phone_primary_guard on public.customer_phones;
create trigger customer_phone_primary_guard
before insert or update of customer_id,phone_e164,is_primary
on public.customer_phones
for each row execute function public.customer_phone_primary_guard();

commit;
