create or replace function public.get_whatsapp_flow_product_page_options_v1(p_query text,p_title text,p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare v_page jsonb; v_products jsonb; v_options jsonb; v_page_no integer:=greatest(1,coalesce(p_page,1)); v_has_more boolean:=false;
begin
  v_page:=public.get_whatsapp_flow_product_results_page_v1(p_query,v_page_no,3);
  v_products:=coalesce(v_page->'products','[]'::jsonb);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e->>'id','title',left(coalesce(e->>'name','Produto'),16)||' · R$ '||replace(coalesce(e->>'price','0'),'.',','),
    'description',left(trim(concat_ws(' · ',e->>'name',nullif(e->>'brand',''),nullif(e->>'packaging',''))),180),
    'image_url',coalesce(e->>'image_url',''),'alt-text',left(coalesce(e->>'name','Produto'),80)
  )),'[]'::jsonb) into v_options from jsonb_array_elements(v_products) e;
  v_has_more:=coalesce((v_page->>'has_more')::boolean,false);
  if v_has_more then v_options:=v_options||jsonb_build_array(jsonb_build_object('id','__more__','title','Ver mais produtos','description','Mostrar mais 3 opções')); end if;
  v_options:=v_options||jsonb_build_array(
    jsonb_build_object('id','__categories__','title','Outras categorias','description','Escolher outro tipo de produto'),
    jsonb_build_object('id','__finish__','title','Concluir pedido','description','Ir para revisão e sugestões'));
  return jsonb_build_object('query_title',left(coalesce(nullif(trim(p_title),''),p_query),80),
    'result_note',case when coalesce((v_page->>'total')::integer,0)=0 then 'Nenhum produto disponível' else 'Mostrando até 3 produtos · página '||v_page_no::text end,
    'products',v_options,'page',v_page_no,'has_more',v_has_more,'total',coalesce((v_page->>'total')::integer,0));
end;$function$;

create or replace function public.handle_whatsapp_flow_commercial_exchange_v10(p_session_id uuid,p_conversation_id uuid,p_action text,p_screen text default null,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  s public.experience_sessions%rowtype; v_result jsonb; v_response jsonb; v_data jsonb; v_screen text:=coalesce(p_screen,'');
  v_trigger text:=coalesce(p_data->>'trigger',''); v_product_choice text:=coalesce(p_data->>'product_id',''); v_round text:='A';
  v_query text; v_title text; v_page integer:=1; v_page_data jsonb; v_product_id uuid; v_qty numeric; v_stock integer; v_quantities jsonb; v_upsell jsonb;
begin
  if v_screen ~ '_(A|B|C)$' then v_round:=right(v_screen,1); end if;
  select * into s from public.experience_sessions where id=p_session_id for update;
  if not found or s.conversation_id is distinct from p_conversation_id then return jsonb_build_object('ok',false,'reason','flow_session_not_found'); end if;

  if p_action='data_exchange' and v_screen ~ '^PRODUTOS_[ABC]$' and v_trigger='product_selected' and v_product_choice like '__%__' then
    v_query:=coalesce(s.context->>'flow_query',''); v_title:=coalesce(nullif(s.context->>'flow_query_title',''),v_query);
    v_page:=greatest(1,coalesce((s.context->>'flow_products_page')::integer,1));
    if v_product_choice='__more__' then
      v_page:=v_page+1; v_page_data:=public.get_whatsapp_flow_product_page_options_v1(v_query,v_title,v_page);
      if coalesce((v_page_data->>'total')::integer,0)=0 or jsonb_array_length(coalesce(v_page_data->'products','[]'::jsonb))<=2 then
        v_page:=1; v_page_data:=public.get_whatsapp_flow_product_page_options_v1(v_query,v_title,v_page);
      end if;
      update public.experience_sessions set context=coalesce(context,'{}'::jsonb)||jsonb_build_object('flow_products_page',v_page),updated_at=now() where id=s.id;
      return jsonb_build_object('ok',true,'response',jsonb_build_object('screen',v_screen,'data',v_page_data));
    elsif v_product_choice='__categories__' then
      update public.experience_sessions set context=(coalesce(context,'{}'::jsonb)-'flow_products_page'),flow_current_screen='SECOES',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
      return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','SECOES_'||v_round,'data',public.get_whatsapp_flow_extras_screen_v2(p_conversation_id,'Escolha outra categoria ou conclua seu pedido.')));
    elsif v_product_choice='__finish__' then
      select coalesce(jsonb_agg(jsonb_build_object('id',u.product_id,'title',left(u.name,16)||' · R$ '||replace(u.price::text,'.',','),
        'description',left(coalesce(u.reason,'Sugestão opcional'),90),'image_url',coalesce(p.image_url,''),'alt-text',left(u.name,80)) order by u.score desc),'[]'::jsonb)
        into v_upsell from public.get_cart_aware_recommendations(p_conversation_id,3,'upsell') u left join public.products p on p.id=u.product_id;
      update public.experience_sessions set flow_current_screen='UPSELL',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
      return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','UPSELL','data',jsonb_build_object('upsell_note','Sugestões opcionais. Se não quiser, é só continuar.','products',v_upsell)));
    end if;
  end if;

  if p_action='data_exchange' and v_screen ~ '^PRODUTO_[ABC]$' and v_trigger='add_product' then
    begin v_product_id:=(p_data->>'product_id')::uuid; exception when others then return jsonb_build_object('ok',false,'reason','invalid_product_id'); end;
    begin v_qty:=(p_data->>'quantity')::numeric; exception when others then return jsonb_build_object('ok',false,'reason','invalid_quantity'); end;
    select greatest(0,floor(stock)::integer) into v_stock from public.products where id=v_product_id and physically_verified=true and is_active=true and is_whatsapp_active=true and coalesce(price,0)>0 and stock>0;
    if v_stock is null then return jsonb_build_object('ok',false,'reason','product_not_sellable'); end if;
    if v_qty<>trunc(v_qty) or v_qty<1 or v_qty>least(6,v_stock) then return jsonb_build_object('ok',false,'reason','invalid_quantity'); end if;
  end if;

  v_result:=public.handle_whatsapp_flow_commercial_exchange_v9(p_session_id,p_conversation_id,p_action,p_screen,p_data);
  if not coalesce((v_result->>'ok')::boolean,false) then return v_result; end if;
  v_response:=coalesce(v_result->'response','{}'::jsonb); v_screen:=coalesce(v_response->>'screen',''); v_data:=coalesce(v_response->'data','{}'::jsonb);

  if v_screen ~ '^PRODUTOS_[ABC]$' then
    select * into s from public.experience_sessions where id=p_session_id for update;
    v_query:=coalesce(s.context->>'flow_query',''); v_title:=coalesce(nullif(s.context->>'flow_query_title',''),v_query);
    v_page_data:=public.get_whatsapp_flow_product_page_options_v1(v_query,v_title,1);
    update public.experience_sessions set context=coalesce(context,'{}'::jsonb)||jsonb_build_object('flow_products_page',1),updated_at=now() where id=s.id;
    v_response:=jsonb_build_object('screen',v_screen,'data',v_page_data); return jsonb_set(v_result,'{response}',v_response,false);
  end if;

  if v_screen ~ '^PRODUTO_[ABC]$' then
    begin v_product_id:=(v_data->>'product_id')::uuid; exception when others then v_product_id:=null; end;
    if v_product_id is not null then
      select greatest(0,floor(stock)::integer) into v_stock from public.products where id=v_product_id;
      select coalesce(jsonb_agg(jsonb_build_object('id',g::text,'title',case when g=1 then '1 unidade' else g::text||' unidades' end) order by g),'[]'::jsonb)
        into v_quantities from generate_series(1,greatest(1,least(6,coalesce(v_stock,0)))) g;
      v_response:=jsonb_set(v_response,'{data,quantities}',v_quantities,true); return jsonb_set(v_result,'{response}',v_response,false);
    end if;
  end if;

  if v_screen='UPSELL' and jsonb_typeof(v_data->'products')='array' then
    v_response:=jsonb_set(v_response,'{data,products}',(v_data->'products')-3,true); return jsonb_set(v_result,'{response}',v_response,false);
  end if;
  return v_result;
end;$function$;

revoke all on function public.get_whatsapp_flow_product_page_options_v1(text,text,integer) from public,anon,authenticated;
revoke all on function public.handle_whatsapp_flow_commercial_exchange_v10(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_product_page_options_v1(text,text,integer) to service_role;
grant execute on function public.handle_whatsapp_flow_commercial_exchange_v10(uuid,uuid,text,text,jsonb) to service_role;
