create or replace function public.papoai_resolve_basket_intent_v1(p_message text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_raw text:=coalesce(p_message,'');
  v_norm text;
  v_brand text:=null;
  v_size text:=null;
  v_sales_mode text:='legacy';
  v_candidates jsonb:='[]'::jsonb;
  v_count integer:=0;
begin
  v_norm:=regexp_replace(
    translate(lower(trim(v_raw)),
      'áàãâäéèêëíìîïóòõôöúùûüç',
      'aaaaaeeeeiiiiooooouuuuc'),
    '[^a-z0-9]+',' ','g'
  );
  v_norm:=regexp_replace(v_norm,'\s+',' ','g');

  if v_norm ~ '(^| )bonini( |$)' then v_brand:='bonini'; end if;
  if v_norm ~ '(^| )koblenz( |$)' then
    if v_brand is not null then
      return jsonb_build_object(
        'ok',true,'resolved',false,'ambiguous',true,'reason','multiple_brands',
        'normalized_message',v_norm,'candidates','[]'::jsonb
      );
    end if;
    v_brand:='koblenz';
  end if;

  if v_norm ~ '(^| )(economica|economico)( |$)' then v_size:='economica';
  elsif v_norm ~ '(^| )mini( |$)' then v_size:='mini';
  elsif v_norm ~ '(^| )pequena( |$)' then v_size:='pequena';
  elsif v_norm ~ '(^| )media( |$)' then v_size:='media';
  elsif v_norm ~ '(^| )grande( |$)' then v_size:='grande';
  end if;

  select coalesce(sales_mode,'legacy') into v_sales_mode
  from public.basket_sales_runtime_v1
  where id=1;

  with base as (
    select
      b.id,
      b.name,
      b.base_price,
      b.image_url,
      b.sort_order,
      translate(lower(b.name),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc') as n_name,
      case
        when v_sales_mode='split' then coalesce(sa.split_available,0)
        else coalesce(cl.quantity_available,0)
      end::numeric as available_quantity
    from public.basket_templates b
    left join public.basket_split_availability_v1 sa on sa.basket_id=b.id
    left join public.basket_current_lot_v1 cl on cl.basket_id=b.id
    where b.is_active=true
  ), filtered as (
    select *
    from base
    where (v_brand is null or n_name like '%'||v_brand||'%')
      and (
        v_size is null
        or (v_size='economica' and n_name like 'economica %')
        or (v_size='mini' and n_name like 'mini %')
        or (v_size='pequena' and n_name like 'pequena %')
        or (v_size='media' and n_name like 'media %')
        or (v_size='grande' and n_name like 'grande %')
      )
  )
  select count(*),coalesce(jsonb_agg(jsonb_build_object(
    'basket_id',id,
    'name',name,
    'price',base_price,
    'available_quantity',available_quantity,
    'available',available_quantity>0,
    'image_url',image_url
  ) order by sort_order nulls last,base_price,name),'[]'::jsonb)
  into v_count,v_candidates
  from filtered;

  if v_brand is null and v_size is null then
    return jsonb_build_object(
      'ok',true,'resolved',false,'ambiguous',false,'reason','basket_not_identified',
      'normalized_message',v_norm,'brand',v_brand,'size',v_size,'candidates','[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'ok',true,
    'resolved',v_count=1,
    'ambiguous',v_count>1,
    'reason',case when v_count=1 then 'exact_basket_match' when v_count>1 then 'multiple_candidates' else 'no_candidate' end,
    'normalized_message',v_norm,
    'brand',v_brand,
    'size',v_size,
    'sales_mode',v_sales_mode,
    'candidate_count',v_count,
    'candidates',v_candidates
  );
end;
$$;

revoke all on function public.papoai_resolve_basket_intent_v1(text) from public,anon,authenticated;
grant execute on function public.papoai_resolve_basket_intent_v1(text) to service_role;
