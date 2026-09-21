begin;

alter table public.basket_templates
  add column if not exists hidden_adjustment numeric(14,2) not null default 0;

alter table public.carts
  add column if not exists basket_hidden_adjustment numeric(14,2) not null default 0;

alter table public.orders
  add column if not exists basket_hidden_adjustment numeric(14,2) not null default 0;

create or replace function public.calculate_basket_hidden_adjustment_v1(p_basket_id uuid)
returns numeric
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select round(
    coalesce(b.base_price,0)
    - coalesce((
      select sum(bi.quantity*coalesce(p.price,0))
      from public.basket_template_items bi
      join public.products p on p.id=bi.product_id
      where bi.basket_id=b.id
    ),0),
    2
  )
  from public.basket_templates b
  where b.id=p_basket_id;
$$;

revoke all on function public.calculate_basket_hidden_adjustment_v1(uuid) from public,anon,authenticated;
grant execute on function public.calculate_basket_hidden_adjustment_v1(uuid) to service_role;

create or replace function public.refresh_basket_hidden_adjustment_v1(p_basket_id uuid)
returns numeric
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_adjustment numeric;
begin
  select public.calculate_basket_hidden_adjustment_v1(p_basket_id)
    into v_adjustment;
  if v_adjustment is null then return null; end if;

  update public.basket_templates
     set hidden_adjustment=v_adjustment,
         updated_at=now()
   where id=p_basket_id
     and hidden_adjustment is distinct from v_adjustment;

  return v_adjustment;
end;
$$;

revoke all on function public.refresh_basket_hidden_adjustment_v1(uuid) from public,anon,authenticated;
grant execute on function public.refresh_basket_hidden_adjustment_v1(uuid) to service_role;

create or replace function public.trg_refresh_basket_hidden_adjustment_v1()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_id uuid;
begin
  v_id:=coalesce(new.basket_id,old.basket_id);
  perform public.refresh_basket_hidden_adjustment_v1(v_id);
  return coalesce(new,old);
end;
$$;

drop trigger if exists basket_items_hidden_adjustment_v1 on public.basket_template_items;
create trigger basket_items_hidden_adjustment_v1
after insert or update of quantity,product_id or delete
on public.basket_template_items
for each row execute function public.trg_refresh_basket_hidden_adjustment_v1();

create or replace function public.trg_refresh_basket_hidden_adjustment_on_price_v1()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  perform public.refresh_basket_hidden_adjustment_v1(new.id);
  return new;
end;
$$;

drop trigger if exists basket_price_hidden_adjustment_v1 on public.basket_templates;
create trigger basket_price_hidden_adjustment_v1
after update of base_price
on public.basket_templates
for each row
when (old.base_price is distinct from new.base_price)
execute function public.trg_refresh_basket_hidden_adjustment_on_price_v1();

update public.basket_templates b
set hidden_adjustment=public.calculate_basket_hidden_adjustment_v1(b.id)
where hidden_adjustment is distinct from public.calculate_basket_hidden_adjustment_v1(b.id);

create or replace function public.trg_snapshot_cart_hidden_adjustment_v1()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if new.basket_id is not null then
    select coalesce(hidden_adjustment,0)
      into new.basket_hidden_adjustment
    from public.basket_templates
    where id=new.basket_id;
  end if;
  return new;
end;
$$;

drop trigger if exists carts_snapshot_hidden_adjustment_v1 on public.carts;
create trigger carts_snapshot_hidden_adjustment_v1
before insert or update of basket_id
on public.carts
for each row execute function public.trg_snapshot_cart_hidden_adjustment_v1();

create or replace function public.trg_snapshot_order_hidden_adjustment_v1()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if new.cart_id is not null then
    select coalesce(basket_hidden_adjustment,0)
      into new.basket_hidden_adjustment
    from public.carts
    where id=new.cart_id;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_snapshot_hidden_adjustment_v1 on public.orders;
create trigger orders_snapshot_hidden_adjustment_v1
before insert or update of cart_id
on public.orders
for each row execute function public.trg_snapshot_order_hidden_adjustment_v1();

create or replace function public.recalculate_papoai_commerce_cart_v1(p_cart_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_cart public.carts%rowtype;
  v_fiscal numeric:=0;
  v_template_delta numeric:=0;
  v_addons numeric:=0;
  v_total numeric:=0;
  v_net_adjustment numeric:=0;
  v_hidden numeric:=0;
  v_residual numeric:=0;
  v_other numeric:=0;
  v_discount numeric:=0;
begin
  select * into v_cart
  from public.carts
  where id=p_cart_id
  for update;
  if not found then raise exception 'cart_not_found'; end if;

  select
    coalesce(sum(
      ci.quantity * case
        when ci.source in ('addon','substitution')
          then coalesce(ci.commercial_unit_price,ci.unit_price,0)
        else coalesce(ci.unit_price,0)
      end
    ),0),
    coalesce(sum(
      case when ci.source in ('basket','substitution')
        then ci.commercial_delta else 0 end
    ),0),
    coalesce(sum(
      case when ci.source='addon'
        then ci.quantity*coalesce(ci.commercial_unit_price,ci.unit_price,0)
        else 0 end
    ),0)
  into v_fiscal,v_template_delta,v_addons
  from public.cart_items ci
  where ci.cart_id=p_cart_id;

  v_total:=greatest(0,coalesce(v_cart.base_commercial_price,0)+v_template_delta+v_addons);
  v_net_adjustment:=v_total-v_fiscal;
  v_hidden:=coalesce(v_cart.basket_hidden_adjustment,0);
  v_residual:=v_net_adjustment-v_hidden;

  v_other:=greatest(v_hidden,0)+greatest(v_residual,0);
  v_discount:=greatest(-v_hidden,0)+greatest(-v_residual,0);

  update public.carts
     set subtotal=v_fiscal,
         fiscal_subtotal=v_fiscal,
         adjustments=v_net_adjustment,
         total=v_total,
         other_expenses=v_other,
         discount=v_discount,
         pricing_status='ready',
         pricing_issues='[]'::jsonb,
         version=version+1,
         updated_at=now()
   where id=p_cart_id;

  return jsonb_build_object(
    'cart_id',p_cart_id,
    'fiscal_subtotal',round(v_fiscal,2),
    'commercial_total',round(v_total,2),
    'net_adjustment',round(v_net_adjustment,2),
    'basket_hidden_adjustment',round(v_hidden,2),
    'other_expenses',round(v_other,2),
    'discount',round(v_discount,2),
    'pricing_status','ready'
  );
end;
$$;

revoke all on function public.recalculate_papoai_commerce_cart_v1(uuid) from public,anon,authenticated;
grant execute on function public.recalculate_papoai_commerce_cart_v1(uuid) to service_role;

commit;
