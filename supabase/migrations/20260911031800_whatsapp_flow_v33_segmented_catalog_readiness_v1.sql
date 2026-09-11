create or replace function public.get_whatsapp_flow_v33_segmented_catalog_readiness_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_section record;
  v_terms jsonb;
  v_term jsonb;
  v_search text;
  v_page jsonb;
  v_product jsonb;
  v_section_count int:=0;
  v_term_count int:=0;
  v_viable_term_count int:=0;
  v_product_count int:=0;
  v_max_page_products int:=0;
  v_empty_terms int:=0;
  v_invalid_products int:=0;
  v_oversized_pages int:=0;
  v_sections_without_terms int:=0;
  v_ok boolean:=true;
begin
  for v_section in select * from public.get_whatsapp_flow_sections_v1() order by sort_order,section_key loop
    v_section_count:=v_section_count+1;
    v_terms:=public.get_whatsapp_flow_segmented_terms_v1(v_section.section_key);
    if coalesce(jsonb_array_length(coalesce(v_terms->'term_items','[]'::jsonb)),0)=0 then
      v_sections_without_terms:=v_sections_without_terms+1;
      continue;
    end if;

    for v_term in select value from jsonb_array_elements(coalesce(v_terms->'term_items','[]'::jsonb)) loop
      v_term_count:=v_term_count+1;
      v_search:=nullif(btrim(v_term#>>'{on-click-action,payload,search_query}'),'');
      if v_search is null then
        v_empty_terms:=v_empty_terms+1;
        continue;
      end if;

      v_page:=public.get_whatsapp_flow_product_results_page_v2(v_search,1,20);
      if coalesce((v_page->>'total')::int,0)>0 then
        v_viable_term_count:=v_viable_term_count+1;
      end if;
      v_max_page_products:=greatest(v_max_page_products,coalesce(jsonb_array_length(coalesce(v_page->'products','[]'::jsonb)),0));
      if coalesce(jsonb_array_length(coalesce(v_page->'products','[]'::jsonb)),0)>20 then
        v_oversized_pages:=v_oversized_pages+1;
      end if;

      for v_product in select value from jsonb_array_elements(coalesce(v_page->'products','[]'::jsonb)) loop
        v_product_count:=v_product_count+1;
        if nullif(v_product->>'id','') is null
          or nullif(v_product->>'name','') is null
          or coalesce((v_product->>'price')::numeric,0)<=0
          or coalesce((v_product->>'stock')::numeric,0)<=0
          or nullif(v_product->>'image_url','') is null then
          v_invalid_products:=v_invalid_products+1;
        end if;
      end loop;
    end loop;
  end loop;

  v_ok:=v_section_count between 1 and 8
    and v_sections_without_terms=0
    and v_term_count between 1 and 80
    and v_empty_terms=0
    and v_viable_term_count>0
    and v_oversized_pages=0
    and v_max_page_products<=20
    and v_invalid_products=0;

  return jsonb_build_object(
    'ok',v_ok,
    'section_count',v_section_count,
    'term_count',v_term_count,
    'viable_term_count',v_viable_term_count,
    'sampled_product_count',v_product_count,
    'max_products_per_page',v_max_page_products,
    'page_cap',20,
    'sections_without_terms',v_sections_without_terms,
    'terms_without_search_query',v_empty_terms,
    'oversized_page_count',v_oversized_pages,
    'invalid_product_count',v_invalid_products,
    'full_catalog_loaded',false,
    'strategy','section_term_dynamic_search',
    'writes_executed',false,
    'pii_returned',false
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v33_segmented_catalog_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v33_segmented_catalog_readiness_v1() to service_role;

create or replace function public.get_whatsapp_flow_v33_owner_homologation_readiness_v4(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_owner jsonb;
  v_catalog jsonb;
  v_ok boolean;
begin
  v_owner:=public.get_whatsapp_flow_v32_owner_homologation_readiness_v3(p_session_id);
  v_catalog:=public.get_whatsapp_flow_v33_segmented_catalog_readiness_v1();
  v_ok:=coalesce((v_owner->>'ok')::boolean,false) and coalesce((v_catalog->>'ok')::boolean,false);
  return v_owner || jsonb_build_object(
    'ok',v_ok,
    'readiness_version','v33-owner-v4',
    'segmented_catalog_ready',coalesce((v_catalog->>'ok')::boolean,false),
    'catalog_section_count',coalesce((v_catalog->>'section_count')::int,0),
    'catalog_term_count',coalesce((v_catalog->>'term_count')::int,0),
    'catalog_viable_term_count',coalesce((v_catalog->>'viable_term_count')::int,0),
    'catalog_sampled_product_count',coalesce((v_catalog->>'sampled_product_count')::int,0),
    'catalog_max_products_per_page',coalesce((v_catalog->>'max_products_per_page')::int,0),
    'catalog_invalid_product_count',coalesce((v_catalog->>'invalid_product_count')::int,0),
    'full_catalog_loaded',false,
    'writes_executed',false,
    'pii_returned',false
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v33_owner_homologation_readiness_v4(uuid) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v33_owner_homologation_readiness_v4(uuid) to service_role;
