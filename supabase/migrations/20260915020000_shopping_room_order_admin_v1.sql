begin;

alter table public.orders
  add column if not exists catalog_session_id uuid references public.catalog_sessions(id) on delete set null,
  add column if not exists basket_name_snapshot text,
  add column if not exists checkout_snapshot jsonb not null default '{}'::jsonb;

create index if not exists orders_catalog_session_idx
  on public.orders(catalog_session_id)
  where catalog_session_id is not null;

create or replace function public.prepare_shopping_room_order_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_session_id uuid;
  v_phone text;
  v_basket_name text;
  v_is_shopping boolean:=false;
begin
  if new.cart_id is not null then
    select s.id
      into v_session_id
      from public.catalog_sessions s
     where s.cart_id=new.cart_id
       and s.experience='shopping_room'
     order by s.created_at desc
     limit 1;
  end if;

  v_is_shopping := v_session_id is not null or new.source='shopping_room';
  if not v_is_shopping then return new; end if;

  new.catalog_session_id:=coalesce(new.catalog_session_id,v_session_id);
  if new.source is null or new.source='legacy' then new.source:='shopping_room'; end if;

  if new.order_number is null or trim(new.order_number)='' then
    new.order_number:='DA-'||to_char(clock_timestamp() at time zone 'America/Cuiaba','YYMMDD')||'-'||upper(substr(replace(new.id::text,'-',''),1,8));
  end if;

  if new.idempotency_key is null or trim(new.idempotency_key)='' then
    new.idempotency_key:=case when new.cart_id is null then 'shopping-room-order:'||new.id::text else 'shopping-room-cart:'||new.cart_id::text end;
  end if;

  if new.phone_e164 is null or trim(new.phone_e164)='' then
    v_phone:=nullif(trim(coalesce(new.customer_snapshot->>'phone','')),'');
    if v_phone is null and new.customer_id is not null then
      select c.primary_whatsapp_e164 into v_phone from public.customers c where c.id=new.customer_id;
    end if;
    new.phone_e164:=v_phone;
  end if;

  if coalesce(new.subtotal,0)=0 and coalesce(new.total,0)>0 then
    new.subtotal:=greatest(0,coalesce(new.total,0)+coalesce(new.discount,0));
  end if;

  if new.basket_id is not null and (new.basket_name_snapshot is null or trim(new.basket_name_snapshot)='') then
    select b.name into v_basket_name from public.basket_templates b where b.id=new.basket_id;
    new.basket_name_snapshot:=v_basket_name;
  end if;

  new.checkout_snapshot:=jsonb_strip_nulls(jsonb_build_object(
    'catalog_session_id',new.catalog_session_id,
    'cart_id',new.cart_id,
    'conversation_id',new.conversation_id,
    'customer_id',new.customer_id,
    'order_number',new.order_number,
    'source',new.source,
    'status',new.status,
    'payment_method',new.payment_method,
    'phone_e164',new.phone_e164,
    'basket_id',new.basket_id,
    'basket_name',new.basket_name_snapshot,
    'delivery_address',new.delivery_address,
    'customer',new.customer_snapshot,
    'subtotal',new.subtotal,
    'fiscal_subtotal',new.fiscal_subtotal,
    'other_expenses',new.other_expenses,
    'discount',new.discount,
    'total',new.total,
    'currency',new.currency,
    'sync_status',new.sync_status,
    'confirmed_at',new.confirmed_at
  ));

  return new;
end;
$$;

drop trigger if exists trg_prepare_shopping_room_order_v1 on public.orders;
create trigger trg_prepare_shopping_room_order_v1
before insert or update on public.orders
for each row execute function public.prepare_shopping_room_order_v1();

-- Corrige pedidos já criados pela Sala de Compra com a origem legada.
update public.orders o
   set source='shopping_room',updated_at=now()
 where o.cart_id is not null
   and exists(
     select 1 from public.catalog_sessions s
      where s.cart_id=o.cart_id
        and s.experience='shopping_room'
   );

revoke all on function public.prepare_shopping_room_order_v1() from public,anon,authenticated;
grant execute on function public.prepare_shopping_room_order_v1() to service_role;

commit;
