-- Backfill idempotente do runtime V31 já comprovado no Supabase.
-- Não muda comportamento do ambiente atual; torna o main reproduzível.

create or replace function public.handle_whatsapp_flow_commercial_exchange_v18(
  p_session_id uuid,
  p_conversation_id uuid,
  p_action text,
  p_screen text default null,
  p_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
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

create or replace function public.handle_whatsapp_flow_commercial_exchange_v19(
  p_session_id uuid,
  p_conversation_id uuid,
  p_action text,
  p_screen text default null,
  p_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_result jsonb;
  v_response jsonb;
  v_data jsonb;
  v_screen text;
  v_items jsonb;
begin
  v_result := public.handle_whatsapp_flow_commercial_exchange_v18(
    p_session_id,p_conversation_id,p_action,p_screen,p_data
  );
  if not coalesce((v_result->>'ok')::boolean,false) then
    return v_result;
  end if;

  v_response := coalesce(v_result->'response','{}'::jsonb);
  v_screen := coalesce(v_response->>'screen','');
  v_data := coalesce(v_response->'data','{}'::jsonb);

  if v_screen ~ '^PRODUTO_[ABC]$' then
    if jsonb_typeof(v_data->'quantities')='array' then
      select coalesce(jsonb_agg(x.e order by x.ord),'[]'::jsonb)
        into v_items
        from (
          select e,ord
          from jsonb_array_elements(v_data->'quantities') with ordinality a(e,ord)
          where coalesce((e->>'id')::int,0) between 1 and 6
          order by ord
          limit 6
        ) x;
      v_data := jsonb_set(v_data,'{quantities}',v_items,true);
    end if;
    v_data := v_data || jsonb_build_object(
      'product_id',left(coalesce(v_data->>'product_id',''),80),
      'product_name',left(coalesce(v_data->>'product_name','Produto'),120),
      'product_price',left(coalesce(v_data->>'product_price',''),40),
      'product_description',left(coalesce(v_data->>'product_description',''),240),
      'product_image_base64',coalesce(v_data->>'product_image_base64',''),
      'has_product_image',coalesce((v_data->>'has_product_image')::boolean,false)
    );
    v_response := jsonb_set(v_response,'{data}',v_data,false);
  end if;

  return jsonb_set(v_result,'{response}',v_response,false);
end;
$function$;

create or replace function public.handle_whatsapp_flow_commercial_exchange_v20(
  p_session_id uuid,
  p_conversation_id uuid,
  p_action text,
  p_screen text default null,
  p_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_result jsonb;
  v_response jsonb;
  v_data jsonb;
  v_screen text;
  v_product_id uuid;
  v_qty int;
  v_stock int;
  v_limit int;
  v_quantities jsonb;
  v_preview jsonb;
begin
  if coalesce(p_screen,'') ~ '^PRODUTO_[ABC]$' and coalesce(p_data->>'trigger','')='add_product' then
    begin v_product_id:=(p_data->>'product_id')::uuid; exception when others then return jsonb_build_object('ok',false,'reason','invalid_product_id'); end;
    begin v_qty:=(p_data->>'quantity')::int; exception when others then return jsonb_build_object('ok',false,'reason','invalid_quantity'); end;
    select floor(coalesce(stock,0))::int into v_stock
    from public.products
    where id=v_product_id and is_active=true and coalesce(is_whatsapp_active,false)=true and coalesce(price,0)>0;
    if not found then return jsonb_build_object('ok',false,'reason','product_not_sellable'); end if;
    v_limit:=least(6,greatest(0,v_stock));
    if v_qty<1 or v_qty>v_limit then
      return jsonb_build_object('ok',false,'reason','quantity_exceeds_available_stock','available_quantity',v_limit);
    end if;
  end if;

  v_result:=public.handle_whatsapp_flow_commercial_exchange_v19(p_session_id,p_conversation_id,p_action,p_screen,p_data);
  if not coalesce((v_result->>'ok')::boolean,false) then return v_result; end if;
  v_response:=coalesce(v_result->'response','{}'::jsonb);
  v_screen:=coalesce(v_response->>'screen','');
  v_data:=coalesce(v_response->'data','{}'::jsonb);

  if v_screen ~ '^PRODUTO_[ABC]$' then
    begin v_product_id:=(v_data->>'product_id')::uuid; exception when others then v_product_id:=null; end;
    if v_product_id is not null then
      select floor(coalesce(stock,0))::int into v_stock
      from public.products
      where id=v_product_id and is_active=true and coalesce(is_whatsapp_active,false)=true and coalesce(price,0)>0;
      if found then
        v_limit:=least(6,greatest(0,v_stock));
        select coalesce(jsonb_agg(jsonb_build_object('id',g::text,'title',g::text) order by g),'[]'::jsonb)
          into v_quantities from generate_series(1,v_limit) g;
        v_data:=jsonb_set(v_data,'{quantities}',v_quantities,true);
        v_response:=jsonb_set(v_response,'{data}',v_data,false);
      end if;
    end if;
  end if;

  if v_screen in ('REVISAO','FINALIZAR') then
    v_preview:=public.format_whatsapp_flow_session_preview_v1(p_session_id);
    if coalesce((v_preview->>'ok')::boolean,false) then
      if v_screen='REVISAO' then
        v_data:=v_data||jsonb_build_object('summary',v_preview->>'summary','total',v_preview->>'total','pricing_note',v_preview->>'pricing_note');
      else
        v_data:=v_data||jsonb_build_object('final_summary',v_preview->>'summary','final_total',v_preview->>'total');
      end if;
      v_response:=jsonb_set(v_response,'{data}',v_data,false);
    end if;
  end if;

  return jsonb_set(v_result,'{response}',v_response,false);
end;
$function$;

create or replace function public.handle_whatsapp_flow_commercial_exchange_v21(
  p_session_id uuid,
  p_conversation_id uuid,
  p_action text,
  p_screen text default null,
  p_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_product_id uuid;
  v_qty int;
  v_stock int;
  v_limit int;
  v_existing_qty int:=0;
  v_context jsonb;
begin
  if coalesce(p_screen,'') ~ '^PRODUTO_[ABC]$'
     and coalesce(p_data->>'trigger','')='add_product' then
    begin
      v_product_id:=(p_data->>'product_id')::uuid;
    exception when others then
      return jsonb_build_object('ok',false,'reason','invalid_product_id');
    end;
    begin
      v_qty:=(p_data->>'quantity')::int;
    exception when others then
      return jsonb_build_object('ok',false,'reason','invalid_quantity');
    end;

    select floor(coalesce(stock,0))::int
      into v_stock
      from public.products
     where id=v_product_id
       and is_active=true
       and coalesce(is_whatsapp_active,false)=true
       and coalesce(price,0)>0;
    if not found then
      return jsonb_build_object('ok',false,'reason','product_not_sellable');
    end if;

    select coalesce(context,'{}'::jsonb)
      into v_context
      from public.experience_sessions
     where id=p_session_id
       and conversation_id=p_conversation_id;
    if not found then
      return jsonb_build_object('ok',false,'reason','session_not_found');
    end if;

    if jsonb_typeof(v_context->'flow_pending_addons')='array' then
      select coalesce(sum(
        case when coalesce(e->>'product_id','')=v_product_id::text
             then case when coalesce(e->>'quantity','') ~ '^[0-9]+$' then (e->>'quantity')::int else 0 end
             else 0 end
      ),0)::int
        into v_existing_qty
        from jsonb_array_elements(v_context->'flow_pending_addons') e;
    end if;

    v_limit:=least(6,greatest(0,v_stock));
    if v_qty<1 or v_existing_qty+v_qty>v_limit then
      return jsonb_build_object(
        'ok',false,
        'reason','quantity_exceeds_available_stock',
        'available_quantity',greatest(0,v_limit-v_existing_qty),
        'already_selected_quantity',v_existing_qty,
        'maximum_total_quantity',v_limit
      );
    end if;
  end if;

  return public.handle_whatsapp_flow_commercial_exchange_v20(
    p_session_id,p_conversation_id,p_action,p_screen,p_data
  );
end;
$function$;

create or replace function public.handle_whatsapp_flow_commercial_exchange_v22(
  p_session_id uuid,
  p_conversation_id uuid,
  p_action text,
  p_screen text default null,
  p_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
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

revoke all on function public.handle_whatsapp_flow_commercial_exchange_v18(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.handle_whatsapp_flow_commercial_exchange_v19(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.handle_whatsapp_flow_commercial_exchange_v20(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.handle_whatsapp_flow_commercial_exchange_v21(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.handle_whatsapp_flow_commercial_exchange_v22(uuid,uuid,text,text,jsonb) from public,anon,authenticated;

grant execute on function public.handle_whatsapp_flow_commercial_exchange_v18(uuid,uuid,text,text,jsonb) to service_role;
grant execute on function public.handle_whatsapp_flow_commercial_exchange_v19(uuid,uuid,text,text,jsonb) to service_role;
grant execute on function public.handle_whatsapp_flow_commercial_exchange_v20(uuid,uuid,text,text,jsonb) to service_role;
grant execute on function public.handle_whatsapp_flow_commercial_exchange_v21(uuid,uuid,text,text,jsonb) to service_role;
grant execute on function public.handle_whatsapp_flow_commercial_exchange_v22(uuid,uuid,text,text,jsonb) to service_role;
