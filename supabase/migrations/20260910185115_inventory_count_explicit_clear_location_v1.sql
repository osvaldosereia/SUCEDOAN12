create or replace function public.save_verified_inventory_count_v3(
  p_inventory_count_id uuid,
  p_user_id uuid,
  p_firebase_key text,
  p_source jsonb,
  p_counted_stock numeric,
  p_validity_date date,
  p_gondola text default null,
  p_shelf text default null,
  p_clear_gondola boolean default false,
  p_clear_shelf boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_result jsonb;
  v_product_id uuid;
  v_item_id uuid;
begin
  v_result := public.save_verified_inventory_count(
    p_inventory_count_id,
    p_user_id,
    p_firebase_key,
    p_source,
    p_counted_stock,
    p_validity_date,
    p_gondola,
    p_shelf
  );

  v_product_id := nullif(v_result->>'product_id', '')::uuid;
  v_item_id := nullif(v_result->>'count_item_id', '')::uuid;

  if coalesce(p_clear_gondola, false) or coalesce(p_clear_shelf, false) then
    update public.products p
    set gondola = case when coalesce(p_clear_gondola, false) then null else p.gondola end,
        shelf = case when coalesce(p_clear_shelf, false) then null else p.shelf end,
        updated_at = now()
    where p.id = v_product_id;

    update public.inventory_count_items i
    set gondola = case when coalesce(p_clear_gondola, false) then null else i.gondola end,
        shelf = case when coalesce(p_clear_shelf, false) then null else i.shelf end
    where i.id = v_item_id;
  end if;

  return v_result || jsonb_build_object(
    'gondola_cleared', coalesce(p_clear_gondola, false),
    'shelf_cleared', coalesce(p_clear_shelf, false)
  );
end;
$function$;

revoke execute on function public.save_verified_inventory_count_v3(uuid,uuid,text,jsonb,numeric,date,text,text,boolean,boolean) from public;
revoke execute on function public.save_verified_inventory_count_v3(uuid,uuid,text,jsonb,numeric,date,text,text,boolean,boolean) from anon;
revoke execute on function public.save_verified_inventory_count_v3(uuid,uuid,text,jsonb,numeric,date,text,text,boolean,boolean) from authenticated;
grant execute on function public.save_verified_inventory_count_v3(uuid,uuid,text,jsonb,numeric,date,text,text,boolean,boolean) to service_role;
