create or replace function public.admin_basket_mold_editor_v1(p_basket_id uuid) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_uid uuid:=auth.uid(); v_result jsonb; v_category_id uuid; v_subcategory_id uuid;
begin
 if v_uid is null or not exists(select 1 from public.admin_users a where a.user_id=v_uid and a.is_active) then raise exception 'admin_not_authorized'; end if;
 v_result:=public.basket_mold_editor_v1(p_basket_id); if v_result is null then raise exception 'basket_mold_basket_not_found'; end if;
 select category_id,subcategory_id into v_category_id,v_subcategory_id from public.basket_templates where id=p_basket_id;
 return v_result||jsonb_build_object('category_id',v_category_id,'subcategory_id',v_subcategory_id);
end; $function$;