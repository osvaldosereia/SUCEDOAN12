-- Corrige concatenação do prefixo de dois caracteres no PostgreSQL.
create or replace function public.create_basket_commercial_model_v1(
  p_name text,
  p_category_id uuid,
  p_base_price numeric,
  p_operator text default 'Operação'
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_name text:=trim(coalesce(p_name,''));
  v_basket_id uuid;
  v_kit_template_id uuid;
  v_prefix text;
  v_i integer;
  v_sort integer;
begin
  if v_name='' then raise exception 'basket_name_required'; end if;
  if p_category_id is null or not exists(
    select 1 from public.basket_categories where id=p_category_id and is_active=true
  ) then raise exception 'basket_category_required'; end if;
  if p_base_price is null or p_base_price<0 then raise exception 'basket_price_invalid'; end if;

  select coalesce(max(sort_order),0)+10 into v_sort from public.basket_templates;
  insert into public.basket_templates(
    name,base_price,is_active,is_whatsapp_active,is_featured,uses_hygiene_kit,split_kits_enabled,category_id,sort_order,internal_notes
  ) values (
    v_name,round(p_base_price::numeric,2),true,true,false,false,true,p_category_id,v_sort,
    'Criado no fluxo unificado Cestas/Kits por '||coalesce(nullif(trim(p_operator),''),'Operação')
  ) returning id into v_basket_id;

  for v_i in 0..675 loop
    v_prefix:=chr(65+(v_i/26))||chr(65+(v_i%26));
    exit when not exists(select 1 from public.basket_kit_templates where code_prefix=v_prefix);
    v_prefix:=null;
  end loop;
  if v_prefix is null then raise exception 'basket_prefix_exhausted'; end if;

  insert into public.basket_kit_templates(
    kind,basket_id,name,code_prefix,is_active,sort_order,metadata
  ) values (
    'food',v_basket_id,v_name,v_prefix,true,0,
    jsonb_build_object('commercial_unified',true,'created_by',coalesce(nullif(trim(p_operator),''),'Operação'))
  ) returning id into v_kit_template_id;

  return jsonb_build_object(
    'basket_id',v_basket_id,
    'kit_template_id',v_kit_template_id,
    'code_prefix',v_prefix,
    'name',v_name,
    'category_id',p_category_id,
    'base_price',round(p_base_price::numeric,2)
  );
end
$$;

revoke all on function public.create_basket_commercial_model_v1(text,uuid,numeric,text) from public,anon,authenticated;
grant execute on function public.create_basket_commercial_model_v1(text,uuid,numeric,text) to service_role;