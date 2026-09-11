create or replace function public.get_whatsapp_flow_direct_search_v1(p_query text, p_page integer default 1, p_page_size integer default 12)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_query text:=left(regexp_replace(btrim(coalesce(p_query,'')),'\s+',' ','g'),80);
  v_page integer:=greatest(1,coalesce(p_page,1));
  v_page_size integer:=greatest(1,least(coalesce(p_page_size,12),20));
  v_result jsonb;
begin
  if char_length(v_query)<2 then
    return jsonb_build_object(
      'ok',false,'reason','query_too_short','query',v_query,
      'page',v_page,'page_size',v_page_size,'total',0,'has_more',false,
      'products','[]'::jsonb,'full_catalog_loaded',false,
      'source','deterministic_catalog_search','writes_executed',false,'pii_returned',false
    );
  end if;

  v_result:=public.get_whatsapp_flow_product_results_page_v2(v_query,v_page,v_page_size);
  return jsonb_build_object(
    'ok',true,
    'reason',case when coalesce((v_result->>'total')::int,0)>0 then 'results' else 'no_results' end,
    'query',v_result->>'query',
    'page',coalesce((v_result->>'page')::int,v_page),
    'page_size',coalesce((v_result->>'page_size')::int,v_page_size),
    'total',coalesce((v_result->>'total')::int,0),
    'has_more',coalesce((v_result->>'has_more')::boolean,false),
    'products',coalesce(v_result->'products','[]'::jsonb),
    'full_catalog_loaded',false,
    'source','deterministic_catalog_search',
    'writes_executed',false,
    'pii_returned',false
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_direct_search_v1(text,integer,integer) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_direct_search_v1(text,integer,integer) to service_role;

create or replace function public.get_whatsapp_flow_v34_direct_search_readiness_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_q text;
  v_r jsonb;
  v_tests int:=0;
  v_viable int:=0;
  v_invalid int:=0;
  v_oversized int:=0;
  v_max_returned int:=0;
  v_short jsonb;
begin
  foreach v_q in array array['leite','arroz','detergente','sabonete','shampoo'] loop
    v_tests:=v_tests+1;
    v_r:=public.get_whatsapp_flow_direct_search_v1(v_q,1,12);
    if coalesce((v_r->>'total')::int,0)>0 then v_viable:=v_viable+1; end if;
    v_max_returned:=greatest(v_max_returned,jsonb_array_length(coalesce(v_r->'products','[]'::jsonb)));
    if jsonb_array_length(coalesce(v_r->'products','[]'::jsonb))>12 then v_oversized:=v_oversized+1; end if;
    if exists (
      select 1 from jsonb_array_elements(coalesce(v_r->'products','[]'::jsonb)) p
      where nullif(p->>'id','') is null
         or nullif(p->>'name','') is null
         or coalesce((p->>'price')::numeric,0)<=0
         or coalesce((p->>'stock')::numeric,0)<=0
         or nullif(p->>'image_url','') is null
    ) then v_invalid:=v_invalid+1; end if;
  end loop;
  v_short:=public.get_whatsapp_flow_direct_search_v1(' ',1,12);
  return jsonb_build_object(
    'ok',v_tests=5 and v_viable=5 and v_invalid=0 and v_oversized=0 and v_max_returned<=12 and coalesce(v_short->>'reason','')='query_too_short',
    'sample_query_count',v_tests,
    'viable_query_count',v_viable,
    'invalid_query_result_count',v_invalid,
    'oversized_query_count',v_oversized,
    'max_products_returned',v_max_returned,
    'default_page_size',12,
    'hard_page_cap',20,
    'short_query_rejected',coalesce(v_short->>'reason','')='query_too_short',
    'full_catalog_loaded',false,
    'ai_authoritative_for_catalog',false,
    'source','deterministic_catalog_search',
    'writes_executed',false,
    'pii_returned',false
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v34_direct_search_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v34_direct_search_readiness_v1() to service_role;

create or replace function public.get_whatsapp_flow_v34_owner_homologation_readiness_v5(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_owner jsonb;
  v_direct jsonb;
  v_ok boolean;
begin
  v_owner:=public.get_whatsapp_flow_v33_owner_homologation_readiness_v4(p_session_id);
  v_direct:=public.get_whatsapp_flow_v34_direct_search_readiness_v1();
  v_ok:=coalesce((v_owner->>'ok')::boolean,false) and coalesce((v_direct->>'ok')::boolean,false);
  return v_owner || jsonb_build_object(
    'ok',v_ok,
    'readiness_version','v34-owner-v5',
    'direct_intent_search_ready',coalesce((v_direct->>'ok')::boolean,false),
    'direct_search_sample_query_count',coalesce((v_direct->>'sample_query_count')::int,0),
    'direct_search_viable_query_count',coalesce((v_direct->>'viable_query_count')::int,0),
    'direct_search_max_products_returned',coalesce((v_direct->>'max_products_returned')::int,0),
    'direct_search_hard_page_cap',20,
    'full_catalog_loaded',false,
    'ai_authoritative_for_catalog',false,
    'writes_executed',false,
    'pii_returned',false
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v34_owner_homologation_readiness_v5(uuid) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v34_owner_homologation_readiness_v5(uuid) to service_role;
