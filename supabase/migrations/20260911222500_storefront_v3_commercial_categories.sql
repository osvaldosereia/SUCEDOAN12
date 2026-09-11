begin;

-- Preenche apenas categorias técnicas ausentes; categorias existentes continuam preservadas.
update public.products
set category = case
  when name ilike any (array['%sabão em pó%','%sabao em po%','%amaciante%','%sabão em barra%','%sabao em barra%']) then 'LAVANDERIA'
  when name ilike any (array['%água sanitária%','%agua sanitaria%','%detergente%','%desinfetante%','%esponja%','%bucha%']) then 'LIMPEZA'
  when name ilike '%sabonete%' then 'SABONETE'
  when name ilike any (array['%papel higiênico%','%papel higienico%','%creme dental%','%shampoo%','%condicionador%','%desodorante%']) then 'HIGIENE'
  when name ilike any (array['%macarrão%','%macarrao%','%lámen%','%lamen%']) then 'MACARRÃO E MOLHOS'
  when name ilike '%molho%' then 'MOLHOS E CONDIMENTOS'
  when name ilike '%tempero%' then 'TEMPEROS'
  when name ilike any (array['%suco%','%refrigerante%','%energético%','%energetico%']) then 'SUCOS, REFRI E ENERGÉTICOS'
  when name ilike any (array['%café%','%cafe%','%ovo%']) then 'CAFÉ DA MANHÃ'
  when name ilike any (array['%bolo%','%confeito%']) then 'CONFEITARIA'
  when name ilike any (array['%ração%','%racao%','% pet %']) then 'PETS'
  when name ilike any (array['%fralda%','%bebê%','%bebe%']) then 'BEBÊ'
  when name ilike any (array['%vassoura%','%rodo%','%balde%','%utilidade%']) then 'UTENSÍLIOS E UTILIDADES'
  else 'MERCEARIA BÁSICA'
end
where category is null or btrim(category)='';

-- Camada comercial simples da Vitrine. A categoria técnica original fica preservada.
update public.products
set sales_category = case
  when category='MERCEARIA BÁSICA' then 'Mercearia'
  when category='CAFÉ DA MANHÃ' then 'Café da manhã'
  when category in ('TEMPEROS','MACARRÃO E MOLHOS','MOLHOS E CONDIMENTOS') then 'Massas, molhos e temperos'
  when category in ('BOLACHAS E BISCOITOS','CONFEITARIA','BALAS E CHICLETES','CHOCOLATES E DOCES','SALGADINHOS E PETISCOS') then 'Biscoitos, doces e lanches'
  when category='SUCOS, REFRI E ENERGÉTICOS' then 'Bebidas'
  when category='LIMPEZA' then 'Limpeza da casa'
  when category='LAVANDERIA' then 'Lavanderia'
  when category in ('BELEZA','SHAMPOO E CONDICIONADOR','HIGIENE','SABONETE','DESODORANTE') then 'Higiene e beleza'
  when category='BEBÊ' then 'Bebê'
  when category='PETS' then 'Pets'
  when category='UTENSÍLIOS E UTILIDADES' then 'Utilidades'
  else case
    when name ilike any (array['%sabão em pó%','%sabao em po%','%amaciante%','%sabão em barra%','%sabao em barra%']) then 'Lavanderia'
    when name ilike any (array['%água sanitária%','%agua sanitaria%','%detergente%','%desinfetante%','%esponja%','%bucha%']) then 'Limpeza da casa'
    when name ilike any (array['%sabonete%','%papel higiênico%','%papel higienico%','%creme dental%','%shampoo%','%condicionador%','%desodorante%']) then 'Higiene e beleza'
    when name ilike any (array['%macarrão%','%macarrao%','%lámen%','%lamen%','%molho%','%tempero%']) then 'Massas, molhos e temperos'
    when name ilike any (array['%suco%','%refrigerante%','%energético%','%energetico%']) then 'Bebidas'
    when name ilike any (array['%café%','%cafe%','%ovo%']) then 'Café da manhã'
    when name ilike any (array['%bolo%','%biscoito%','%bolacha%','%chocolate%','%bala%','%salgadinho%']) then 'Biscoitos, doces e lanches'
    when name ilike any (array['%ração%','%racao%','% pet %']) then 'Pets'
    when name ilike any (array['%fralda%','%bebê%','%bebe%']) then 'Bebê'
    when name ilike any (array['%vassoura%','%rodo%','%balde%','%utilidade%']) then 'Utilidades'
    else 'Mercearia'
  end
end;

-- A primeira tela trabalha somente com as onze categorias comerciais.
delete from public.storefront_v3_categories;
insert into public.storefront_v3_categories(name,is_visible,show_home,sort_order) values
  ('Mercearia',true,true,10),
  ('Café da manhã',true,true,20),
  ('Massas, molhos e temperos',true,true,30),
  ('Biscoitos, doces e lanches',true,true,40),
  ('Bebidas',true,true,50),
  ('Limpeza da casa',true,true,60),
  ('Lavanderia',true,true,70),
  ('Higiene e beleza',true,true,80),
  ('Bebê',true,true,90),
  ('Pets',true,true,100),
  ('Utilidades',true,true,110);

create index if not exists products_storefront_sales_category_idx
  on public.products (sales_category, category, sort_order, name)
  where is_active=true;

-- Mantém o cálculo comercial da cesta no servidor, mas não transforma
-- "conferido fisicamente" em requisito de venda. Estoque e ativo continuam obrigatórios.
create or replace function public.create_storefront_order_v2(
  p_phone text,
  p_items jsonb default '[]'::jsonb,
  p_basket jsonb default null::jsonb
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_phone text; v_customer_id uuid; v_order_id uuid:=gen_random_uuid(); v_order_number text; v_basket_id uuid; v_basket public.basket_templates%rowtype; v_basket_items jsonb:='[]'::jsonb; v_extra_items jsonb:=coalesce(p_items,'[]'::jsonb); v_bi public.basket_template_items%rowtype; v_product public.products%rowtype; v_item jsonb; v_sel jsonb; v_qty numeric; v_min numeric; v_max numeric; v_delta numeric; v_total numeric(12,2):=0; v_fiscal numeric(12,2):=0; v_line numeric(12,2); v_matches integer; v_seen uuid[]:='{}'::uuid[]; v_lines text; v_message text; v_basket_name text;
begin
  v_phone:=public.normalize_storefront_phone_v2(p_phone);
  if jsonb_typeof(v_extra_items)<>'array' then raise exception 'items_must_be_array'; end if;
  if p_basket is not null and jsonb_typeof(p_basket)<>'object' then raise exception 'basket_must_be_object'; end if;
  select id into v_customer_id from public.customers where primary_whatsapp_e164=v_phone limit 1;
  if v_customer_id is null then select customer_id into v_customer_id from public.customer_phones where phone_e164=v_phone order by is_primary desc,created_at asc limit 1; end if;
  if p_basket is not null then
    begin v_basket_id:=nullif(p_basket->>'basket_id','')::uuid; exception when others then raise exception 'invalid_basket_id'; end;
    if v_basket_id is null then raise exception 'basket_id_required'; end if;
    select * into v_basket from public.basket_templates where id=v_basket_id and is_active=true;
    if not found then raise exception 'basket_not_available'; end if;
    if coalesce(v_basket.base_price,0)<0 then raise exception 'basket_price_invalid'; end if;
    v_basket_name:=v_basket.name; v_total:=v_basket.base_price; v_basket_items:=coalesce(p_basket->'items','[]'::jsonb);
    if jsonb_typeof(v_basket_items)<>'array' then raise exception 'basket_items_must_be_array'; end if;
    if jsonb_array_length(v_basket_items)<>(select count(*) from public.basket_template_items where basket_id=v_basket_id) then raise exception 'basket_selection_incomplete'; end if;
  elsif jsonb_array_length(v_extra_items)=0 then raise exception 'cart_empty'; end if;
  v_order_number:='DA-'||to_char(clock_timestamp() at time zone 'America/Cuiaba','YYMMDD')||'-'||upper(substr(replace(v_order_id::text,'-',''),1,8));
  insert into public.orders(id,customer_id,conversation_id,whatsapp_account_id,status,total,subtotal,currency,delivery_address,customer_snapshot,confirmed_at,created_at,updated_at,basket_id,fiscal_subtotal,other_expenses,discount,sync_status,idempotency_key,phone_e164,source,order_number)
  values(v_order_id,v_customer_id,null,null,'storefront_received',0,0,'BRL','{}'::jsonb,jsonb_build_object('phone_e164',v_phone),null,now(),now(),v_basket_id,0,0,0,'local','storefront-v2:'||v_order_number,v_phone,'storefront_v2',v_order_number);
  if v_basket_id is not null then
    for v_bi in select * from public.basket_template_items where basket_id=v_basket_id order by sort_order,created_at loop
      select count(*) into v_matches from jsonb_array_elements(v_basket_items) where value->>'product_id'=v_bi.product_id::text;
      select value into v_sel from jsonb_array_elements(v_basket_items) where value->>'product_id'=v_bi.product_id::text limit 1;
      if v_matches<>1 then raise exception 'basket_component_missing_or_duplicate'; end if;
      if coalesce(v_sel->>'quantity','')!~'^[0-9]+([.]0+)?$' then raise exception 'invalid_basket_quantity'; end if;
      v_qty:=(v_sel->>'quantity')::numeric; if trunc(v_qty)<>v_qty then raise exception 'invalid_basket_quantity'; end if;
      select * into v_product from public.products where id=v_bi.product_id and is_active=true;
      if not found then raise exception 'basket_product_unavailable'; end if;
      if v_qty>greatest(0,floor(coalesce(v_product.stock,0))) then raise exception 'insufficient_stock'; end if;
      if v_qty=0 and not v_bi.removable then raise exception 'item_not_removable'; end if;
      if v_qty<>v_bi.quantity and not v_bi.quantity_editable then raise exception 'quantity_not_editable'; end if;
      v_min:=greatest(0,coalesce(v_bi.min_quantity,case when v_bi.removable then 0 else v_bi.quantity end));
      v_max:=least(greatest(0,floor(coalesce(v_product.stock,0))),coalesce(v_bi.max_quantity,greatest(v_bi.quantity,floor(coalesce(v_product.stock,0)))));
      if v_qty<v_min or v_qty>v_max then raise exception 'basket_quantity_out_of_range'; end if;
      v_delta:=0;
      if v_qty<v_bi.quantity then
        if v_bi.remove_unit_delta is null and coalesce(v_product.price,0)<=0 then raise exception 'remove_pricing_not_configured'; end if;
        v_delta:=abs(v_qty-v_bi.quantity)*coalesce(v_bi.remove_unit_delta,-v_product.price);
      elsif v_qty>v_bi.quantity then
        if v_bi.add_unit_delta is null and coalesce(v_product.price,0)<=0 then raise exception 'add_pricing_not_configured'; end if;
        v_delta:=(v_qty-v_bi.quantity)*coalesce(v_bi.add_unit_delta,v_product.price);
      end if;
      v_total:=v_total+v_delta;
      if v_qty>0 then
        v_line:=round(v_qty*coalesce(v_product.price,0),2); v_fiscal:=v_fiscal+v_line;
        insert into public.order_items(order_id,product_id,sku_snapshot,name_snapshot,quantity,unit_price,line_total,metadata)
        values(v_order_id,v_product.id,v_product.sku,v_product.name,v_qty,coalesce(v_product.price,0),v_line,jsonb_build_object('source','basket','basket_id',v_basket_id,'base_quantity',v_bi.quantity,'commercial_delta',v_delta,'removable',v_bi.removable,'quantity_editable',v_bi.quantity_editable));
      end if;
    end loop;
  end if;
  for v_item in select value from jsonb_array_elements(v_extra_items) loop
    if jsonb_typeof(v_item)<>'object' then raise exception 'item_must_be_object'; end if;
    begin v_product.id:=(v_item->>'product_id')::uuid; exception when others then raise exception 'invalid_product_id'; end;
    if v_product.id=any(v_seen) then raise exception 'duplicate_product'; end if; v_seen:=array_append(v_seen,v_product.id);
    if coalesce(v_item->>'quantity','')!~'^[1-9][0-9]*([.]0+)?$' then raise exception 'invalid_quantity'; end if;
    v_qty:=(v_item->>'quantity')::numeric; if trunc(v_qty)<>v_qty then raise exception 'invalid_quantity'; end if;
    select * into v_product from public.products where id=v_product.id and is_active=true;
    if not found or v_product.price is null or v_product.price<0 then raise exception 'product_unavailable'; end if;
    if v_qty>greatest(0,floor(coalesce(v_product.stock,0))) then raise exception 'insufficient_stock'; end if;
    v_line:=round(v_qty*v_product.price,2); v_total:=v_total+v_line; v_fiscal:=v_fiscal+v_line;
    insert into public.order_items(order_id,product_id,sku_snapshot,name_snapshot,quantity,unit_price,line_total,metadata)
    values(v_order_id,v_product.id,v_product.sku,v_product.name,v_qty,v_product.price,v_line,jsonb_build_object('source','extra'));
  end loop;
  if v_total<0 then raise exception 'invalid_order_total'; end if;
  update public.orders set subtotal=round(v_total,2),total=round(v_total,2),fiscal_subtotal=round(v_fiscal,2),other_expenses=greatest(round(v_total-v_fiscal,2),0),discount=greatest(round(v_fiscal-v_total,2),0),updated_at=now() where id=v_order_id;
  select string_agg('- '||trim(to_char(quantity,'FM999999990.###'))||'x '||name_snapshot,E'\n' order by created_at,id) into v_lines from public.order_items where order_id=v_order_id;
  v_message:='Olá! Meu pedido é '||v_order_number||E'.\n\n'||case when v_basket_name is not null then 'Cesta: '||v_basket_name||E'\n' else '' end||coalesce(v_lines,'')||E'\n\nTotal: R$ '||replace(to_char(round(v_total,2),'FM999999990.00'),'.',',');
  return jsonb_build_object('order_id',v_order_id,'order_number',v_order_number,'customer_id',v_customer_id,'phone_e164',v_phone,'subtotal',round(v_total,2),'total',round(v_total,2),'message',v_message);
end;
$function$;

commit;
