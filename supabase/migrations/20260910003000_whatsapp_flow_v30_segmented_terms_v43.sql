begin;

create or replace function public.get_whatsapp_flow_segmented_terms_v1(p_section_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_section text:=lower(trim(coalesce(p_section_key,'')));
  v_title text;
  v_items jsonb:='[]'::jsonb;
begin
  v_title:=case v_section
    when 'mercearia' then 'Mercearia'
    when 'limpeza' then 'Limpeza e lavanderia'
    when 'higiene' then 'Higiene e beleza'
    when 'bebidas' then 'Bebidas'
    when 'casa_pet' then 'Casa e pet'
    else '' end;
  if v_title='' then return jsonb_build_object('ok',false,'reason','invalid_section'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.term_key,
    'main-content',jsonb_build_object('title',left(t.term_title,30),'metadata','Ver produtos disponíveis'),
    'on-click-action',jsonb_build_object('name','data_exchange','payload',jsonb_build_object(
      'trigger','nav_term_open_v1','term_key',t.term_key,'search_query',t.search_query
    ))
  ) order by t.sort_order,t.term_title),'[]'::jsonb)
  into v_items
  from public.get_whatsapp_flow_search_terms_v1(v_section) t;

  return jsonb_build_object(
    'ok',jsonb_array_length(v_items)>0,
    'section_title',v_title,
    'message','Escolha o tipo de produto. Carregaremos apenas os itens relacionados.',
    'term_items',v_items
  );
end;
$$;

create or replace function public.handle_whatsapp_flow_commercial_exchange_v17(
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
  v_choice text;
  v_term text;
  v_query text;
  v_terms jsonb;
  v_nav jsonb;
  v_title text;
begin
  if v_screen ~ '_(A|B|C|D|E|F|G|H|I|J|K|L)$' then v_round:=right(v_screen,1); end if;
  select * into s from public.experience_sessions where id=p_session_id for update;
  if not found or s.conversation_id is distinct from p_conversation_id then return jsonb_build_object('ok',false,'reason','flow_session_not_found'); end if;
  if s.expires_at<=now() or s.status not in ('offered','open') then return jsonb_build_object('ok',false,'reason','flow_session_inactive'); end if;

  if p_action='data_exchange' and v_screen ~ '^MENU_[A-L]$' and v_trigger='nav_menu_action_v1' then
    v_choice:=lower(trim(coalesce(p_data->>'choice','')));
    if v_choice in ('mercearia','limpeza','higiene','bebidas','casa_pet') then
      if coalesce(s.flow_current_screen,'')<>'MENU' then return jsonb_build_object('ok',false,'reason','flow_transition_invalid'); end if;
      v_terms:=public.get_whatsapp_flow_segmented_terms_v1(v_choice);
      if not coalesce((v_terms->>'ok')::boolean,false) then
        return jsonb_build_object('ok',true,'response',jsonb_build_object('screen',v_screen,'data',public.get_whatsapp_flow_nav_menu_v1(s.id,p_conversation_id,'Nenhum tipo de produto disponível nessa seção.')));
      end if;
      update public.experience_sessions set context=coalesce(context,'{}'::jsonb)||jsonb_build_object('flow_section_key',v_choice),flow_current_screen='TERMOS',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
      return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','TERMOS_'||v_round,'data',v_terms-'ok'));
    end if;
  end if;

  if p_action='data_exchange' and v_screen ~ '^TERMOS_[A-L]$' and v_trigger='nav_term_open_v1' then
    if coalesce(s.flow_current_screen,'')<>'TERMOS' then return jsonb_build_object('ok',false,'reason','flow_transition_invalid'); end if;
    v_term:=lower(trim(coalesce(p_data->>'term_key','')));
    v_query:=left(trim(coalesce(p_data->>'search_query','')),120);
    if v_term='' or v_query='' then return jsonb_build_object('ok',false,'reason','invalid_search_term'); end if;
    if not exists(select 1 from public.whatsapp_flow_search_terms w where w.enabled and w.section_key=coalesce(s.context->>'flow_section_key','') and w.term_key=v_term and w.search_query=v_query) then
      return jsonb_build_object('ok',false,'reason','search_term_not_allowed');
    end if;
    v_title:=(select term_title from public.whatsapp_flow_search_terms where enabled and section_key=coalesce(s.context->>'flow_section_key','') and term_key=v_term limit 1);
    v_nav:=public.get_whatsapp_flow_nav_products_v1(p_conversation_id,'query',v_query,coalesce(v_title,v_query),1,true);
    if not coalesce((v_nav->>'has_products')::boolean,false) then
      v_terms:=public.get_whatsapp_flow_segmented_terms_v1(coalesce(s.context->>'flow_section_key',''));
      return jsonb_build_object('ok',true,'response',jsonb_build_object('screen',v_screen,'data',(v_terms-'ok')||jsonb_build_object('message','Não há produto disponível nesse tipo agora. Escolha outro.')));
    end if;
    update public.experience_sessions set context=coalesce(context,'{}'::jsonb)||jsonb_build_object('flow_browse_mode','query','flow_browse_key',v_query,'flow_query_title',coalesce(v_title,v_query),'flow_products_page',1,'flow_product_option_ids',v_nav->'product_ids'),flow_current_screen='PRODUTOS',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
    return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','PRODUTOS_'||v_round,'data',v_nav-'product_ids'-'has_products'-'has_more'-'page_number'));
  end if;

  return public.handle_whatsapp_flow_commercial_exchange_v16(p_session_id,p_conversation_id,p_action,p_screen,p_data);
end;
$$;

revoke all on function public.get_whatsapp_flow_segmented_terms_v1(text) from public,anon,authenticated;
revoke all on function public.handle_whatsapp_flow_commercial_exchange_v17(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_segmented_terms_v1(text) to service_role;
grant execute on function public.handle_whatsapp_flow_commercial_exchange_v17(uuid,uuid,text,text,jsonb) to service_role;

insert into public.experience_definitions(slug,feature_key,experience_type,purpose,status,provider,provider_id,provider_version,schema_version,config,metadata)
select 'flow-cestas-comercial-v6',feature_key,experience_type,
  'Candidata V30: cesta e personalização seguidas por seções, termos segmentados dinâmicos, busca direta, produtos sob demanda, detalhe, quantidade, revisão e checkout.',
  'draft',provider,null,provider_version,schema_version,
  coalesce(config,'{}'::jsonb)||jsonb_build_object(
    'handler_version','v17','flow_json_version','v30','segmented_terms_enabled',true,
    'products_per_page',20,'never_load_full_catalog',true,'catalog_query_only',true,
    'production_enabled',false,'bling_sync_enabled',false
  ),
  coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
    'candidate_not_live',true,'default_for_new_sessions',false,'customer_exposure',false,
    'implementation_stage','v30_segmented_terms_backend_v43','created_at',now()
  )
from public.experience_definitions where slug='flow-cestas-comercial-v5'
on conflict(slug) do update set status='draft',provider_id=null,config=excluded.config,metadata=excluded.metadata,updated_at=now();

-- Homologation safety baseline. These gates remain OFF until explicit owner authorization.
update public.automation_config
set experience_orchestrator_enabled=false,
    whatsapp_flow_data_exchange_enabled=false,
    whatsapp_flow_send_enabled=false,
    whatsapp_flow_commercial_write_enabled=false,
    whatsapp_live_canary_percent=1,
    bling_order_sync_enabled=false,
    updated_at=now()
where id=1;

commit;
