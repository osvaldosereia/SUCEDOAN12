create or replace function public.handle_whatsapp_flow_commercial_exchange_v11(
  p_session_id uuid,
  p_conversation_id uuid,
  p_action text,
  p_screen text default null,
  p_data jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_result jsonb;
  v_response jsonb;
  v_data jsonb;
  v_products jsonb;
begin
  v_result:=public.handle_whatsapp_flow_commercial_exchange_v10(p_session_id,p_conversation_id,p_action,p_screen,p_data);
  if not coalesce((v_result->>'ok')::boolean,false) then return v_result; end if;
  v_response:=coalesce(v_result->'response','{}'::jsonb);
  if coalesce(v_response->>'screen','')='UPSELL' and jsonb_typeof(v_response#>'{data,products}')='array' then
    select coalesce(jsonb_agg(e order by ord),'[]'::jsonb)
      into v_products
      from jsonb_array_elements(v_response#>'{data,products}') with ordinality x(e,ord)
     where ord<=3;
    v_data:=coalesce(v_response->'data','{}'::jsonb);
    v_data:=jsonb_set(v_data,'{products}',v_products,true);
    v_data:=jsonb_set(v_data,'{upsell_note}',to_jsonb('Sugestões opcionais. Se não quiser, é só continuar.'::text),true);
    v_response:=jsonb_set(v_response,'{data}',v_data,false);
    return jsonb_set(v_result,'{response}',v_response,false);
  end if;
  return v_result;
end;
$function$;

revoke all on function public.handle_whatsapp_flow_commercial_exchange_v11(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.handle_whatsapp_flow_commercial_exchange_v11(uuid,uuid,text,text,jsonb) to service_role;

update public.experience_definitions
set config=coalesce(config,'{}'::jsonb)||jsonb_build_object(
  'candidate_handler_version','v11',
  'candidate_products_per_page',3,
  'candidate_upsell_max',3,
  'candidate_product_quantity_max',6
),
metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'candidate_paging_version','v36',
  'candidate_not_live',true,
  'candidate_created_at',now()
),updated_at=now()
where slug='flow-cestas-comercial-v2';
