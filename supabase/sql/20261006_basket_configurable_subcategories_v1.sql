create table if not exists public.basket_subcategories (
 id uuid primary key default gen_random_uuid(),
 category_id uuid not null references public.basket_categories(id) on delete cascade,
 name text not null,
 sort_order integer not null default 0,
 is_active boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint basket_subcategories_name_nonempty check (length(btrim(name)) between 1 and 80),
 constraint basket_subcategories_category_name_key unique (category_id, name)
);
alter table public.basket_subcategories enable row level security;
revoke all on public.basket_subcategories from public, anon, authenticated;
grant select, insert, update, delete on public.basket_subcategories to service_role;

alter table public.basket_templates add column if not exists subcategory_id uuid references public.basket_subcategories(id) on delete set null;
alter table public.basket_kit_templates add column if not exists subcategory_id uuid references public.basket_subcategories(id) on delete set null;
create index if not exists basket_subcategories_order_idx on public.basket_subcategories(category_id,sort_order,name);
update public.basket_molds m set public_composition_count=3 from public.basket_templates b where b.id=m.basket_id and b.is_active=true and m.public_composition_count<>3;

update public.basket_categories set is_active=slug in ('cestas-completas','cestas-so-alimentos'),sort_order=case slug when 'cestas-completas' then 10 when 'cestas-so-alimentos' then 20 else sort_order end;
insert into public.basket_subcategories(category_id,name,sort_order,is_active)
select c.id,s.name,s.sort_order,true from public.basket_categories c cross join (values ('Grande',10),('Média',20),('Pequena',30),('Mini',40)) as s(name,sort_order)
where c.slug in ('cestas-completas','cestas-so-alimentos')
on conflict(category_id,name) do update set sort_order=excluded.sort_order,is_active=true,updated_at=now();

create or replace function public.admin_basket_mold_list_v1() returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_uid uuid:=auth.uid();
begin
 if v_uid is null or not exists(select 1 from public.admin_users a where a.user_id=v_uid and a.is_active) then raise exception 'admin_not_authorized'; end if;
 return jsonb_build_object(
 'baskets',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'image_url',b.image_url,'is_active',b.is_active,'category_id',b.category_id,'subcategory_id',b.subcategory_id,'category_name',c.name,'subcategory_name',s.name,'mold_configured',m.id is not null,'hidden_adjustment',coalesce(m.hidden_adjustment,0),'public_composition_count',coalesce(m.public_composition_count,2)) order by b.sort_order,b.name,b.id)
 from public.basket_templates b left join public.basket_molds m on m.basket_id=b.id left join public.basket_categories c on c.id=b.category_id left join public.basket_subcategories s on s.id=b.subcategory_id
 where b.is_active and coalesce((b.rules->>'mold_legacy_source')::boolean,false)=false and coalesce((b.rules->>'mold_internal_legacy')::boolean,false)=false),'[]'::jsonb),
 'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'slug',c.slug,'sort_order',c.sort_order) order by c.sort_order,c.name) from public.basket_categories c where c.is_active),'[]'::jsonb),
 'subcategories',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'category_id',s.category_id,'name',s.name,'sort_order',s.sort_order) order by s.sort_order,s.name) from public.basket_subcategories s where s.is_active),'[]'::jsonb));
end; $function$;

create or replace function public.admin_basket_mold_editor_v1(p_basket_id uuid) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_uid uuid:=auth.uid(); v_result jsonb; v_category_id uuid; v_subcategory_id uuid;
begin
 if v_uid is null or not exists(select 1 from public.admin_users a where a.user_id=v_uid and a.is_active) then raise exception 'admin_not_authorized'; end if;
 v_result:=public.basket_mold_editor_v1(p_basket_id); if v_result is null then raise exception 'basket_mold_basket_not_found'; end if;
 select category_id,subcategory_id into v_category_id,v_subcategory_id from public.basket_templates where id=p_basket_id;
 return v_result||jsonb_build_object('category_id',v_category_id,'subcategory_id',v_subcategory_id);
end; $function$;

create or replace function public.admin_save_basket_mold_v2(
 p_basket_id uuid,p_name text,p_hidden_adjustment numeric,p_public_composition_count integer,
 p_positions jsonb,p_category_id uuid,p_operator text,p_subcategory_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_uid uuid:=auth.uid(); v_name text:=btrim(coalesce(p_name,'')); v_result jsonb;
begin
 if v_uid is null or not exists(select 1 from public.admin_users a where a.user_id=v_uid and a.is_active and a.role<>'viewer') then raise exception 'admin_not_authorized'; end if;
 if p_basket_id is null or not exists(select 1 from public.basket_templates b where b.id=p_basket_id) then raise exception 'basket_mold_basket_not_found'; end if;
 if p_category_id is null or not exists(select 1 from public.basket_categories c where c.id=p_category_id and c.is_active) then raise exception 'basket_category_invalid'; end if;
 if p_subcategory_id is null or not exists(select 1 from public.basket_subcategories s where s.id=p_subcategory_id and s.category_id=p_category_id and s.is_active) then raise exception 'basket_subcategory_invalid'; end if;
 if v_name='' or char_length(v_name)>180 then raise exception 'basket_mold_name_invalid'; end if;
 update public.basket_templates set name=v_name,category_id=p_category_id,subcategory_id=p_subcategory_id,updated_at=now() where id=p_basket_id;
 v_result:=public.save_basket_mold_v1(p_basket_id,p_hidden_adjustment,p_public_composition_count,p_positions,coalesce(nullif(btrim(p_operator),''),'Operação'));
 return coalesce(v_result,'{}'::jsonb)||jsonb_build_object('basket_name',v_name,'category_id',p_category_id,'subcategory_id',p_subcategory_id);
end; $function$;
revoke all on function public.admin_save_basket_mold_v2(uuid,text,numeric,integer,jsonb,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.admin_save_basket_mold_v2(uuid,text,numeric,integer,jsonb,uuid,text,uuid) to authenticated;