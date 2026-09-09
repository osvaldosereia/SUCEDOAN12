create or replace function public.get_whatsapp_flow_bulk_personalizer_v1(p_basket_id uuid, p_selection jsonb default null::jsonb)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $function$
declare
  b public.basket_templates%rowtype;
  r record;
  v_data jsonb:='{}'::jsonb;
  v_init jsonb:='{}'::jsonb;
  v_map jsonb:='{}'::jsonb;
  v_options jsonb;
  v_qty numeric;
  v_min integer;
  v_max integer;
  v_stock integer;
  v_remove_priced boolean;
  v_add_priced boolean;
  v_enabled boolean;
  v_food_index integer:=0;
  v_hygiene_index integer:=16;
  v_slot integer;
  v_key text;
  v_label text;
  v_has_hygiene boolean:=false;
  i integer;
begin
  select * into b from public.basket_templates where id=p_basket_id and is_active=true and is_whatsapp_active=true;
  if not found then raise exception 'basket_not_available'; end if;
  for r in
    select bi.product_id,bi.quantity,bi.removable,bi.quantity_editable,bi.min_quantity,bi.max_quantity,
           bi.remove_unit_delta,bi.add_unit_delta,bi.sort_order,p.name,p.price,p.stock,p.metadata,
           coalesce(p.metadata->>'flow_basket_section','ALIMENTOS') as section,
           left(coalesce(nullif(p.metadata->>'flow_short_name',''),p.name),20) as short_name
      from public.basket_template_items bi join public.products p on p.id=bi.product_id
     where bi.basket_id=b.id
     order by case when coalesce(p.metadata->>'flow_basket_section','ALIMENTOS')='HIGIENE_LIMPEZA' then 2 else 1 end,bi.sort_order,p.name
  loop
    if r.section='HIGIENE_LIMPEZA' then v_hygiene_index:=v_hygiene_index+1; v_slot:=v_hygiene_index; v_has_hygiene:=true;
    else v_food_index:=v_food_index+1; v_slot:=v_food_index; end if;
    if v_slot<1 or v_slot>27 then continue; end if;
    v_key:='q'||lpad(v_slot::text,2,'0');
    v_label:=left(coalesce(r.short_name,r.name),20);
    v_qty:=null;
    if jsonb_typeof(coalesce(p_selection,'null'::jsonb))='array' then
      select (x->>'quantity')::numeric into v_qty from jsonb_array_elements(p_selection) x where x->>'product_id'=r.product_id::text limit 1;
    end if;
    v_qty:=coalesce(v_qty,r.quantity);
    v_remove_priced:=r.remove_unit_delta is not null or coalesce(r.price,0)>0;
    v_add_priced:=r.add_unit_delta is not null or coalesce(r.price,0)>0;
    v_min:=coalesce(r.min_quantity::integer,case when r.removable then 0 else v_qty::integer end);
    v_stock:=greatest(0,floor(coalesce(r.stock,0))::integer);
    v_max:=least(6,v_stock);
    if r.max_quantity is not null then v_max:=least(v_max,r.max_quantity::integer); end if;
    -- Stale legacy stock never invalidates the quantity already inside an official basket.
    -- It only prevents increases above the currently selected quantity.
    v_max:=greatest(v_max,v_qty::integer);
    if not v_remove_priced then v_min:=greatest(v_min,v_qty::integer); end if;
    if not v_add_priced then v_max:=least(v_max,v_qty::integer); end if;
    v_enabled:=coalesce(r.quantity_editable,false) and v_min<=v_max and (v_remove_priced or v_add_priced);
    if not v_enabled then v_min:=v_qty::integer; v_max:=v_qty::integer; end if;
    v_min:=greatest(v_min,0);
    select coalesce(jsonb_agg(jsonb_build_object('id',g::text,'title',case when g=0 then '0 · Retirar' when g=1 then '1 unidade' else g::text||' unidades' end) order by g),'[]'::jsonb)
      into v_options from generate_series(v_min,v_max) g;
    if jsonb_array_length(v_options)=0 then
      v_options:=jsonb_build_array(jsonb_build_object('id',v_qty::integer::text,'title',case when v_qty::integer=1 then '1 unidade' else v_qty::integer::text||' unidades' end));
      v_enabled:=false;
    end if;
    v_data:=v_data||jsonb_build_object(v_key||'_label',v_label,v_key||'_options',v_options,v_key||'_visible',true,v_key||'_enabled',v_enabled);
    v_init:=v_init||jsonb_build_object(v_key,v_qty::integer::text);
    v_map:=v_map||jsonb_build_object(v_key,r.product_id::text);
  end loop;
  for i in 1..27 loop
    v_key:='q'||lpad(i::text,2,'0');
    if not (v_data ? (v_key||'_label')) then
      v_data:=v_data||jsonb_build_object(v_key||'_label','Item',v_key||'_options',jsonb_build_array(jsonb_build_object('id','0','title','0')),v_key||'_visible',false,v_key||'_enabled',false);
      v_init:=v_init||jsonb_build_object(v_key,'0');
    end if;
  end loop;
  v_data:=v_data||jsonb_build_object('basket_name',b.name,'basket_price','R$ '||replace(to_char(b.base_price,'FM999999990.00'),'.',','),
    'basket_note','A quantidade da cesta já vem selecionada. Você pode retirar ou ajustar os itens disponíveis.',
    'basket_image_url',coalesce(b.image_url,''),'basket_image_base64','','has_basket_image',false,'has_hygiene',v_has_hygiene,'init_values',v_init);
  return jsonb_build_object('data',v_data,'slot_map',v_map,'selection',coalesce(p_selection,'[]'::jsonb),'food_slots_used',v_food_index,
    'hygiene_slots_used',greatest(v_hygiene_index-16,0),'max_slots',27,
    'policy',jsonb_build_object('all_items_on_one_screen',true,'max_quantity_per_product',6,'stock_caps_increase',true,'quantity_zero_means_remove',true,
      'single_backend_recalculation',true,'component_prices_visible',false,'individual_product_images_on_screen',false));
end;
$function$;

create or replace function public.get_whatsapp_flow_extras_screen_v2(p_conversation_id uuid,p_message text default null::text)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare v_sections jsonb; v_review jsonb; v_total text; v_write jsonb:=public.get_whatsapp_flow_commercial_write_readiness_v1(); v_write_ready boolean:=coalesce((v_write->>'ready')::boolean,false);
begin
  select coalesce(jsonb_agg(jsonb_build_object('id',section_key,'title',section_title) order by sort_order,section_title),'[]'::jsonb) into v_sections from public.get_whatsapp_flow_sections_v1();
  if v_write_ready then v_review:=public.format_whatsapp_flow_cart_review_v1(p_conversation_id); v_total:=coalesce(nullif(v_review->>'total',''),'Pedido em montagem'); else v_total:='Pedido em montagem'; end if;
  return jsonb_build_object('sections',v_sections,'extras_actions',jsonb_build_array(
    jsonb_build_object('id','browse','title','Ver produtos'),jsonb_build_object('id','direct_search','title','Buscar produto'),jsonb_build_object('id','finish','title','Concluir pedido')),
    'cart_total',v_total,'message',coalesce(p_message,'Escolha o que deseja fazer.'));
end;
$function$;

create or replace function public.get_whatsapp_flow_product_results_page_v1(p_query text,p_page integer default 1,p_page_size integer default 3)
returns jsonb language sql stable security definer set search_path='' as $function$
with params as (select left(trim(coalesce(p_query,'')),120) q,greatest(1,coalesce(p_page,1)) pg,greatest(1,least(coalesce(p_page_size,3),3)) ps),
ranked as (select x.*,row_number() over(order by x.score desc,x.name) rn from params p cross join lateral public.search_whatsapp_sellable_products_v1(p.q,20) x),
page_rows as (select r.* from ranked r,params p where r.rn>((p.pg-1)*p.ps) and r.rn<=(p.pg*p.ps)),counts as (select count(*) total from ranked)
select jsonb_build_object('query',(select q from params),'page',(select pg from params),'page_size',(select ps from params),'total',(select total from counts),
 'has_more',(select total>((select pg*ps from params)) from counts),'products',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'brand',brand,'packaging',packaging,'price',price,'image_url',image_url,'category',category) order by rn) from page_rows),'[]'::jsonb));
$function$;