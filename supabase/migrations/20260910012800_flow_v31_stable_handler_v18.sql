create or replace function public.handle_whatsapp_flow_commercial_exchange_v18(
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
  v_screen text;
  v_defaults jsonb;
  v_items jsonb;
begin
  v_result := public.handle_whatsapp_flow_commercial_exchange_v8(
    p_session_id,p_conversation_id,p_action,p_screen,p_data
  );
  if not coalesce((v_result->>'ok')::boolean,false) then
    return v_result;
  end if;

  v_response := coalesce(v_result->'response','{}'::jsonb);
  v_screen := coalesce(v_response->>'screen','');
  v_data := coalesce(v_response->'data','{}'::jsonb);

  if v_screen ~ '^SECOES_[ABC]$' then
    v_defaults := public.get_whatsapp_flow_extras_screen_v2(
      p_conversation_id,
      nullif(v_data->>'message','')
    );
    v_data := coalesce(v_defaults,'{}'::jsonb) || v_data;
    v_response := jsonb_set(v_response,'{data}',v_data,false);
  end if;

  if v_screen ~ '^TERMOS_[ABC]$' and jsonb_typeof(v_data->'terms')='array' then
    select coalesce(jsonb_agg(x.e order by x.ord),'[]'::jsonb)
      into v_items
      from (
        select e,ord
        from jsonb_array_elements(v_data->'terms') with ordinality a(e,ord)
        order by ord
        limit 20
      ) x;
    v_response := jsonb_set(v_response,'{data,terms}',v_items,true);
  end if;

  if v_screen ~ '^PRODUTOS_[ABC]$' and jsonb_typeof(v_data->'products')='array' then
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id',left(coalesce(x.e->>'id',''),80),
      'title',left(coalesce(x.e->>'title','Produto'),80),
      'description',left(coalesce(x.e->>'description',''),180)
    )) order by x.ord),'[]'::jsonb)
      into v_items
      from (
        select e,ord
        from jsonb_array_elements(v_data->'products') with ordinality a(e,ord)
        order by ord
        limit 20
      ) x;
    v_response := jsonb_set(v_response,'{data,products}',v_items,true);
  end if;

  if v_screen='UPSELL' and jsonb_typeof(v_data->'products')='array' then
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id',left(coalesce(x.e->>'id',''),80),
      'title',left(coalesce(x.e->>'title','Sugestão'),80),
      'description',left(coalesce(x.e->>'description',''),180)
    )) order by x.ord),'[]'::jsonb)
      into v_items
      from (
        select e,ord
        from jsonb_array_elements(v_data->'products') with ordinality a(e,ord)
        order by ord
        limit 6
      ) x;
    v_response := jsonb_set(v_response,'{data,products}',v_items,true);
    if not (v_response->'data' ? 'upsell_note') then
      v_response := jsonb_set(v_response,'{data,upsell_note}',to_jsonb('Sugestões opcionais para complementar seu pedido. Você pode continuar sem adicionar nada.'::text),true);
    end if;
  end if;

  return jsonb_set(v_result,'{response}',v_response,false);
end;
$function$;

revoke all on function public.handle_whatsapp_flow_commercial_exchange_v18(uuid,uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.handle_whatsapp_flow_commercial_exchange_v18(uuid,uuid,text,text,jsonb) to service_role;