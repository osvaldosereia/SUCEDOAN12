begin;

create or replace function public.filter_whatsapp_flow_viable_terms_v1(p_terms jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  e jsonb;
  v_section text;
  v_term text;
  v_query text;
  v_results jsonb;
  v_out jsonb:='[]'::jsonb;
begin
  if jsonb_typeof(coalesce(p_terms,'null'::jsonb))<>'array' then
    return '[]'::jsonb;
  end if;

  for e in select value from jsonb_array_elements(p_terms)
  loop
    v_section:=split_part(coalesce(e->>'id',''),'::',1);
    v_term:=split_part(coalesce(e->>'id',''),'::',2);
    if v_section='' or v_term='' then continue; end if;

    select w.search_query into v_query
    from public.whatsapp_flow_search_terms w
    where w.enabled and w.section_key=v_section and w.term_key=v_term
    limit 1;
    if v_query is null then continue; end if;

    v_results:=public.get_whatsapp_flow_product_results_v1(v_query,1);
    if jsonb_array_length(coalesce(v_results->'products','[]'::jsonb))>0 then
      v_out:=v_out||jsonb_build_array(e);
    end if;
  end loop;
  return v_out;
end;
$$;

revoke all on function public.filter_whatsapp_flow_viable_terms_v1(jsonb) from public,anon,authenticated;
grant execute on function public.filter_whatsapp_flow_viable_terms_v1(jsonb) to service_role;

create or replace function public.handle_whatsapp_flow_commercial_exchange_v8(
  p_session_id uuid,
  p_conversation_id uuid,
  p_action text,
  p_screen text default null,
  p_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_result jsonb;
  v_response jsonb;
  v_data jsonb;
  v_screen text;
  v_terms jsonb;
begin
  v_result:=public.handle_whatsapp_flow_commercial_exchange_v7(
    p_session_id,p_conversation_id,p_action,p_screen,p_data
  );
  if not coalesce((v_result->>'ok')::boolean,false) then return v_result; end if;

  v_response:=coalesce(v_result->'response','{}'::jsonb);
  v_data:=coalesce(v_response->'data','{}'::jsonb);
  v_screen:=coalesce(v_response->>'screen','');

  if v_screen ~ '^TERMOS_[ABC]$' and jsonb_typeof(v_data->'terms')='array' then
    v_terms:=public.filter_whatsapp_flow_viable_terms_v1(v_data->'terms');
    v_response:=jsonb_set(v_response,'{data,terms}',v_terms,true);
    v_response:=jsonb_set(v_response,'{data,term_count}',to_jsonb(jsonb_array_length(v_terms)),true);
    if jsonb_array_length(v_terms)=0 then
      v_response:=jsonb_build_object(
        'screen',replace(v_screen,'TERMOS_','SECOES_'),
        'data',public.get_whatsapp_flow_extras_screen_v2(
          p_conversation_id,
          'Nenhum produto disponível agora nessas opções. Escolha outra seção ou faça uma busca direta.'
        )
      );
    end if;
  end if;

  return jsonb_set(v_result,'{response}',v_response,false);
end;
$$;

revoke all on function public.handle_whatsapp_flow_commercial_exchange_v8(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.handle_whatsapp_flow_commercial_exchange_v8(uuid,uuid,text,text,jsonb) to service_role;

update public.experience_definitions
set config=coalesce(config,'{}'::jsonb)||jsonb_build_object(
      'handler_version','v8',
      'hide_empty_search_terms',true,
      'catalog_query_only',true,
      'component_prices_visible',false
    ),
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('implementation_stage','viable_search_terms_v15'),
    updated_at=now()
where slug='flow-cestas-comercial-v1';

update public.automation_config
set whatsapp_live_canary_percent=1,
    experience_orchestrator_enabled=false,
    whatsapp_flow_data_exchange_enabled=false,
    whatsapp_flow_send_enabled=false,
    whatsapp_flow_commercial_write_enabled=false,
    bling_order_sync_enabled=false,
    updated_at=now()
where id=1;

commit;
