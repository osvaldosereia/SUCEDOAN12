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