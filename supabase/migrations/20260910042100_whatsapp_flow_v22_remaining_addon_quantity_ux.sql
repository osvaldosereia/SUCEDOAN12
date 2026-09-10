create or replace function public.handle_whatsapp_flow_commercial_exchange_v22(
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
  v_context jsonb := '{}'::jsonb;
  v_product_id uuid;
  v_stock int;
  v_limit int;
  v_existing int;
  v_remaining int;
  v_quantities jsonb;
  v_products jsonb;
  v_count int;
begin
  v_result := public.handle_whatsapp_flow_commercial_exchange_v21(
    p_session_id,p_conversation_id,p_action,p_screen,p_data
  );
  if not coalesce((v_result->>'ok')::boolean,false) then return v_result; end if;

  v_response := coalesce(v_result->'response','{}'::jsonb);
  v_screen := coalesce(v_response->>'screen','');
  v_data := coalesce(v_response->'data','{}'::jsonb);

  select coalesce(context,'{}'::jsonb)
    into v_context
    from public.experience_sessions
   where id=p_session_id and conversation_id=p_conversation_id;

  if v_screen ~ '^PRODUTOS_[ABC]$' and jsonb_typeof(v_data->'products')='array' then
    select coalesce(jsonb_agg(x.item order by x.ord),'[]'::jsonb), count(*)::int
      into v_products,v_count
      from (
        select e.item,e.ord
          from jsonb_array_elements(v_data->'products') with ordinality e(item,ord)
          join public.products pr
            on coalesce(e.item->>'id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           and pr.id=(e.item->>'id')::uuid
           and pr.is_active=true
           and coalesce(pr.is_whatsapp_active,false)=true
           and coalesce(pr.price,0)>0
           and coalesce(pr.stock,0)>0
         where (
           select coalesce(sum(case
             when coalesce(a->>'product_id','')=pr.id::text
              and coalesce(a->>'quantity','') ~ '^[0-9]+$'
             then (a->>'quantity')::int else 0 end),0)
             from jsonb_array_elements(
               case when jsonb_typeof(v_context->'flow_pending_addons')='array'
                    then v_context->'flow_pending_addons' else '[]'::jsonb end
             ) a
         ) < least(6,greatest(0,floor(coalesce(pr.stock,0))::int))
         order by e.ord
         limit 20
      ) x;
    v_data := jsonb_set(v_data,'{products}',coalesce(v_products,'[]'::jsonb),true);
    if v_data ? 'result_note' then
      v_data := jsonb_set(v_data,'{result_note}',to_jsonb(coalesce(v_count,0)::text||' opções disponíveis'),true);
    end if;
    v_response := jsonb_set(v_response,'{data}',v_data,false);
  end if;

  if v_screen ~ '^PRODUTO_[ABC]$' then
    begin v_product_id := nullif(v_data->>'product_id','')::uuid; exception when others then v_product_id:=null; end;
    if v_product_id is not null then
      select floor(coalesce(stock,0))::int
        into v_stock
        from public.products
       where id=v_product_id
         and is_active=true
         and coalesce(is_whatsapp_active,false)=true
         and coalesce(price,0)>0;
      if found then
        select coalesce(sum(case
          when coalesce(a->>'product_id','')=v_product_id::text
           and coalesce(a->>'quantity','') ~ '^[0-9]+$'
          then (a->>'quantity')::int else 0 end),0)::int
          into v_existing
          from jsonb_array_elements(
            case when jsonb_typeof(v_context->'flow_pending_addons')='array'
                 then v_context->'flow_pending_addons' else '[]'::jsonb end
          ) a;
        v_limit := least(6,greatest(0,v_stock));
        v_remaining := greatest(0,v_limit-coalesce(v_existing,0));
        select coalesce(jsonb_agg(jsonb_build_object('id',g::text,'title',g::text) order by g),'[]'::jsonb)
          into v_quantities from generate_series(1,v_remaining) g;
        v_data := jsonb_set(v_data,'{quantities}',v_quantities,true);
        v_response := jsonb_set(v_response,'{data}',v_data,false);
      end if;
    end if;
  end if;

  return jsonb_set(v_result,'{response}',v_response,false);
end;
$function$;

revoke all on function public.handle_whatsapp_flow_commercial_exchange_v22(uuid,uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.handle_whatsapp_flow_commercial_exchange_v22(uuid,uuid,text,text,jsonb) to service_role;
