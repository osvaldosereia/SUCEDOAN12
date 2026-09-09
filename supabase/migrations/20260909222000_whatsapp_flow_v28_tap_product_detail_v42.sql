-- Dona Antonia WhatsApp Flow V28 tap-to-detail candidate.
-- Candidate only: does not change the live/default V3 definition and never enables Bling.

create or replace function public.get_whatsapp_flow_nav_menu_v1(
  p_session_id uuid,
  p_conversation_id uuid,
  p_message text default null
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_review jsonb;
  v_total text;
  v_items jsonb:='[]'::jsonb;
begin
  v_review:=public.get_whatsapp_flow_premium_review_v1(p_conversation_id);
  v_total:=coalesce(v_review->>'total','R$ 0,00');
  v_items:=jsonb_build_array(
    jsonb_build_object('id','revisar','main-content',jsonb_build_object('title','Finalizar pedido','metadata','Total atual: '||v_total),'on-click-action',jsonb_build_object('name','data_exchange','payload',jsonb_build_object('trigger','nav_menu_action_v1','choice','revisar'))),
    jsonb_build_object('id','mercearia','main-content',jsonb_build_object('title','Mercearia','metadata','Arroz, feijão, café, massas e mais'),'on-click-action',jsonb_build_object('name','data_exchange','payload',jsonb_build_object('trigger','nav_menu_action_v1','choice','mercearia'))),
    jsonb_build_object('id','limpeza','main-content',jsonb_build_object('title','Limpeza e lavanderia','metadata','Casa, cozinha, roupas e limpeza'),'on-click-action',jsonb_build_object('name','data_exchange','payload',jsonb_build_object('trigger','nav_menu_action_v1','choice','limpeza'))),
    jsonb_build_object('id','higiene','main-content',jsonb_build_object('title','Higiene e beleza','metadata','Cuidados pessoais e beleza'),'on-click-action',jsonb_build_object('name','data_exchange','payload',jsonb_build_object('trigger','nav_menu_action_v1','choice','higiene'))),
    jsonb_build_object('id','bebidas','main-content',jsonb_build_object('title','Bebidas','metadata','Água, sucos, refrigerantes e mais'),'on-click-action',jsonb_build_object('name','data_exchange','payload',jsonb_build_object('trigger','nav_menu_action_v1','choice','bebidas'))),
    jsonb_build_object('id','casa_pet','main-content',jsonb_build_object('title','Casa e pet','metadata','Utilidades, casa e produtos pet'),'on-click-action',jsonb_build_object('name','data_exchange','payload',jsonb_build_object('trigger','nav_menu_action_v1','choice','casa_pet'))),
    jsonb_build_object('id','buscar','main-content',jsonb_build_object('title','Buscar produto','metadata','Digite o nome do que procura'),'on-click-action',jsonb_build_object('name','data_exchange','payload',jsonb_build_object('trigger','nav_menu_action_v1','choice','buscar')))
  );
  return jsonb_build_object('menu_items',v_items,'message',left(coalesce(p_message,''),200));
end;
$$;

create or replace function public.get_whatsapp_flow_nav_products_v1(
  p_conversation_id uuid,
  p_mode text,
  p_key text,
  p_title text,
  p_page integer default 1,
  p_allow_more boolean default true
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_picker jsonb;
  v_opts jsonb;
  v_items jsonb:='[]'::jsonb;
  v_actions jsonb:='[]'::jsonb;
  v_opt jsonb;
  v_review jsonb;
  v_total text;
  v_has_more boolean:=false;
  v_id text;
  v_name text;
  v_desc text;
  v_image text;
  v_price text;
  i integer;
begin
  v_picker:=public.get_whatsapp_flow_premium_product_picker_v1(p_conversation_id,p_mode,p_key,p_title,greatest(1,coalesce(p_page,1)));
  v_opts:=coalesce(v_picker->'product_options','[]'::jsonb);
  v_has_more:=coalesce((v_picker->>'has_more')::boolean,false);
  for i in 0..greatest(-1,jsonb_array_length(v_opts)-1) loop
    exit when i>=20;
    v_opt:=v_opts->i;
    v_id:=coalesce(v_opt->>'id','');
    v_name:=left(coalesce(v_opt->>'title','Produto'),30);
    v_desc:=left(regexp_replace(coalesce(v_opt->>'description',''),'^[^·]+·?\s*',''),20);
    v_image:=left(coalesce(v_opt->>'image_url',''),2000);
    v_price:=left(split_part(coalesce(v_opt->>'description','R$ 0,00'),' · ',1),10);
    v_items:=v_items||jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'id',v_id,
      'main-content',jsonb_build_object('title',v_name,'description',nullif(v_desc,''),'metadata','Toque para ver detalhes'),
      'start',case when v_image<>'' then jsonb_build_object('image_url',v_image,'alt-text',v_name) else null end,
      'end',jsonb_build_object('title',v_price),
      'on-click-action',jsonb_build_object('name','data_exchange','payload',jsonb_build_object('trigger','nav_product_open_v1','product_id',v_id))
    )));
  end loop;
  v_review:=public.get_whatsapp_flow_premium_review_v1(p_conversation_id);
  v_total:=coalesce(v_review->>'total','R$ 0,00');
  v_actions:=jsonb_build_array(
    jsonb_build_object('id','revisar','main-content',jsonb_build_object('title','Finalizar pedido','metadata','Total atual: '||v_total),'on-click-action',jsonb_build_object('name','data_exchange','payload',jsonb_build_object('trigger','nav_product_action_v1','choice','revisar'))),
    jsonb_build_object('id','menu','main-content',jsonb_build_object('title','Outra categoria ou busca','metadata','Voltar às opções de produtos'),'on-click-action',jsonb_build_object('name','data_exchange','payload',jsonb_build_object('trigger','nav_product_action_v1','choice','menu')))
  );
  if p_allow_more and v_has_more then
    v_actions:=v_actions||jsonb_build_array(jsonb_build_object('id','mais','main-content',jsonb_build_object('title','Ver mais produtos','metadata','Carregar os próximos 20'),'on-click-action',jsonb_build_object('name','data_exchange','payload',jsonb_build_object('trigger','nav_product_action_v1','choice','mais'))));
  end if;
  return jsonb_build_object(
    'action_items',v_actions,
    'product_items',v_items,
    'has_products',jsonb_array_length(v_items)>0,
    'has_more',v_has_more,
    'page_number',greatest(1,coalesce(p_page,1)),
    'product_ids',coalesce((select jsonb_agg(x->>'id') from jsonb_array_elements(v_items) x),'[]'::jsonb)
  );
end;
$$;

create or replace function public.get_whatsapp_flow_nav_product_detail_v1(
  p_product_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_product jsonb;
  v_stock integer;
  v_qty jsonb;
  v_meta text;
begin
  v_product:=public.get_whatsapp_sellable_product_v1(p_product_id);
  if v_product is null then return jsonb_build_object('ok',false,'reason','product_not_sellable'); end if;
  v_stock:=greatest(0,floor(coalesce((v_product->>'stock')::numeric,0))::integer);
  if v_stock<1 then return jsonb_build_object('ok',false,'reason','product_out_of_stock'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',g::text,'title',case when g=1 then '1 unidade' else g::text||' unidades' end) order by g),'[]'::jsonb) into v_qty from generate_series(1,least(6,v_stock)) g;
  v_meta:=concat_ws(' · ',nullif(trim(coalesce(v_product->>'brand','')),''),nullif(trim(coalesce(v_product->>'packaging','')),''));
  return jsonb_build_object(
    'ok',true,
    'product_name',left(coalesce(v_product->>'name','Produto'),120),
    'product_price','R$ '||replace(to_char(coalesce((v_product->>'price')::numeric,0),'FM999999990.00'),'.',','),
    'product_meta',left(coalesce(v_meta,''),120),
    'product_description','Confira o produto e escolha a quantidade antes de adicionar ao pedido.',
    'product_image_url',left(coalesce(v_product->>'image_url',''),2000),
    'product_image_base64','',
    'has_product_image',false,
    'quantity_options',v_qty,
    'init_values',jsonb_build_object('quantity','1'),
    'stock',v_stock
  );
end;
$$;

create or replace function public.handle_whatsapp_flow_commercial_exchange_v16(
  p_session_id uuid,
  p_conversation_id uuid,
  p_action text,
  p_screen text default null,
  p_data jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  s public.experience_sessions%rowtype;
  v_screen text:=coalesce(p_screen,'');
  v_trigger text:=coalesce(p_data->>'trigger','');
  v_round text:='A';
  v_rounds text:='ABCDEFGHIJKL';
  v_pos integer:=1;
  v_next text;
  v_choice text;
  v_mode text;
  v_key text;
  v_title text;
  v_query text;
  v_page integer:=1;
  v_nav jsonb;
  v_detail jsonb;
  v_allowed jsonb;
  v_product_id uuid;
  v_product jsonb;
  v_qty integer;
  v_stock integer;
  v_state integer;
  v_op text;
  v_write jsonb:=public.get_whatsapp_flow_commercial_write_readiness_v1();
  v_review jsonb;
  v_result jsonb;
  v_response jsonb;
  v_data jsonb;
begin
  if v_screen ~ '_(A|B|C|D|E|F|G|H|I|J|K|L)$' then v_round:=right(v_screen,1); end if;
  v_pos:=strpos(v_rounds,v_round);
  if v_pos>0 and v_pos<length(v_rounds) then v_next:=substr(v_rounds,v_pos+1,1); else v_next:=null; end if;
  select * into s from public.experience_sessions where id=p_session_id for update;
  if not found or s.conversation_id is distinct from p_conversation_id then return jsonb_build_object('ok',false,'reason','flow_session_not_found'); end if;
  if s.expires_at<=now() or s.status not in ('offered','open') then return jsonb_build_object('ok',false,'reason','flow_session_inactive'); end if;

  if p_action='data_exchange' and v_screen ~ '^MENU_[A-L]$' and v_trigger='nav_menu_action_v1' then
    if coalesce(s.flow_current_screen,'')<>'MENU' then return jsonb_build_object('ok',false,'reason','flow_transition_invalid'); end if;
    v_choice:=lower(trim(coalesce(p_data->>'choice','')));
    if v_choice='revisar' then
      v_review:=public.get_whatsapp_flow_premium_review_v1(p_conversation_id);
      update public.experience_sessions set flow_current_screen='REVISAO',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
      return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','REVISAO','data',v_review));
    elsif v_choice='buscar' then
      update public.experience_sessions set flow_current_screen='BUSCA',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
      return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','BUSCA_'||v_round,'data',jsonb_build_object('message','Digite pelo menos 2 letras para buscar.')));
    elsif v_choice in ('mercearia','limpeza','higiene','bebidas','casa_pet') then
      v_mode:='section';v_key:=v_choice;v_page:=1;
      v_title:=case v_choice when 'mercearia' then 'Mercearia' when 'limpeza' then 'Limpeza e lavanderia' when 'higiene' then 'Higiene e beleza' when 'bebidas' then 'Bebidas' else 'Casa e pet' end;
      v_nav:=public.get_whatsapp_flow_nav_products_v1(p_conversation_id,v_mode,v_key,v_title,v_page,true);
      if not coalesce((v_nav->>'has_products')::boolean,false) then return jsonb_build_object('ok',true,'response',jsonb_build_object('screen',v_screen,'data',public.get_whatsapp_flow_nav_menu_v1(s.id,p_conversation_id,'Nenhum produto disponível nessa categoria.'))); end if;
      update public.experience_sessions set context=coalesce(context,'{}'::jsonb)||jsonb_build_object('flow_browse_mode',v_mode,'flow_browse_key',v_key,'flow_query_title',v_title,'flow_products_page',v_page,'flow_product_option_ids',v_nav->'product_ids'),flow_current_screen='PRODUTOS',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
      return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','PRODUTOS_'||v_round,'data',v_nav-'product_ids'-'has_products'-'has_more'-'page_number'));
    end if;
    return jsonb_build_object('ok',false,'reason','invalid_menu_choice');
  end if;

  if p_action='data_exchange' and v_screen ~ '^BUSCA_[A-L]$' and v_trigger='nav_search_v1' then
    if coalesce(s.flow_current_screen,'')<>'BUSCA' then return jsonb_build_object('ok',false,'reason','flow_transition_invalid'); end if;
    v_query:=left(trim(coalesce(p_data->>'direct_query','')),80);
    if length(v_query)<2 then return jsonb_build_object('ok',true,'response',jsonb_build_object('screen',v_screen,'data',jsonb_build_object('message','Digite pelo menos 2 letras para buscar.'))); end if;
    v_mode:='query';v_key:=v_query;v_title:=v_query;v_page:=1;
    v_nav:=public.get_whatsapp_flow_nav_products_v1(p_conversation_id,v_mode,v_key,v_title,v_page,true);
    if not coalesce((v_nav->>'has_products')::boolean,false) then return jsonb_build_object('ok',true,'response',jsonb_build_object('screen',v_screen,'data',jsonb_build_object('message','Não encontrei produto disponível. Tente outro nome.'))); end if;
    update public.experience_sessions set context=coalesce(context,'{}'::jsonb)||jsonb_build_object('flow_browse_mode',v_mode,'flow_browse_key',v_key,'flow_query_title',v_title,'flow_products_page',v_page,'flow_product_option_ids',v_nav->'product_ids'),flow_current_screen='PRODUTOS',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
    return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','PRODUTOS_'||v_round,'data',v_nav-'product_ids'-'has_products'-'has_more'-'page_number'));
  end if;

  if p_action='data_exchange' and v_screen ~ '^PRODUTOS_[A-L]$' and v_trigger='nav_product_action_v1' then
    if coalesce(s.flow_current_screen,'')<>'PRODUTOS' then return jsonb_build_object('ok',false,'reason','flow_transition_invalid'); end if;
    v_choice:=lower(trim(coalesce(p_data->>'choice','')));
    if v_choice='revisar' then
      v_review:=public.get_whatsapp_flow_premium_review_v1(p_conversation_id);
      update public.experience_sessions set flow_current_screen='REVISAO',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
      return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','REVISAO','data',v_review));
    end if;
    if v_next is null then
      v_review:=public.get_whatsapp_flow_premium_review_v1(p_conversation_id);
      update public.experience_sessions set flow_current_screen='REVISAO',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
      return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','REVISAO','data',v_review));
    end if;
    if v_choice='menu' then
      update public.experience_sessions set flow_current_screen='MENU',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
      return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','MENU_'||v_next,'data',public.get_whatsapp_flow_nav_menu_v1(s.id,p_conversation_id,'Escolha outra categoria ou busque pelo nome.')));
    elsif v_choice='mais' then
      v_mode:=coalesce(s.context->>'flow_browse_mode','');v_key:=coalesce(s.context->>'flow_browse_key','');v_title:=coalesce(s.context->>'flow_query_title',v_key);
      begin v_page:=greatest(1,coalesce((s.context->>'flow_products_page')::integer,1))+1; exception when others then v_page:=2; end;
      v_nav:=public.get_whatsapp_flow_nav_products_v1(p_conversation_id,v_mode,v_key,v_title,v_page,true);
      if not coalesce((v_nav->>'has_products')::boolean,false) then
        update public.experience_sessions set flow_current_screen='MENU',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
        return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','MENU_'||v_next,'data',public.get_whatsapp_flow_nav_menu_v1(s.id,p_conversation_id,'Não há mais produtos nessa opção.')));
      end if;
      update public.experience_sessions set context=coalesce(context,'{}'::jsonb)||jsonb_build_object('flow_products_page',v_page,'flow_product_option_ids',v_nav->'product_ids'),flow_current_screen='PRODUTOS',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
      return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','PRODUTOS_'||v_next,'data',v_nav-'product_ids'-'has_products'-'has_more'-'page_number'));
    end if;
    return jsonb_build_object('ok',false,'reason','invalid_product_action');
  end if;

  if p_action='data_exchange' and v_screen ~ '^PRODUTOS_[A-L]$' and v_trigger='nav_product_open_v1' then
    if coalesce(s.flow_current_screen,'')<>'PRODUTOS' then return jsonb_build_object('ok',false,'reason','flow_transition_invalid'); end if;
    begin v_product_id:=(p_data->>'product_id')::uuid; exception when others then return jsonb_build_object('ok',false,'reason','invalid_product_id'); end;
    v_allowed:=coalesce(s.context->'flow_product_option_ids','[]'::jsonb);
    if not (v_allowed @> jsonb_build_array(v_product_id::text)) then return jsonb_build_object('ok',false,'reason','product_selection_out_of_page'); end if;
    v_detail:=public.get_whatsapp_flow_nav_product_detail_v1(v_product_id);
    if not coalesce((v_detail->>'ok')::boolean,false) then return jsonb_build_object('ok',false,'reason',coalesce(v_detail->>'reason','product_detail_failed')); end if;
    update public.experience_sessions set context=coalesce(context,'{}'::jsonb)||jsonb_build_object('flow_open_product_id',v_product_id::text),flow_current_screen='PRODUTO',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
    return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','PRODUTO_'||v_round,'data',v_detail-'ok'-'stock'));
  end if;

  if p_action='data_exchange' and v_screen ~ '^PRODUTO_[A-L]$' and v_trigger='nav_product_add_v1' then
    if coalesce(s.flow_current_screen,'')<>'PRODUTO' then return jsonb_build_object('ok',false,'reason','flow_transition_invalid'); end if;
    begin v_product_id:=(s.context->>'flow_open_product_id')::uuid; exception when others then return jsonb_build_object('ok',false,'reason','invalid_product_context'); end;
    begin v_qty:=coalesce(nullif(trim(p_data->>'quantity'),''),'1')::integer; exception when others then return jsonb_build_object('ok',false,'reason','invalid_quantity'); end;
    v_product:=public.get_whatsapp_sellable_product_v1(v_product_id);
    if v_product is null then return jsonb_build_object('ok',false,'reason','product_not_sellable'); end if;
    v_stock:=greatest(0,floor(coalesce((v_product->>'stock')::numeric,0))::integer);
    if v_qty<1 or v_qty>least(6,v_stock) then return jsonb_build_object('ok',false,'reason','invalid_quantity'); end if;
    if not coalesce((v_write->>'ready')::boolean,false) then return jsonb_build_object('ok',false,'reason','commercial_write_not_ready'); end if;
    v_state:=coalesce(s.flow_state_version,0);
    v_op:=replace(s.id::text,'-','')||':navadd:'||v_state::text||':'||replace(v_product_id::text,'-','');
    perform public.apply_whatsapp_flow_commercial_write_v1(s.id,v_state,v_op,'set_addon',jsonb_build_object('product_id',v_product_id,'quantity',v_qty));
    if v_next is null then
      v_review:=public.get_whatsapp_flow_premium_review_v1(p_conversation_id);
      update public.experience_sessions set flow_current_screen='REVISAO',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
      return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','REVISAO','data',v_review));
    end if;
    v_mode:=coalesce(s.context->>'flow_browse_mode','');v_key:=coalesce(s.context->>'flow_browse_key','');v_title:=coalesce(s.context->>'flow_query_title',v_key);
    begin v_page:=greatest(1,coalesce((s.context->>'flow_products_page')::integer,1)); exception when others then v_page:=1; end;
    v_nav:=public.get_whatsapp_flow_nav_products_v1(p_conversation_id,v_mode,v_key,v_title,v_page,true);
    update public.experience_sessions set context=coalesce(context,'{}'::jsonb)||jsonb_build_object('flow_product_option_ids',v_nav->'product_ids') - 'flow_open_product_id',flow_current_screen='PRODUTOS',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
    return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','PRODUTOS_'||v_next,'data',v_nav-'product_ids'-'has_products'-'has_more'-'page_number'));
  end if;

  v_result:=public.handle_whatsapp_flow_commercial_exchange_v15(p_session_id,p_conversation_id,p_action,p_screen,p_data);
  if not coalesce((v_result->>'ok')::boolean,false) then return v_result; end if;
  v_response:=coalesce(v_result->'response','{}'::jsonb);
  v_data:=coalesce(v_response->'data','{}'::jsonb);
  if coalesce(v_response->>'screen','') ~ '^SECOES_[ABC]$' then
    update public.experience_sessions set flow_current_screen='MENU',updated_at=now() where id=s.id;
    return jsonb_set(v_result,'{response}',jsonb_build_object('screen','MENU_A','data',public.get_whatsapp_flow_nav_menu_v1(s.id,p_conversation_id,'Sua cesta está pronta. Finalize ou adicione produtos.')),false);
  end if;
  return v_result;
end;
$$;

revoke all on function public.get_whatsapp_flow_nav_menu_v1(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.get_whatsapp_flow_nav_products_v1(uuid,text,text,text,integer,boolean) from public,anon,authenticated;
revoke all on function public.get_whatsapp_flow_nav_product_detail_v1(uuid) from public,anon,authenticated;
revoke all on function public.handle_whatsapp_flow_commercial_exchange_v16(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_nav_menu_v1(uuid,uuid,text) to service_role;
grant execute on function public.get_whatsapp_flow_nav_products_v1(uuid,text,text,text,integer,boolean) to service_role;
grant execute on function public.get_whatsapp_flow_nav_product_detail_v1(uuid) to service_role;
grant execute on function public.handle_whatsapp_flow_commercial_exchange_v16(uuid,uuid,text,text,jsonb) to service_role;

insert into public.experience_definitions(slug,feature_key,experience_type,purpose,status,provider,provider_id,provider_version,schema_version,config,metadata)
select
  'flow-cestas-comercial-v5',feature_key,experience_type,purpose,'draft',provider,null,provider_version,schema_version,
  coalesce(config,'{}'::jsonb)||jsonb_build_object(
    'handler_version','v16','flow_json_version','v28','products_per_page',20,
    'product_selection_mode','tap_detail_quantity_add','product_detail_large_image',true,
    'product_list_checkbox',false,'max_product_add_rounds',12,
    'production_enabled',false,'bling_sync_enabled',false
  ),
  coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
    'candidate_not_live',true,'default_for_new_sessions',false,
    'ux_revision','tap_product_detail_v28','created_at',now()
  )
from public.experience_definitions where slug='flow-cestas-comercial-v4'
on conflict(slug) do update set status='draft',provider_id=null,config=excluded.config,metadata=excluded.metadata,updated_at=now();
