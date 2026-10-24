-- Admin1 product status is writable only through this narrowly scoped RPC.
-- Stock availability comes from the live, freshness-checked stock authority view.
create or replace function public.admin1_products_page_v1(
  p_limit integer,
  p_offset integer,
  p_query text,
  p_category text,
  p_status text,
  p_stock text
)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
with catalog as materialized (
  select p.id,p.sku,p.gtin,p.name,p.ncm,p.price,
         public.basket_component_fresh_sellable_stock_v1(p.id) as stock,
         p.image_url,p.brand,p.category,p.subcategory,p.packaging,p.unit,p.is_active,
         p.description_short,p.description_long,p.tags,p.min_stock
    from public.products p
   where coalesce(p_status,'all')='all'
      or (p_status='active' and p.is_active is true)
      or (p_status='inactive' and p.is_active is not true)
), filtered as materialized (
  select * from catalog c
   where (nullif(btrim(coalesce(p_query,'')),'') is null
          or c.name ilike '%'||btrim(p_query)||'%'
          or c.sku ilike '%'||btrim(p_query)||'%'
          or c.gtin ilike '%'||btrim(p_query)||'%'
          or c.brand ilike '%'||btrim(p_query)||'%')
     and (nullif(btrim(coalesce(p_category,'')),'') is null or c.category=p_category)
     and (coalesce(p_stock,'all')='all'
          or (p_stock='available' and c.stock>0)
          or (p_stock='out' and c.stock<=0))
), page as (
  select * from filtered order by name asc,id asc
   limit greatest(1,least(coalesce(p_limit,36),100))
  offset greatest(0,coalesce(p_offset,0))
)
select jsonb_build_object(
  'ok',true,
  'products',coalesce((select jsonb_agg(to_jsonb(page) order by page.name,page.id) from page),'[]'::jsonb),
  'total',(select count(*) from filtered),
  'next_offset',case
    when greatest(0,coalesce(p_offset,0))+(select count(*) from page)<(select count(*) from filtered)
    then greatest(0,coalesce(p_offset,0))+(select count(*) from page)
    else null end
);
$function$;

revoke all on function public.admin1_products_page_v1(integer,integer,text,text,text,text) from public, anon, authenticated;
grant execute on function public.admin1_products_page_v1(integer,integer,text,text,text,text) to service_role;

create or replace function public.admin1_set_product_active_v1(
  p_product_id uuid,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_stock numeric;
  v_product public.products%rowtype;
begin
  if p_product_id is null or p_is_active is null then
    return jsonb_build_object('ok',false,'error','invalid_product_status');
  end if;

  select * into v_product
    from public.products
   where id=p_product_id
   for update;
  if not found then
    return jsonb_build_object('ok',false,'error','product_not_found');
  end if;

  if p_is_active then
    v_stock:=public.basket_component_fresh_sellable_stock_v1(p_product_id);
    if v_stock is null then
      return jsonb_build_object('ok',false,'error','stock_unconfirmed');
    end if;
    if v_stock<=0 then
      return jsonb_build_object('ok',false,'error','product_out_of_stock');
    end if;
  end if;

  update public.products
     set is_active=p_is_active,
         last_admin_edit_at=now(),
         updated_at=now()
   where id=p_product_id
   returning * into v_product;

  return jsonb_build_object(
    'ok',true,
    'product',jsonb_build_object(
      'id',v_product.id,
      'is_active',v_product.is_active,
      'stock',v_product.stock
    )
  );
end
$function$;

revoke all on function public.admin1_set_product_active_v1(uuid,boolean) from public, anon, authenticated;
grant execute on function public.admin1_set_product_active_v1(uuid,boolean) to service_role;

-- A current Bling stock mirror reporting zero sellable quantity hides the product.
-- Missing or stale stock evidence does not trigger a status change. A later restock
-- does not reactivate the product; the operator must explicitly publish it again.
create or replace function public.admin1_deactivate_sold_out_product_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_sellable numeric;
begin
  v_sellable:=public.basket_component_fresh_sellable_stock_v1(new.product_id);
  if v_sellable is not null and v_sellable<=0 then
    update public.products
       set is_active=false,
           updated_at=now()
     where id=new.product_id
       and is_active is true;
  end if;
  return new;
end
$function$;

revoke all on function public.admin1_deactivate_sold_out_product_v1() from public, anon, authenticated;

drop trigger if exists admin1_deactivate_sold_out_product_v1 on public.bling_stock_mirror_v2;
create trigger admin1_deactivate_sold_out_product_v1
after insert or update of physical_total,virtual_total,deposit_balances,observed_at
on public.bling_stock_mirror_v2
for each row
execute function public.admin1_deactivate_sold_out_product_v1();

-- Apply the rule to existing products only when a current sellable-stock value exists.
update public.products p
   set is_active=false,
       updated_at=now()
 where p.is_active is true
   and public.basket_component_fresh_sellable_stock_v1(p.id) is not null
   and public.basket_component_fresh_sellable_stock_v1(p.id)<=0;
