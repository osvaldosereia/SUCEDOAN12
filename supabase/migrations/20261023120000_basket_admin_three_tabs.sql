-- Three-tab basket configuration. Additive and safe to run more than once.
begin;

create table if not exists public.basket_admin_basket_types (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> '' and char_length(name) <= 100),
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  linked_basket_id uuid references public.basket_templates(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists basket_admin_basket_types_name_lower_uidx
  on public.basket_admin_basket_types (lower(name));
create unique index if not exists basket_admin_basket_types_linked_uidx
  on public.basket_admin_basket_types (linked_basket_id) where linked_basket_id is not null;

create table if not exists public.basket_admin_product_types (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> '' and char_length(name) <= 100),
  category text not null check (category in ('Alimentos','Limpeza','Higiene')),
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  legacy_labels text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists basket_admin_product_types_name_category_lower_uidx
  on public.basket_admin_product_types (category, lower(name));

create table if not exists public.basket_admin_quantities (
  basket_type_id uuid not null references public.basket_admin_basket_types(id) on delete cascade,
  product_type_id uuid not null references public.basket_admin_product_types(id) on delete cascade,
  quantity numeric(12,3) not null default 0 check (quantity >= 0),
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (basket_type_id, product_type_id)
);

create table if not exists public.basket_admin_product_options (
  product_type_id uuid not null references public.basket_admin_product_types(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  primary key (product_type_id, product_id)
);
create index if not exists basket_admin_product_options_order_idx
  on public.basket_admin_product_options(product_type_id, sort_order, product_id);

alter table public.basket_admin_basket_types enable row level security;
alter table public.basket_admin_product_types enable row level security;
alter table public.basket_admin_quantities enable row level security;
alter table public.basket_admin_product_options enable row level security;
revoke all on table public.basket_admin_basket_types from public, anon, authenticated;
revoke all on table public.basket_admin_product_types from public, anon, authenticated;
revoke all on table public.basket_admin_quantities from public, anon, authenticated;
revoke all on table public.basket_admin_product_options from public, anon, authenticated;
grant select, insert, update, delete on table public.basket_admin_basket_types to service_role;
grant select, insert, update, delete on table public.basket_admin_product_types to service_role;
grant select, insert, update, delete on table public.basket_admin_quantities to service_role;
grant select, insert, update, delete on table public.basket_admin_product_options to service_role;

insert into public.basket_admin_basket_types(name,sort_order,linked_basket_id)
select seed.name,seed.sort_order,b.id
from (values
  ('Doação',0,null::text),
  ('Econômica',1,'Econômica'),
  ('Mini',2,'Mini Completa'),
  ('Pequena',3,'Pequena Completa'),
  ('Média',4,'Média Completa'),
  ('Grande',5,'Grande Completa'),
  ('Família',6,null::text)
) as seed(name,sort_order,template_name)
left join public.basket_templates b on b.name=seed.template_name and b.is_active=true
on conflict do nothing;

insert into public.basket_admin_product_types(name,category,sort_order)
select seed.name,seed.category,seed.sort_order from (values
 ('Arroz','Alimentos',0),('Feijão','Alimentos',1),('Óleo','Alimentos',2),
 ('Açúcar','Alimentos',3),('Café','Alimentos',4),('Macarrão','Alimentos',5),
 ('Sal','Alimentos',6),('Molho de Tomate','Alimentos',7),('Trigo','Alimentos',8),
 ('Fubá','Alimentos',9),('Farinha de Mandioca','Alimentos',10),('Milho','Alimentos',11),
 ('Bolacha Salgada','Alimentos',12),('Bolacha Doce','Alimentos',13),('Suco em Pó','Alimentos',14),
 ('Mistura para Bolo','Alimentos',15),('Sardinha','Alimentos',16),('Tempero','Alimentos',17),
 ('Sabão em Pó','Limpeza',0),('Amaciante','Limpeza',1),('Desinfetante','Limpeza',2),
 ('Detergente','Limpeza',3),('Bucha de Lavar Louça','Limpeza',4),('Palha de Aço','Limpeza',5),
 ('Água Sanitária','Limpeza',6),
 ('Papel higiênico','Higiene',0),('Creme dental','Higiene',1),('Sabonete','Higiene',2)
) as seed(name,category,sort_order)
on conflict do nothing;

-- Record legacy labels as aliases so the new editor can update existing mold rows without renaming
-- or deleting rows during migration.
with source_labels as (
  select distinct pos.label,
    case
      when lower(pos.label) like 'arroz%' then 'Arroz'
      when lower(pos.label) like 'feijão%' then 'Feijão'
      when lower(pos.label) like 'açúcar%' then 'Açúcar'
      when lower(pos.label) like 'óleo%' then 'Óleo'
      when lower(pos.label) like 'sal%' then 'Sal'
      when lower(pos.label) like 'farinha de trigo%' then 'Trigo'
      when lower(pos.label) like 'fubá%' then 'Fubá'
      when lower(pos.label) like 'farinha de mandioca%' then 'Farinha de Mandioca'
      when lower(pos.label) like 'café%' then 'Café'
      when lower(pos.label) like 'macarrão%' then 'Macarrão'
      when lower(pos.label) like '%molho de tomate%' then 'Molho de Tomate'
      when lower(pos.label) like 'milho verde%' then 'Milho'
      when lower(pos.label) like 'rosquinha%' or lower(pos.label) like 'bolacha doce%' then 'Bolacha Doce'
      when lower(pos.label) like 'bolacha salgada%' then 'Bolacha Salgada'
      when lower(pos.label) like 'suco em pó%' then 'Suco em Pó'
      when lower(pos.label) like 'mistura para bolo%' then 'Mistura para Bolo'
      when lower(pos.label) like 'sardinha%' then 'Sardinha'
      when lower(pos.label) like 'tempero%' then 'Tempero'
      when lower(pos.label) like 'papel higiênico%' or lower(pos.label) like 'papel higienico%' then 'Papel higiênico'
      when lower(pos.label) like 'creme dental%' then 'Creme dental'
      when lower(pos.label) like 'sabonete%' then 'Sabonete'
      when lower(pos.label) like 'sabão em pó%' or lower(pos.label) like 'sabao em po%' then 'Sabão em Pó'
      when lower(pos.label) like 'amaciante%' then 'Amaciante'
      when lower(pos.label) like 'desinfetante%' then 'Desinfetante'
      when lower(pos.label) like 'detergente%' then 'Detergente'
      when lower(pos.label) like 'bucha%' then 'Bucha de Lavar Louça'
      when lower(pos.label) like 'esponja de aço%' or lower(pos.label) like 'palha de aço%' then 'Palha de Aço'
      when lower(pos.label) like 'água sanitária%' or lower(pos.label) like 'agua sanitaria%' then 'Água Sanitária'
    end as type_name
  from public.basket_mold_positions pos
), aliases as (
  select st.id,array_agg(distinct sl.label order by sl.label) as labels
  from source_labels sl
  join public.basket_admin_product_types st on lower(st.name)=lower(sl.type_name)
  where sl.type_name is not null
  group by st.id
)
update public.basket_admin_product_types pt
set legacy_labels=a.labels
from aliases a where pt.id=a.id and cardinality(pt.legacy_labels)=0;

-- Import current quantities once. A later edit clears the legacy_seed marker and is never overwritten.
with mapped as (
  select bt.id as basket_type_id,pt.id as product_type_id,sum(pos.quantity)::numeric(12,3) as quantity
  from public.basket_admin_basket_types bt
  join public.basket_molds m on m.basket_id=bt.linked_basket_id
  join public.basket_mold_positions pos on pos.mold_id=m.id
  join public.basket_admin_product_types pt
    on lower(pos.label)=any(select lower(x) from unnest(pt.legacy_labels) x)
    or lower(pos.label)=lower(pt.name)
  group by bt.id,pt.id
)
insert into public.basket_admin_quantities(basket_type_id,product_type_id,quantity,metadata)
select basket_type_id,product_type_id,quantity,jsonb_build_object('source','legacy_seed')
from mapped
on conflict (basket_type_id,product_type_id) do nothing;

insert into public.basket_admin_quantities(basket_type_id,product_type_id,quantity,metadata)
select bt.id,pt.id,0,'{}'::jsonb
from public.basket_admin_basket_types bt cross join public.basket_admin_product_types pt
on conflict (basket_type_id,product_type_id) do nothing;

-- Copy current carousel selections in their saved order; keep the source records intact.
with source as (
  select distinct on (pt.id,old_opt.product_id)
    pt.id as product_type_id,old_opt.product_id,old_opt.sort_order
  from public.basket_mold_shared_items old
  join public.basket_mold_shared_item_options old_opt on old_opt.shared_item_id=old.id
  join public.basket_admin_product_types pt on
    lower(old.label)=any(select lower(x) from unnest(pt.legacy_labels) x)
    or lower(old.label)=lower(pt.name)
  order by pt.id,old_opt.product_id,old_opt.sort_order
)
insert into public.basket_admin_product_options(product_type_id,product_id,sort_order)
select product_type_id,product_id,sort_order from source
on conflict (product_type_id,product_id) do nothing;

create or replace function public.admin_basket_configuration_v1()
returns jsonb language plpgsql stable security definer set search_path=''
as $function$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null or not exists(select 1 from public.admin_users a where a.user_id=v_uid and a.is_active and a.role<>'viewer') then
    raise exception 'admin_not_authorized';
  end if;
  return jsonb_build_object(
    'basket_types',coalesce((
      select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'sort_order',t.sort_order,'is_active',t.is_active,
        'linked_template_id',t.linked_basket_id,'template_active',b.is_active,'site_visible',coalesce(b.is_active,false))
        order by t.sort_order,t.name)
      from public.basket_admin_basket_types t left join public.basket_templates b on b.id=t.linked_basket_id
    ),'[]'::jsonb),
    'product_types',coalesce((
      select jsonb_agg(jsonb_build_object('id',pt.id,'name',pt.name,'category',pt.category,'sort_order',pt.sort_order,'is_active',pt.is_active,
        'options',coalesce((select jsonb_agg(jsonb_build_object('product_id',p.id,'name',p.name,'sku',p.sku,'gtin',p.gtin,
          'image_url',p.image_url,'price',p.price,'offer_price',p.offer_price,'is_offer',p.is_offer,'sort_order',o.sort_order)
          order by o.sort_order,p.id) from public.basket_admin_product_options o join public.products p on p.id=o.product_id
          where o.product_type_id=pt.id),'[]'::jsonb))
        order by case pt.category when 'Alimentos' then 0 when 'Limpeza' then 1 else 2 end,pt.sort_order,pt.name)
      from public.basket_admin_product_types pt
    ),'[]'::jsonb),
    'quantities',coalesce((select jsonb_agg(jsonb_build_object('basket_type_id',q.basket_type_id,'product_type_id',q.product_type_id,'quantity',q.quantity))
      from public.basket_admin_quantities q),'[]'::jsonb)
  );
end;
$function$;

create or replace function public.admin_basket_configuration_types_save_v1(p_types jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid(); v_row jsonb; v_id uuid; v_name text; v_order integer; v_active boolean;
begin
  if v_uid is null or not exists(select 1 from public.admin_users a where a.user_id=v_uid and a.is_active and a.role<>'viewer') then
    raise exception 'admin_not_authorized';
  end if;
  if jsonb_typeof(p_types)<>'array' then raise exception 'basket_admin_types_invalid'; end if;
  if exists(select 1 from (select lower(btrim(value->>'name')) n,count(*) c from jsonb_array_elements(p_types) group by 1 having count(*)>1) d) then
    raise exception 'basket_admin_type_duplicate';
  end if;
  for v_row in select value from jsonb_array_elements(p_types) loop
    v_id:=nullif(v_row->>'id','')::uuid; v_name:=btrim(coalesce(v_row->>'name',''));
    v_order:=coalesce(nullif(v_row->>'sort_order','')::integer,0); v_active:=coalesce((v_row->>'is_active')::boolean,true);
    if v_name='' or char_length(v_name)>100 or v_order<0 then raise exception 'basket_admin_type_invalid'; end if;
    if v_id is null then
      insert into public.basket_admin_basket_types(name,sort_order,is_active,metadata)
      values(v_name,v_order,v_active,jsonb_build_object('updated_by',v_uid))
      returning id into v_id;
    else
      update public.basket_admin_basket_types set name=v_name,sort_order=v_order,is_active=v_active,updated_at=now(),
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('updated_by',v_uid)
      where id=v_id;
      if not found then raise exception 'basket_admin_type_not_found'; end if;
    end if;
    update public.basket_templates b set name=v_name,sort_order=v_order,updated_at=now()
    where b.id=(select linked_basket_id from public.basket_admin_basket_types where id=v_id);
  end loop;
  return public.admin_basket_configuration_v1();
end;
$function$;

create or replace function public.admin_basket_configuration_quantities_save_v1(p_quantities jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid(); v_row jsonb; v_basket_id uuid; v_product_id uuid; v_qty numeric; v_mold_id uuid;
  v_position_id uuid; v_labels text[]; v_name text; v_order integer;
begin
  if v_uid is null or not exists(select 1 from public.admin_users a where a.user_id=v_uid and a.is_active and a.role<>'viewer') then
    raise exception 'admin_not_authorized';
  end if;
  if jsonb_typeof(p_quantities)<>'array' then raise exception 'basket_admin_quantities_invalid'; end if;
  for v_row in select value from jsonb_array_elements(p_quantities) loop
    v_basket_id:=nullif(v_row->>'basket_type_id','')::uuid;
    v_product_id:=nullif(v_row->>'product_type_id','')::uuid;
    v_qty:=nullif(v_row->>'quantity','')::numeric;
    if v_basket_id is null or v_product_id is null or v_qty is null or v_qty<0
      or not exists(select 1 from public.basket_admin_basket_types where id=v_basket_id)
      or not exists(select 1 from public.basket_admin_product_types where id=v_product_id) then
      raise exception 'basket_admin_quantity_invalid';
    end if;
  end loop;
  for v_row in select value from jsonb_array_elements(p_quantities) loop
    v_basket_id:=(v_row->>'basket_type_id')::uuid; v_product_id:=(v_row->>'product_type_id')::uuid; v_qty:=(v_row->>'quantity')::numeric;
    insert into public.basket_admin_quantities(basket_type_id,product_type_id,quantity,metadata,updated_at)
    values(v_basket_id,v_product_id,v_qty,jsonb_build_object('updated_by',v_uid),now())
    on conflict(basket_type_id,product_type_id) do update set quantity=excluded.quantity,metadata=excluded.metadata,updated_at=now();
    select linked_basket_id into v_basket_id from public.basket_admin_basket_types where id=v_basket_id;
    if v_basket_id is null then continue; end if;
    select id into v_mold_id from public.basket_molds where basket_id=v_basket_id;
    if v_mold_id is null then continue; end if;
    select name,legacy_labels into v_name,v_labels from public.basket_admin_product_types where id=v_product_id;
    select id into v_position_id from public.basket_mold_positions
      where mold_id=v_mold_id and (lower(label)=any(select lower(x) from unnest(v_labels) x) or lower(label)=lower(v_name))
      order by sort_order,id limit 1;
    if v_position_id is null and v_qty>0 then
      select coalesce(max(sort_order)+1,0) into v_order from public.basket_mold_positions where mold_id=v_mold_id;
      insert into public.basket_mold_positions(mold_id,label,quantity,sort_order)
      values(v_mold_id,v_name,v_qty,v_order);
    elsif v_position_id is not null then
      update public.basket_mold_positions set label=v_name,quantity=v_qty,updated_at=now() where id=v_position_id;
      update public.basket_mold_positions set quantity=0,updated_at=now()
      where mold_id=v_mold_id and id<>v_position_id
        and (lower(label)=any(select lower(x) from unnest(v_labels) x) or lower(label)=lower(v_name));
    end if;
  end loop;
  return public.admin_basket_configuration_v1();
end;
$function$;

create or replace function public.admin_basket_configuration_product_type_save_v1(p_product_type jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid(); v_id uuid; v_name text; v_category text; v_order integer; v_active boolean;
  v_row jsonb; v_product uuid; v_seen uuid[]:='{}'::uuid[]; v_pos uuid; v_mold uuid; v_template uuid; v_qty numeric; v_labels text[];
begin
  if v_uid is null or not exists(select 1 from public.admin_users a where a.user_id=v_uid and a.is_active and a.role<>'viewer') then
    raise exception 'admin_not_authorized';
  end if;
  if p_product_type is null or jsonb_typeof(p_product_type)<>'object' then raise exception 'basket_admin_product_type_invalid'; end if;
  v_id:=nullif(p_product_type->>'id','')::uuid; v_name:=btrim(coalesce(p_product_type->>'name',''));
  v_category:=btrim(coalesce(p_product_type->>'category','')); v_order:=coalesce(nullif(p_product_type->>'sort_order','')::integer,0);
  v_active:=coalesce((p_product_type->>'is_active')::boolean,true);
  if v_name='' or char_length(v_name)>100 or v_category not in ('Alimentos','Limpeza','Higiene') or v_order<0 then
    raise exception 'basket_admin_product_type_invalid';
  end if;
  if jsonb_typeof(p_product_type->'options')<>'array' then raise exception 'basket_admin_product_options_invalid'; end if;
  for v_row in select value from jsonb_array_elements(p_product_type->'options') loop
    v_product:=nullif(v_row->>'product_id','')::uuid;
    if v_product is null or v_product=any(v_seen) or not exists(select 1 from public.products p where p.id=v_product and p.is_active=true) then
      raise exception 'basket_admin_product_option_invalid';
    end if;
    v_seen:=array_append(v_seen,v_product);
  end loop;
  if v_id is null then
    insert into public.basket_admin_product_types(name,category,sort_order,is_active,metadata)
    values(v_name,v_category,v_order,v_active,jsonb_build_object('updated_by',v_uid)) returning id into v_id;
  else
    update public.basket_admin_product_types set name=v_name,category=v_category,sort_order=v_order,is_active=v_active,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('updated_by',v_uid),updated_at=now()
    where id=v_id;
    if not found then raise exception 'basket_admin_product_type_not_found'; end if;
  end if;
  delete from public.basket_admin_product_options where product_type_id=v_id;
  for v_row in select value from jsonb_array_elements(p_product_type->'options') with ordinality as x(value,ord) order by ord loop
    insert into public.basket_admin_product_options(product_type_id,product_id,sort_order)
    values(v_id,(v_row->>'product_id')::uuid,(v_row->>'sort_order')::integer);
  end loop;
  select legacy_labels into v_labels from public.basket_admin_product_types where id=v_id;
  for v_template in select linked_basket_id from public.basket_admin_basket_types where linked_basket_id is not null loop
    select id into v_mold from public.basket_molds where basket_id=v_template;
    if v_mold is null then continue; end if;
    select id into v_pos from public.basket_mold_positions where mold_id=v_mold
      and (lower(label)=any(select lower(x) from unnest(v_labels) x) or lower(label)=lower(v_name))
      order by sort_order,id limit 1;
    if v_pos is null then
      select coalesce(quantity,0) into v_qty from public.basket_admin_quantities
       where basket_type_id=(select id from public.basket_admin_basket_types where linked_basket_id=v_template)
       and product_type_id=v_id;
      if coalesce(v_qty,0)<=0 then continue; end if;
      insert into public.basket_mold_positions(mold_id,label,quantity,sort_order)
      select v_mold,v_name,v_qty,coalesce(max(sort_order)+1,0) from public.basket_mold_positions where mold_id=v_mold
      returning id into v_pos;
    end if;
    delete from public.basket_mold_position_options where position_id=v_pos;
    insert into public.basket_mold_position_options(position_id,product_id,sort_order)
      select v_pos,o.product_id,o.sort_order from public.basket_admin_product_options o
      where o.product_type_id=v_id order by o.sort_order,o.product_id;
  end loop;
  return public.admin_basket_configuration_v1();
end;
$function$;

revoke all on function public.admin_basket_configuration_v1() from public,anon,authenticated;
revoke all on function public.admin_basket_configuration_types_save_v1(jsonb) from public,anon,authenticated;
revoke all on function public.admin_basket_configuration_quantities_save_v1(jsonb) from public,anon,authenticated;
revoke all on function public.admin_basket_configuration_product_type_save_v1(jsonb) from public,anon,authenticated;
grant execute on function public.admin_basket_configuration_v1() to authenticated,service_role;
grant execute on function public.admin_basket_configuration_types_save_v1(jsonb) to authenticated,service_role;
grant execute on function public.admin_basket_configuration_quantities_save_v1(jsonb) to authenticated,service_role;
grant execute on function public.admin_basket_configuration_product_type_save_v1(jsonb) to authenticated,service_role;

-- Linked complete-basket positions accept every configured option; other basket categories keep the existing three-option guard.
create or replace function public.enforce_basket_mold_position_option_limit_v1()
returns trigger language plpgsql set search_path=''
as $function$
declare v_category text; v_count integer;
begin
  select cat.slug into v_category
  from public.basket_mold_positions pos
  join public.basket_molds m on m.id=pos.mold_id
  join public.basket_templates b on b.id=m.basket_id
  join public.basket_categories cat on cat.id=b.category_id
  where pos.id=new.position_id;
  if v_category='cestas-completas' then return new; end if;
  select count(*) into v_count from public.basket_mold_position_options where position_id=new.position_id;
  if v_count>=3 then raise exception 'basket_mold_position_options_limit'; end if;
  return new;
end;
$function$;

commit;
