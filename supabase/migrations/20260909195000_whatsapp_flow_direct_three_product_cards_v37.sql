-- Dona Antonia WhatsApp Flow V3 candidate.
-- Keeps V2 live; prepares a simpler V3 with 3 visual products per page,
-- quantity selected directly in the list, max min(6, stock), and no TERMOS/PRODUTO/UPSELL detours.

create or replace function public.get_whatsapp_flow_section_results_page_v1(
  p_section_key text,
  p_page integer default 1,
  p_page_size integer default 3
) returns jsonb
language sql
stable
security definer
set search_path=''
as $$
with params as (
  select lower(trim(coalesce(p_section_key,''))) section_key,
         greatest(1,coalesce(p_page,1)) pg,
         greatest(1,least(coalesce(p_page_size,3),3)) ps
), base as (
  select p.*
  from public.products p cross join params x
  where p.physically_verified=true
    and p.is_active=true
    and p.is_whatsapp_active=true
    and p.price is not null and p.price>=0 and coalesce(p.stock,0)>0
    and case x.section_key
      when 'mercearia' then upper(coalesce(p.category,'')) similar to '%(CAFÉ|BOLACHA|BISCOITO|MACARRÃO|MOLHO|MERCEARIA|BALA|CHICLETE|TEMPERO|CONFEITARIA|CHOCOLATE|DOCE|SALGADINHO|PETISCO|ARROZ|FEIJÃO|AÇÚCAR|OLEO|ÓLEO|FARINHA)%'
      when 'limpeza' then upper(coalesce(p.category,'')) similar to '%(LIMPEZA|LAVANDERIA)%'
      when 'higiene' then upper(coalesce(p.category,'')) similar to '%(HIGIENE|SHAMPOO|CONDICIONADOR|SABONETE|BELEZA|BEBÊ|BEBE)%'
      when 'bebidas' then upper(coalesce(p.category,'')) similar to '%(SUCO|REFRI|ENERGÉTICO|ENERGETICO|BEBIDA)%'
      when 'casa_pet' then upper(coalesce(p.category,'')) similar to '%(PET|UTILIDADE|CASA)%'
      else false end
), ranked as (
  select b.*,row_number() over(order by b.sort_order nulls last,b.name,b.id) rn,count(*) over() total_count from base b
), page_rows as (
  select r.* from ranked r,params x where r.rn>((x.pg-1)*x.ps) and r.rn<=(x.pg*x.ps)
), totals as (select coalesce(max(total_count),0)::integer total from ranked)
select jsonb_build_object(
  'section_key',(select section_key from params),'page',(select pg from params),'page_size',(select ps from params),
  'total',(select total from totals),'has_more',(select total>((select pg*ps from params)) from totals),
  'products',coalesce((select jsonb_agg(jsonb_build_object(
    'id',id,'name',name,'brand',brand,'packaging',packaging,'price',price,'stock',stock,'image_url',image_url,'category',category
  ) order by rn) from page_rows),'[]'::jsonb)
);
$$;

create or replace function public.get_whatsapp_flow_simple_extras_screen_v1(
  p_conversation_id uuid,
  p_message text default null
) returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare v_review jsonb; v_total text:='Pedido em montagem';
begin
  if p_conversation_id is not null then
    begin
      v_review:=public.format_whatsapp_flow_cart_review_v1(p_conversation_id);
      if coalesce((v_review->>'exists')::boolean,false) then v_total:='Total atual: '||coalesce(v_review->>'total',''); end if;
    exception when others then v_total:='Pedido em montagem'; end;
  end if;
  return jsonb_build_object(
    'message',left(coalesce(nullif(trim(p_message),''),'Escolha uma categoria ou busque pelo nome.'),220),
    'cart_total',v_total,
    'choices',jsonb_build_array(
      jsonb_build_object('id','mercearia','title','Mercearia'),
      jsonb_build_object('id','limpeza','title','Limpeza e lavanderia'),
      jsonb_build_object('id','higiene','title','Higiene e beleza'),
      jsonb_build_object('id','bebidas','title','Bebidas'),
      jsonb_build_object('id','casa_pet','title','Casa e pet'),
      jsonb_build_object('id','buscar','title','Buscar pelo nome'),
      jsonb_build_object('id','revisar','title','Revisar pedido')));
end;
$$;

create or replace function public.get_whatsapp_flow_simple_product_cards_v1(
  p_conversation_id uuid,p_mode text,p_key text,p_title text,p_page integer default 1,p_round text default 'A'
) returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  v_mode text:=lower(trim(coalesce(p_mode,''))); v_key text:=left(trim(coalesce(p_key,'')),120);
  v_title text:=left(coalesce(nullif(trim(p_title),''),v_key),80); v_page_no integer:=greatest(1,coalesce(p_page,1));
  v_round text:=upper(coalesce(nullif(trim(p_round),''),'A')); v_page jsonb; v_products jsonb; v_data jsonb; v_item jsonb;
  v_opts jsonb; v_slot_map jsonb:='{}'::jsonb; v_total integer:=0; v_count integer:=0; v_has_more boolean:=false;
  v_stock integer; v_review jsonb; v_cart_total text:='Pedido em montagem'; v_actions jsonb:='[]'::jsonb; i integer;
begin
  if v_round not in ('A','B','C') then v_round:='A'; end if;
  if v_mode='section' then v_page:=public.get_whatsapp_flow_section_results_page_v1(v_key,v_page_no,3);
  elsif v_mode='query' then v_page:=public.get_whatsapp_flow_product_results_page_v1(v_key,v_page_no,3);
  else return jsonb_build_object('has_products',false,'slot_map','{}'::jsonb); end if;
  v_products:=coalesce(v_page->'products','[]'::jsonb); v_total:=coalesce((v_page->>'total')::integer,0);
  v_count:=jsonb_array_length(v_products); v_has_more:=coalesce((v_page->>'has_more')::boolean,false);
  if p_conversation_id is not null then
    begin
      v_review:=public.format_whatsapp_flow_cart_review_v1(p_conversation_id);
      if coalesce((v_review->>'exists')::boolean,false) then v_cart_total:='Total atual: '||coalesce(v_review->>'total',''); end if;
    exception when others then v_cart_total:='Pedido em montagem'; end;
  end if;
  v_data:=jsonb_build_object(
    'query_title',v_title,'result_note',case when v_total=0 then 'Nenhum produto disponível.' when v_total<=3 then v_total::text||case when v_total=1 then ' produto disponível' else ' produtos disponíveis' end else 'Escolha a quantidade. Mostrando 3 de '||v_total::text end,
    'cart_total',v_cart_total,
    'p1_visible',false,'p1_id','','p1_name','','p1_price','','p1_description','','p1_image_base64','','p1_has_image',false,'q1_options','[]'::jsonb,
    'p2_visible',false,'p2_id','','p2_name','','p2_price','','p2_description','','p2_image_base64','','p2_has_image',false,'q2_options','[]'::jsonb,
    'p3_visible',false,'p3_id','','p3_name','','p3_price','','p3_description','','p3_image_base64','','p3_has_image',false,'q3_options','[]'::jsonb);
  for i in 1..least(3,v_count) loop
    v_item:=v_products->(i-1); v_stock:=greatest(0,floor(coalesce((v_item->>'stock')::numeric,0))::integer);
    select coalesce(jsonb_agg(jsonb_build_object('id',g::text,'title',case when g=0 then '0 · Não adicionar' when g=1 then '1 unidade' else g::text||' unidades' end) order by g),'[]'::jsonb)
      into v_opts from generate_series(0,least(6,v_stock)) g;
    v_data:=v_data||jsonb_build_object(
      'p'||i::text||'_visible',true,'p'||i::text||'_id',coalesce(v_item->>'id',''),'p'||i::text||'_name',left(coalesce(v_item->>'name','Produto'),80),
      'p'||i::text||'_price','R$ '||replace(to_char(coalesce((v_item->>'price')::numeric,0),'FM999999990.00'),'.',','),
      'p'||i::text||'_description',left(trim(concat_ws(' · ',nullif(v_item->>'brand',''),nullif(v_item->>'packaging',''))),100),
      'p'||i::text||'_image_url',left(coalesce(v_item->>'image_url',''),2000),'p'||i::text||'_image_base64','','p'||i::text||'_has_image',false,
      'q'||i::text||'_options',v_opts);
    v_slot_map:=v_slot_map||jsonb_build_object('p'||i::text,coalesce(v_item->>'id',''));
  end loop;
  if v_round<>'C' and v_has_more then v_actions:=v_actions||jsonb_build_array(jsonb_build_object('id','mais','title','Ver mais produtos')); end if;
  if v_round<>'C' then v_actions:=v_actions||jsonb_build_array(jsonb_build_object('id','buscar','title','Outra categoria ou busca')); end if;
  v_actions:=v_actions||jsonb_build_array(jsonb_build_object('id','revisar','title','Revisar pedido'));
  return v_data||jsonb_build_object('next_actions',v_actions,'has_products',v_count>0,'slot_map',v_slot_map,'page_number',v_page_no,'has_more',v_has_more);
end;
$$;

create or replace function public.handle_whatsapp_flow_commercial_exchange_v12(
  p_session_id uuid,p_conversation_id uuid,p_action text,p_screen text default null,p_data jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  s public.experience_sessions%rowtype; v_result jsonb; v_response jsonb; v_screen text:=coalesce(p_screen,''); v_trigger text:=coalesce(p_data->>'trigger','');
  v_round text:='A'; v_next_round text; v_choice text; v_query text; v_mode text; v_key text; v_title text; v_page integer:=1; v_cards jsonb; v_slots jsonb;
  v_product_id uuid; v_product jsonb; v_qty numeric; v_stock integer; v_write jsonb:=public.get_whatsapp_flow_commercial_write_readiness_v1();
  v_write_ready boolean:=coalesce((v_write->>'ready')::boolean,false); v_state integer; v_op text; v_pending jsonb; v_review jsonb; i integer;
begin
  if v_screen ~ '_(A|B|C)$' then v_round:=right(v_screen,1); end if;
  select * into s from public.experience_sessions where id=p_session_id for update;
  if not found or s.conversation_id is distinct from p_conversation_id then return jsonb_build_object('ok',false,'reason','flow_session_not_found'); end if;
  if s.expires_at<=now() or s.status not in ('offered','open') then return jsonb_build_object('ok',false,'reason','flow_session_inactive'); end if;

  if p_action='data_exchange' and v_screen ~ '^SECOES_[ABC]$' and v_trigger='simple_extras_continue_v1' then
    if coalesce(s.flow_current_screen,'')<>'SECOES' then return jsonb_build_object('ok',false,'reason','flow_transition_invalid'); end if;
    v_choice:=lower(trim(coalesce(p_data->>'choice','')));
    if v_choice='revisar' then
      v_review:=public.format_whatsapp_flow_cart_review_v1(p_conversation_id);
      update public.experience_sessions set flow_current_screen='REVISAO',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
      return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','REVISAO','data',jsonb_build_object('summary',coalesce(v_review->>'summary',''),'total',coalesce(v_review->>'total',''),'pricing_note',coalesce(v_review->>'pricing_note','A cesta possui preço comercial próprio.'))));
    end if;
    if v_choice='buscar' then
      v_query:=left(trim(coalesce(p_data->>'direct_query','')),80);
      if length(v_query)<2 then return jsonb_build_object('ok',true,'response',jsonb_build_object('screen',v_screen,'data',public.get_whatsapp_flow_simple_extras_screen_v1(p_conversation_id,'Digite pelo menos 2 letras no campo de busca.'))); end if;
      v_mode:='query';v_key:=v_query;v_title:=v_query;
    elsif v_choice in ('mercearia','limpeza','higiene','bebidas','casa_pet') then
      v_mode:='section';v_key:=v_choice;
      v_title:=case v_choice when 'mercearia' then 'Mercearia' when 'limpeza' then 'Limpeza e lavanderia' when 'higiene' then 'Higiene e beleza' when 'bebidas' then 'Bebidas' else 'Casa e pet' end;
    else return jsonb_build_object('ok',true,'response',jsonb_build_object('screen',v_screen,'data',public.get_whatsapp_flow_simple_extras_screen_v1(p_conversation_id,'Escolha uma opção.'))); end if;
    v_cards:=public.get_whatsapp_flow_simple_product_cards_v1(p_conversation_id,v_mode,v_key,v_title,1,v_round);
    if not coalesce((v_cards->>'has_products')::boolean,false) then return jsonb_build_object('ok',true,'response',jsonb_build_object('screen',v_screen,'data',public.get_whatsapp_flow_simple_extras_screen_v1(p_conversation_id,'Nenhum produto disponível nessa busca. Tente outra opção.'))); end if;
    v_slots:=v_cards->'slot_map';
    update public.experience_sessions set context=coalesce(context,'{}'::jsonb)||jsonb_build_object('flow_browse_mode',v_mode,'flow_browse_key',v_key,'flow_query_title',v_title,'flow_products_page',1,'flow_product_slots',v_slots),flow_current_screen='PRODUTOS',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
    v_cards:=v_cards-'slot_map'-'has_products'-'page_number'-'has_more';
    return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','PRODUTOS_'||v_round,'data',v_cards));
  end if;

  if p_action='data_exchange' and v_screen ~ '^PRODUTOS_[ABC]$' and v_trigger='simple_products_continue_v1' then
    if coalesce(s.flow_current_screen,'')<>'PRODUTOS' then return jsonb_build_object('ok',false,'reason','flow_transition_invalid'); end if;
    v_slots:=coalesce(s.context->'flow_product_slots','{}'::jsonb);v_state:=coalesce(s.flow_state_version,0);v_pending:=coalesce(s.context->'flow_pending_addons','[]'::jsonb);
    if jsonb_typeof(v_pending)<>'array' then v_pending:='[]'::jsonb; end if;
    for i in 1..3 loop
      begin v_qty:=coalesce(nullif(trim(p_data->>('q'||i::text)),''),'0')::numeric; exception when others then return jsonb_build_object('ok',false,'reason','invalid_quantity'); end;
      if v_qty<>trunc(v_qty) or v_qty<0 or v_qty>6 then return jsonb_build_object('ok',false,'reason','invalid_quantity'); end if;
      if v_qty=0 then continue; end if;
      begin v_product_id:=(v_slots->>('p'||i::text))::uuid; exception when others then return jsonb_build_object('ok',false,'reason','invalid_product_slot'); end;
      v_product:=public.get_whatsapp_sellable_product_v1(v_product_id);if v_product is null then return jsonb_build_object('ok',false,'reason','product_not_sellable'); end if;
      v_stock:=greatest(0,floor(coalesce((v_product->>'stock')::numeric,0))::integer);if v_qty>least(6,v_stock) then return jsonb_build_object('ok',false,'reason','quantity_exceeds_stock'); end if;
    end loop;
    for i in 1..3 loop
      begin v_qty:=coalesce(nullif(trim(p_data->>('q'||i::text)),''),'0')::numeric; exception when others then v_qty:=0; end;
      if v_qty<=0 then continue; end if;v_product_id:=(v_slots->>('p'||i::text))::uuid;
      if v_write_ready then v_op:=replace(s.id::text,'-','')||':cards:'||v_state::text||':'||i::text;perform public.apply_whatsapp_flow_commercial_write_v1(s.id,v_state,v_op,'set_addon',jsonb_build_object('product_id',v_product_id,'quantity',v_qty));
      elsif jsonb_array_length(v_pending)<30 then v_pending:=v_pending||jsonb_build_array(jsonb_build_object('product_id',v_product_id,'quantity',v_qty)); end if;
    end loop;
    v_choice:=lower(trim(coalesce(p_data->>'next_action','revisar')));
    if v_choice='revisar' then
      v_review:=public.format_whatsapp_flow_cart_review_v1(p_conversation_id);
      update public.experience_sessions set context=coalesce(context,'{}'::jsonb)||jsonb_build_object('flow_pending_addons',v_pending),flow_current_screen='REVISAO',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
      return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','REVISAO','data',jsonb_build_object('summary',coalesce(v_review->>'summary',''),'total',coalesce(v_review->>'total',''),'pricing_note',coalesce(v_review->>'pricing_note','A cesta possui preço comercial próprio.'))));
    end if;
    if v_round='A' then v_next_round:='B';elsif v_round='B' then v_next_round:='C';else return jsonb_build_object('ok',false,'reason','flow_round_complete');end if;
    if v_choice='buscar' then
      update public.experience_sessions set context=(coalesce(context,'{}'::jsonb)||jsonb_build_object('flow_pending_addons',v_pending))-'flow_product_slots'-'flow_products_page',flow_current_screen='SECOES',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
      return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','SECOES_'||v_next_round,'data',public.get_whatsapp_flow_simple_extras_screen_v1(p_conversation_id,'Escolha outra categoria ou faça uma nova busca.')));
    end if;
    if v_choice='mais' then
      v_mode:=coalesce(s.context->>'flow_browse_mode','query');v_key:=coalesce(s.context->>'flow_browse_key','');v_title:=coalesce(s.context->>'flow_query_title',v_key);v_page:=greatest(1,coalesce((s.context->>'flow_products_page')::integer,1))+1;
      v_cards:=public.get_whatsapp_flow_simple_product_cards_v1(p_conversation_id,v_mode,v_key,v_title,v_page,v_next_round);
      if not coalesce((v_cards->>'has_products')::boolean,false) then
        update public.experience_sessions set context=(coalesce(context,'{}'::jsonb)||jsonb_build_object('flow_pending_addons',v_pending))-'flow_product_slots'-'flow_products_page',flow_current_screen='SECOES',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
        return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','SECOES_'||v_next_round,'data',public.get_whatsapp_flow_simple_extras_screen_v1(p_conversation_id,'Não há mais produtos nessa lista. Escolha outra opção.')));
      end if;
      v_slots:=v_cards->'slot_map';
      update public.experience_sessions set context=coalesce(context,'{}'::jsonb)||jsonb_build_object('flow_pending_addons',v_pending,'flow_products_page',v_page,'flow_product_slots',v_slots),flow_current_screen='PRODUTOS',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
      v_cards:=v_cards-'slot_map'-'has_products'-'page_number'-'has_more';
      return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','PRODUTOS_'||v_next_round,'data',v_cards));
    end if;
    return jsonb_build_object('ok',false,'reason','invalid_next_action');
  end if;

  v_result:=public.handle_whatsapp_flow_commercial_exchange_v9(p_session_id,p_conversation_id,p_action,p_screen,p_data);
  if not coalesce((v_result->>'ok')::boolean,false) then return v_result; end if;v_response:=coalesce(v_result->'response','{}'::jsonb);
  if coalesce(v_response->>'screen','') ~ '^SECOES_[ABC]$' then
    v_response:=jsonb_build_object('screen',v_response->>'screen','data',public.get_whatsapp_flow_simple_extras_screen_v1(p_conversation_id,'Cesta atualizada. Se quiser, adicione outros produtos.'));
    return jsonb_set(v_result,'{response}',v_response,false);
  end if;
  return v_result;
end;
$$;

insert into public.experience_definitions(slug,feature_key,experience_type,purpose,status,provider,provider_id,schema_version,config,metadata)
select 'flow-cestas-comercial-v3',feature_key,experience_type,
       'Flow comercial V3 candidato: personalização em uma tela e adicionais em cards de 3 produtos com imagem e quantidade direta.',
       'draft','meta_whatsapp_flow',null,schema_version,
       config||jsonb_build_object('flow_json_version','v26','handler_version','v12','candidate_products_per_page',3,'customer_max_quantity_per_product',6,'direct_quantity_on_product_list',true,'standalone_product_detail_screen',false,'separate_search_term_screen',false,'standalone_upsell_screen',false,'simple_extras_choices',true,'production_enabled',false),
       jsonb_build_object('candidate_not_live',true,'default_for_new_sessions',false,'source_definition_slug','flow-cestas-comercial-v2','created_at',now())
from public.experience_definitions where slug='flow-cestas-comercial-v2'
on conflict(slug) do update set purpose=excluded.purpose,status='draft',provider='meta_whatsapp_flow',provider_id=null,config=excluded.config,metadata=public.experience_definitions.metadata||excluded.metadata,updated_at=now();

grant execute on function public.get_whatsapp_flow_section_results_page_v1(text,integer,integer) to service_role;
grant execute on function public.get_whatsapp_flow_simple_extras_screen_v1(uuid,text) to service_role;
grant execute on function public.get_whatsapp_flow_simple_product_cards_v1(uuid,text,text,text,integer,text) to service_role;
grant execute on function public.handle_whatsapp_flow_commercial_exchange_v12(uuid,uuid,text,text,jsonb) to service_role;
