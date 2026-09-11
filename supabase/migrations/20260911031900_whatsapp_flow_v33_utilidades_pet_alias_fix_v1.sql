create or replace function public.get_whatsapp_flow_segmented_terms_v1(p_section_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_requested text:=lower(trim(coalesce(p_section_key,'')));
  v_section text;
  v_title text;
  v_items jsonb:='[]'::jsonb;
begin
  v_section:=case v_requested
    when 'casa_pet' then 'utilidades_pet'
    else v_requested
  end;

  v_title:=case v_section
    when 'mercearia' then 'Mercearia'
    when 'limpeza' then 'Limpeza e lavanderia'
    when 'higiene' then 'Higiene e beleza'
    when 'bebidas' then 'Bebidas'
    when 'utilidades_pet' then 'Casa e pet'
    else '' end;

  if v_title='' then
    return jsonb_build_object('ok',false,'reason','invalid_section','term_items','[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.term_key,
    'main-content',jsonb_build_object('title',left(t.term_title,30),'metadata','Ver produtos disponíveis'),
    'on-click-action',jsonb_build_object('name','data_exchange','payload',jsonb_build_object(
      'trigger','nav_term_open_v1','term_key',t.term_key,'search_query',t.search_query
    ))
  ) order by t.sort_order,t.term_title),'[]'::jsonb)
  into v_items
  from public.get_whatsapp_flow_search_terms_v1(v_section) t;

  return jsonb_build_object(
    'ok',jsonb_array_length(v_items)>0,
    'section_title',v_title,
    'message','Escolha o tipo de produto. Carregaremos apenas os itens relacionados.',
    'term_items',v_items
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_segmented_terms_v1(text) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_segmented_terms_v1(text) to service_role;
