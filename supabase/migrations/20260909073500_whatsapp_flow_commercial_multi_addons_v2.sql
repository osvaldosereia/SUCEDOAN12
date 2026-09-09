begin;

-- Dona Antônia — WhatsApp Flow Comercial V2
-- Evolução compatível: múltiplos adicionais + busca direta + upsell somente quando o cliente decidir revisar.
-- Não ativa nenhum gate e não altera canary/Bling.

create or replace function public.handle_whatsapp_flow_commercial_exchange_v2(
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
  s public.experience_sessions%rowtype;
  v_context jsonb;
  v_trigger text:=coalesce(p_data->>'trigger','');
  v_choice text;
  v_section text;
  v_query text;
  v_title text;
  v_terms jsonb;
  v_results jsonb;
  v_options jsonb;
  v_sections jsonb;
  v_product_id uuid;
  v_qty numeric;
  v_write jsonb:=public.get_whatsapp_flow_commercial_write_readiness_v1();
  v_write_ready boolean:=coalesce((v_write->>'ready')::boolean,false);
  v_state integer;
  v_op text;
  v_write_result jsonb;
  v_pending jsonb;
  v_review jsonb;
begin
  select * into s from public.experience_sessions where id=p_session_id for update;
  if not found or s.conversation_id is distinct from p_conversation_id then
    return jsonb_build_object('ok',false,'reason','flow_session_not_found');
  end if;
  if s.expires_at<=now() or s.status not in ('offered','open') then
    return jsonb_build_object('ok',false,'reason','flow_session_inactive');
  end if;

  v_context:=coalesce(s.context,'{}'::jsonb);
  v_state:=coalesce(s.flow_state_version,0);

  -- Nova tela de adicionais: o cliente pode navegar por seção, buscar diretamente ou encerrar adicionais.
  if p_action='data_exchange' and coalesce(p_screen,'')='SECOES' and coalesce(s.flow_current_screen,'')='SECOES' and v_trigger='extras_continue' then
    v_choice:=lower(trim(coalesce(p_data->>'extras_action','')));

    if v_choice='browse' then
      v_section:=lower(trim(coalesce(p_data->>'section_key','')));
      select coalesce(jsonb_agg(jsonb_build_object('id',term_key,'title',term_title) order by sort_order,term_title),'[]'::jsonb)
        into v_terms from public.get_whatsapp_flow_search_terms_v1(v_section);
      if jsonb_array_length(v_terms)=0 then
        return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','SECOES','data',public.get_whatsapp_flow_extras_screen_v2(p_conversation_id,'Escolha uma seção válida.')));
      end if;
      select min(section_title) into v_title from public.whatsapp_flow_search_terms where enabled and section_key=v_section;
      update public.experience_sessions
         set context=v_context||jsonb_build_object('flow_section_key',v_section),
             flow_current_screen='TERMOS',flow_state_version=flow_state_version+1,updated_at=now()
       where id=s.id;
      return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','TERMOS','data',jsonb_build_object('section_title',v_title,'terms',v_terms)));
    end if;

    if v_choice='direct_search' then
      v_query:=left(trim(coalesce(p_data->>'direct_query','')),80);
      if length(v_query)<2 then
        return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','SECOES','data',public.get_whatsapp_flow_extras_screen_v2(p_conversation_id,'Digite pelo menos 2 letras para buscar.')));
      end if;
      v_results:=public.get_whatsapp_flow_product_results_v1(v_query,12);
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',e->>'id',
        'title',left(e->>'name',70)||' · R$ '||replace(e->>'price','.',','),
        'description',left(trim(concat_ws(' · ',nullif(e->>'brand',''),nullif(e->>'packaging',''))),90)
      )),'[]'::jsonb)
      into v_options from jsonb_array_elements(coalesce(v_results->'products','[]'::jsonb)) e;
      if jsonb_array_length(v_options)=0 then
        return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','SECOES','data',public.get_whatsapp_flow_extras_screen_v2(p_conversation_id,'Nenhum produto disponível nessa busca. Tente outro termo.')));
      end if;
      update public.experience_sessions
         set context=v_context||jsonb_build_object('flow_query',v_query,'flow_query_title',v_query),
             flow_current_screen='PRODUTOS',flow_state_version=flow_state_version+1,updated_at=now()
       where id=s.id;
      return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','PRODUTOS','data',jsonb_build_object(
        'query_title',v_query,
        'result_note',jsonb_array_length(v_options)::text||' opções disponíveis',
        'products',v_options
      )));
    end if;

    if v_choice='finish' then
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',u.product_id,
        'title',left(u.name,70)||' · R$ '||replace(u.price::text,'.',','),
        'description',left(coalesce(u.reason,'Sugestão opcional'),90)
      ) order by u.score desc),'[]'::jsonb)
      into v_options from public.get_cart_aware_recommendations(p_conversation_id,6,'upsell') u;
      update public.experience_sessions
         set flow_current_screen='UPSELL',flow_state_version=flow_state_version+1,updated_at=now()
       where id=s.id;
      return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','UPSELL','data',jsonb_build_object(
        'upsell_note','Sugestões opcionais baseadas no pedido. Você pode continuar sem adicionar nada.',
        'products',v_options
      )));
    end if;

    return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','SECOES','data',public.get_whatsapp_flow_extras_screen_v2(p_conversation_id,'Escolha como deseja continuar.')));
  end if;

  -- Após adicionar um produto, volta para adicionais em vez de forçar upsell.
  if p_action='data_exchange' and coalesce(p_screen,'')='PRODUTO' and coalesce(s.flow_current_screen,'')='PRODUTO' and v_trigger='add_product' then
    begin v_product_id:=(p_data->>'product_id')::uuid; exception when others then return jsonb_build_object('ok',false,'reason','invalid_product_id'); end;
    begin v_qty:=(p_data->>'quantity')::numeric; exception when others then return jsonb_build_object('ok',false,'reason','invalid_quantity'); end;
    if v_qty<1 or v_qty>20 then return jsonb_build_object('ok',false,'reason','invalid_quantity'); end if;
    if public.get_whatsapp_sellable_product_v1(v_product_id) is null then return jsonb_build_object('ok',false,'reason','product_not_sellable'); end if;

    if v_write_ready then
      v_op:=replace(s.id::text,'-','')||':addon:'||v_state::text;
      v_write_result:=public.apply_whatsapp_flow_commercial_write_v1(s.id,v_state,v_op,'set_addon',jsonb_build_object('product_id',v_product_id,'quantity',v_qty));
    else
      v_pending:=coalesce(v_context->'flow_pending_addons','[]'::jsonb);
      if jsonb_typeof(v_pending)<>'array' then v_pending:='[]'::jsonb; end if;
      -- Em prévia dormente, manter no máximo 30 seleções para impedir crescimento de sessão.
      if jsonb_array_length(v_pending)<30 then
        v_pending:=v_pending||jsonb_build_array(jsonb_build_object('product_id',v_product_id,'quantity',v_qty));
      end if;
      v_context:=v_context||jsonb_build_object('flow_pending_addons',v_pending);
    end if;

    update public.experience_sessions
       set context=v_context,
           flow_current_screen='SECOES',flow_state_version=flow_state_version+1,updated_at=now()
     where id=s.id;
    return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','SECOES','data',public.get_whatsapp_flow_extras_screen_v2(
      p_conversation_id,
      case when v_write_ready then 'Produto adicionado. Você pode adicionar outros ou seguir para as sugestões.' else 'Produto selecionado na prévia. Você pode adicionar outros ou seguir para as sugestões.' end
    )));
  end if;

  -- Compatibilidade: todo o restante continua no handler V1 já homologado em testes.
  return public.handle_whatsapp_flow_commercial_exchange_v1(p_session_id,p_conversation_id,p_action,p_screen,p_data);
end;
$$;

create or replace function public.get_whatsapp_flow_extras_screen_v2(
  p_conversation_id uuid,
  p_message text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_sections jsonb;
  v_review jsonb;
  v_total text;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id',section_key,'title',section_title) order by sort_order,section_title),'[]'::jsonb)
    into v_sections from public.get_whatsapp_flow_sections_v1();
  v_review:=public.format_whatsapp_flow_cart_review_v1(p_conversation_id);
  v_total:=coalesce(nullif(v_review->>'total',''),'Pedido em montagem');
  return jsonb_build_object(
    'sections',v_sections,
    'extras_actions',jsonb_build_array(
      jsonb_build_object('id','browse','title','Escolher por seção'),
      jsonb_build_object('id','direct_search','title','Buscar produto'),
      jsonb_build_object('id','finish','title','Terminei de adicionar')
    ),
    'cart_total',v_total,
    'message',coalesce(p_message,'Escolha uma seção, faça uma busca ou avance quando terminar.')
  );
end;
$$;

revoke all on function public.get_whatsapp_flow_extras_screen_v2(uuid,text) from public,anon,authenticated;
revoke all on function public.handle_whatsapp_flow_commercial_exchange_v2(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_extras_screen_v2(uuid,text) to service_role;
grant execute on function public.handle_whatsapp_flow_commercial_exchange_v2(uuid,uuid,text,text,jsonb) to service_role;

-- Atualiza apenas metadados da definição; continua draft, provider_id nulo, feature OFF/0%.
update public.experience_definitions
   set config=coalesce(config,'{}'::jsonb)||jsonb_build_object(
       'handler_version','v2',
       'multi_addons',true,
       'direct_search',true,
       'upsell_after_extras',true,
       'max_pending_addons_preview',30
     ),
     metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('implementation_stage','multi_addons_readiness'),
     updated_at=now()
 where slug='flow-cestas-comercial-v1';

-- Garantias explícitas: não ativar nada nesta migration.
update public.automation_config
set experience_orchestrator_enabled=false,
    whatsapp_flow_data_exchange_enabled=false,
    whatsapp_flow_send_enabled=false,
    whatsapp_flow_commercial_write_enabled=false,
    bling_order_sync_enabled=false,
    updated_at=now()
where id=1;

commit;
