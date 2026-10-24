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