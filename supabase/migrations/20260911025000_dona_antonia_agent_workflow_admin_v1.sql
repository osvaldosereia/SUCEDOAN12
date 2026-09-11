begin;

create table if not exists public.agent_workflow_settings (
  id smallint primary key default 1 check (id=1),
  enabled boolean not null default true,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

create table if not exists public.agent_workflow_stages (
  stage_key text primary key check (stage_key ~ '^[a-z0-9_]{2,60}$'),
  name text not null,
  position integer not null,
  enabled boolean not null default true,
  autonomous boolean not null default true,
  instructions text not null default '',
  allowed_tools text[] not null default '{}',
  next_stages text[] not null default '{}',
  max_offers smallint not null default 1 check (max_offers between 0 and 5),
  human_on_unknown boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

alter table public.agent_workflow_settings enable row level security;
alter table public.agent_workflow_stages enable row level security;
revoke all on public.agent_workflow_settings from public,anon,authenticated;
revoke all on public.agent_workflow_stages from public,anon,authenticated;
grant select,insert,update,delete on public.agent_workflow_settings to service_role;
grant select,insert,update,delete on public.agent_workflow_stages to service_role;

insert into public.agent_workflow_settings(id,enabled,version)
values(1,true,1)
on conflict(id) do nothing;

insert into public.agent_workflow_stages(stage_key,name,position,enabled,autonomous,instructions,allowed_tools,next_stages,max_offers,human_on_unknown,config)
values
('initial','Atendimento inicial',10,true,true,
 'Entenda a intenção com linguagem natural. Resolva dúvidas com poucas mensagens. Para compras, conduza para cesta ou produtos sem transformar a conversa em formulário.',
 array['wa_get_policy','wa_search_products','wa_get_product','wa_list_baskets','wa_get_basket_contents','wa_find_baskets_by_items','wa_get_recommendations','wa_get_cart','wa_get_basket_state','wa_link_customer_identity','wa_select_basket','wa_create_search_showcase','wa_start_order_checkout','wa_handoff_human'],
 array['basket_selected','finalization','delivery','post_sale'],1,false,
 jsonb_build_object('reference','botpress_autonomous_node','purpose','descoberta e atendimento livre')),
('basket_selected','Cesta escolhida',20,true,true,
 'A cesta já foi escolhida. Priorize explicar a composição e oferecer somente dois caminhos principais: encomendar a cesta padrão ou personalizar. Não reinicie a escolha sem pedido claro do cliente.',
 array['wa_get_policy','wa_search_products','wa_get_product','wa_list_baskets','wa_get_basket_contents','wa_find_baskets_by_items','wa_get_recommendations','wa_get_cart','wa_get_basket_state','wa_get_checkout_contact','wa_get_basket_customer_status','wa_open_basket_storefront','wa_create_basket_replacement','wa_add_more_products','wa_add_product','wa_set_quantity','wa_replace_product','wa_start_basket_checkout','wa_handoff_human'],
 array['personalization','finalization','initial'],1,false,
 jsonb_build_object('purpose','cesta padrão ou personalização')),
('personalization','Personalização da cesta',30,true,true,
 'O cliente está personalizando ou acabou de voltar da personalização. Preserve a cesta e as alterações. Pode fazer no máximo uma oferta complementar útil antes de avançar para a finalização; não obrigue upsell.',
 array['wa_get_policy','wa_search_products','wa_get_product','wa_get_basket_contents','wa_find_baskets_by_items','wa_get_recommendations','wa_get_cart','wa_get_basket_state','wa_get_checkout_contact','wa_get_basket_customer_status','wa_open_basket_storefront','wa_create_basket_replacement','wa_add_more_products','wa_add_product','wa_set_quantity','wa_replace_product','wa_start_basket_checkout','wa_handoff_human'],
 array['finalization','basket_selected'],1,false,
 jsonb_build_object('purpose','personalizar e retornar ao checkout')),
('finalization','Finalização',40,true,true,
 'Finalize com o mínimo de interações: confirme cadastro quando necessário, endereço, pagamento, resumo e confirmação final. Não reabra a escolha de cesta sem pedido explícito.',
 array['wa_get_policy','wa_search_products','wa_get_product','wa_list_baskets','wa_get_basket_contents','wa_find_baskets_by_items','wa_get_cart','wa_get_basket_state','wa_get_checkout_contact','wa_get_basket_customer_status','wa_save_checkout_customer_data','wa_set_delivery_locator','wa_request_address_flow','wa_cancel_address_flow','wa_request_basket_payment','wa_prepare_basket_confirmation','wa_start_basket_checkout','wa_start_order_checkout','wa_finalize_basket_order','wa_confirm_order','wa_handoff_human'],
 array['delivery','basket_selected','personalization'],0,false,
 jsonb_build_object('purpose','cadastro endereço pagamento confirmação')),
('delivery','Pedido confirmado / entrega',50,true,true,
 'O pedido já foi confirmado. Informe andamento quando houver dado confiável e trate alterações do pedido confirmado como exceção. Não reabra carrinho ou personalização silenciosamente.',
 array['wa_get_policy','wa_search_products','wa_get_product','wa_list_baskets','wa_get_basket_contents','wa_find_baskets_by_items','wa_get_cart','wa_get_basket_state','wa_get_checkout_contact','wa_handoff_human'],
 array['post_sale','initial'],0,true,
 jsonb_build_object('purpose','acompanhamento de entrega e exceções')),
('post_sale','Pós-venda',60,true,true,
 'Trate problemas, faltas, avarias, cancelamentos, dúvidas após entrega, avaliação e recompra. Não altere pedido confirmado sem ferramenta transacional específica; quando necessário encaminhe para humano.',
 array['wa_get_policy','wa_search_products','wa_get_product','wa_list_baskets','wa_get_basket_contents','wa_find_baskets_by_items','wa_handoff_human'],
 array['initial'],1,true,
 jsonb_build_object('purpose','pós-venda e recompra'))
on conflict(stage_key) do nothing;

create or replace function public.resolve_agent_workflow_stage_v1(p_packet jsonb)
returns text language plpgsql stable security definer set search_path=''
as $$
declare
  p jsonb:=coalesce(p_packet,'{}'::jsonb);
  awaiting text:=lower(coalesce(p#>>'{sales_state,awaiting}',''));
  order_status text:=lower(coalesce(p#>>'{order,status}',''));
  cart_exists boolean:=coalesce((p#>>'{cart,exists}')::boolean,false);
  basket_active boolean:=coalesce((p#>>'{pre_router_state,basket_session_active}')::boolean,false);
  order_confirmed boolean:=coalesce((p#>>'{order,commercial_commitment_exists}')::boolean,false) or coalesce((p#>>'{order,confirmed}')::boolean,false);
  delivered boolean:=coalesce((p#>>'{order,delivered}')::boolean,false) or order_status in ('delivered','completed','concluido','entregue');
begin
  if awaiting ~ '(post_storefront|personal|extra|swap|replacement|custom)' then return 'personalization'; end if;
  if awaiting ~ '(customer|address|payment|final_confirmation|checkout|delivery_locator)' then return 'finalization'; end if;
  if cart_exists or basket_active then
    if coalesce(p#>>'{cart,basket_id}','')<>'' or basket_active then return 'basket_selected'; end if;
    return 'finalization';
  end if;
  if delivered then return 'post_sale'; end if;
  if order_confirmed then return 'delivery'; end if;
  return 'initial';
end;
$$;

create or replace function public.get_agent_workflow_policy_v1(p_packet jsonb)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare s public.agent_workflow_stages%rowtype; cfg public.agent_workflow_settings%rowtype; k text;
begin
  select * into cfg from public.agent_workflow_settings where id=1;
  if not found or not cfg.enabled then return jsonb_build_object('enabled',false,'stage_key',null,'allowed_tools','[]'::jsonb); end if;
  k:=public.resolve_agent_workflow_stage_v1(p_packet);
  select * into s from public.agent_workflow_stages where stage_key=k and enabled;
  if not found then return jsonb_build_object('enabled',false,'stage_key',k,'allowed_tools','[]'::jsonb); end if;
  return jsonb_build_object('enabled',true,'version',cfg.version,'stage_key',s.stage_key,'name',s.name,'autonomous',s.autonomous,'instructions',s.instructions,'allowed_tools',to_jsonb(s.allowed_tools),'next_stages',to_jsonb(s.next_stages),'max_offers',s.max_offers,'human_on_unknown',s.human_on_unknown,'config',s.config);
end;
$$;

create or replace function public.get_agent_workflow_admin_v1()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare uid uuid:=auth.uid(); role_name text; out_stages jsonb; out_tools jsonb; cfg public.agent_workflow_settings%rowtype;
begin
  select role into role_name from public.admin_users where user_id=uid and is_active limit 1;
  if role_name is null then raise exception 'admin_not_authorized'; end if;
  select * into cfg from public.agent_workflow_settings where id=1;
  select coalesce(jsonb_agg(to_jsonb(s) order by s.position),'[]'::jsonb) into out_stages from public.agent_workflow_stages s;
  select coalesce(jsonb_agg(jsonb_build_object('action_key',a.action_key,'risk_class',a.risk_class) order by a.action_key),'[]'::jsonb) into out_tools from public.ai_action_registry a where a.enabled;
  return jsonb_build_object('ok',true,'role',role_name,'settings',to_jsonb(cfg),'stages',out_stages,'tools',out_tools);
end;
$$;

create or replace function public.save_agent_workflow_stage_v1(p_stage_key text,p_name text,p_instructions text,p_allowed_tools text[],p_next_stages text[],p_enabled boolean,p_autonomous boolean,p_max_offers integer,p_human_on_unknown boolean)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare uid uuid:=auth.uid(); role_name text; bad_tool text; bad_stage text; r public.agent_workflow_stages%rowtype;
begin
  select role into role_name from public.admin_users where user_id=uid and is_active limit 1;
  if role_name not in ('owner','operator') then raise exception 'admin_write_not_authorized'; end if;
  if not exists(select 1 from public.agent_workflow_stages where stage_key=p_stage_key) then raise exception 'stage_not_found'; end if;
  select x into bad_tool from unnest(coalesce(p_allowed_tools,'{}')) x where not exists(select 1 from public.ai_action_registry a where a.action_key=x and a.enabled) limit 1;
  if bad_tool is not null then raise exception 'invalid_tool:%',bad_tool; end if;
  select x into bad_stage from unnest(coalesce(p_next_stages,'{}')) x where not exists(select 1 from public.agent_workflow_stages s where s.stage_key=x) limit 1;
  if bad_stage is not null then raise exception 'invalid_next_stage:%',bad_stage; end if;
  update public.agent_workflow_stages set name=left(trim(coalesce(p_name,name)),120),instructions=left(trim(coalesce(p_instructions,'')),4000),allowed_tools=coalesce(p_allowed_tools,'{}'),next_stages=coalesce(p_next_stages,'{}'),enabled=coalesce(p_enabled,true),autonomous=coalesce(p_autonomous,true),max_offers=greatest(0,least(5,coalesce(p_max_offers,1))),human_on_unknown=coalesce(p_human_on_unknown,false),updated_at=now(),updated_by=uid where stage_key=p_stage_key returning * into r;
  update public.agent_workflow_settings set version=version+1,updated_at=now(),updated_by=uid where id=1;
  return jsonb_build_object('ok',true,'stage',to_jsonb(r));
end;
$$;

create or replace function public.set_agent_workflow_enabled_v1(p_enabled boolean)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare uid uuid:=auth.uid(); role_name text; r public.agent_workflow_settings%rowtype;
begin
  select role into role_name from public.admin_users where user_id=uid and is_active limit 1;
  if role_name<>'owner' then raise exception 'owner_required'; end if;
  update public.agent_workflow_settings set enabled=coalesce(p_enabled,false),version=version+1,updated_at=now(),updated_by=uid where id=1 returning * into r;
  return jsonb_build_object('ok',true,'settings',to_jsonb(r));
end;
$$;

revoke all on function public.get_agent_workflow_admin_v1() from public,anon;
revoke all on function public.save_agent_workflow_stage_v1(text,text,text,text[],text[],boolean,boolean,integer,boolean) from public,anon;
revoke all on function public.set_agent_workflow_enabled_v1(boolean) from public,anon;
grant execute on function public.get_agent_workflow_admin_v1() to authenticated,service_role;
grant execute on function public.save_agent_workflow_stage_v1(text,text,text,text[],text[],boolean,boolean,integer,boolean) to authenticated,service_role;
grant execute on function public.set_agent_workflow_enabled_v1(boolean) to authenticated,service_role;

create or replace function public.build_whatsapp_agent_core_packet_v4(p_conversation_id uuid, p_message_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
  v_packet jsonb; v_topic text; v_interactive text; v_order jsonb; v_active_transaction boolean:=false; v_confirmed_order_mutation boolean:=false;
  v_workflow jsonb; v_allowed text[]; v_filtered_tools jsonb; v_rules jsonb;
begin
  v_packet:=public.build_whatsapp_agent_core_packet_v3(p_conversation_id,p_message_id);
  if coalesce((v_packet->>'enabled')::boolean,false) is not true then return v_packet; end if;
  v_interactive:=coalesce(v_packet#>>'{pre_router_state,interactive_id}',v_packet#>>'{message,interactive,id}','');
  v_topic:=public.resolve_whatsapp_agent_core_topic_v6(coalesce(v_packet#>>'{message,text}',''),coalesce(v_packet#>>'{conversation,stage}',''),coalesce(v_packet#>>'{sales_state,awaiting}',''),v_interactive);
  v_order:=coalesce(v_packet->'order','{}'::jsonb);
  v_active_transaction:=coalesce((v_packet#>>'{cart,exists}')::boolean,false) or coalesce((v_packet#>>'{pre_router_state,basket_session_active}')::boolean,false) or nullif(coalesce(v_packet#>>'{sales_state,awaiting}',''),'') is not null;
  v_confirmed_order_mutation:=public.is_whatsapp_confirmed_order_mutation_request_v1(p_conversation_id,p_message_id);
  if v_active_transaction and not v_confirmed_order_mutation and v_topic in ('basket','checkout','payment','delivery') and coalesce((v_order->>'commercial_commitment_exists')::boolean,false) then
    v_order:=v_order||jsonb_build_object('status','historical_confirmed','confirmed',false,'commercial_commitment_exists',false,'historical_confirmed_exists',true,'current_transaction_scope',true);
    v_packet:=jsonb_set(v_packet,'{order}',v_order,true);
  end if;
  v_workflow:=public.get_agent_workflow_policy_v1(v_packet);
  if coalesce((v_workflow->>'enabled')::boolean,false) then
    select array_agg(value) into v_allowed from jsonb_array_elements_text(coalesce(v_workflow->'allowed_tools','[]'::jsonb));
    if coalesce(array_length(v_allowed,1),0)>0 then
      select coalesce(jsonb_agg(t.elem),'[]'::jsonb) into v_filtered_tools from jsonb_array_elements(coalesce(v_packet->'toolset','[]'::jsonb)) t(elem) where t.elem->>'name'=any(v_allowed);
      v_packet:=jsonb_set(v_packet,'{toolset}',coalesce(v_filtered_tools,'[]'::jsonb),true);
    end if;
    v_rules:=coalesce(v_packet->'rules','{}'::jsonb)||jsonb_build_object('agent_workflow',jsonb_build_object('stage_key',v_workflow->>'stage_key','stage_name',v_workflow->>'name','instructions',v_workflow->>'instructions','autonomous',coalesce((v_workflow->>'autonomous')::boolean,true),'next_stages',v_workflow->'next_stages','max_offers',coalesce((v_workflow->>'max_offers')::int,1),'human_on_unknown',coalesce((v_workflow->>'human_on_unknown')::boolean,false),'authority','operational_policy_not_commercial_truth'));
    v_packet:=jsonb_set(v_packet,'{rules}',v_rules,true);
  end if;
  return v_packet||jsonb_build_object('topic',v_topic,'workflow_stage',v_workflow->>'stage_key','metadata',coalesce(v_packet->'metadata','{}'::jsonb)||jsonb_build_object('packet_version',4,'topic_resolver','resolve_whatsapp_agent_core_topic_v6','pre_router_state_authoritative',coalesce((v_packet#>>'{metadata,pre_router_snapshot_used}')::boolean,false),'transaction_scope_guard_version',1,'confirmed_order_mutation_current_message',v_confirmed_order_mutation,'agent_workflow_enabled',coalesce((v_workflow->>'enabled')::boolean,false),'agent_workflow_version',coalesce((v_workflow->>'version')::int,0),'pii_added_by_v4',false));
end;
$$;

revoke all on function public.resolve_agent_workflow_stage_v1(jsonb) from public,anon,authenticated;
revoke all on function public.get_agent_workflow_policy_v1(jsonb) from public,anon,authenticated;
grant execute on function public.resolve_agent_workflow_stage_v1(jsonb) to service_role;
grant execute on function public.get_agent_workflow_policy_v1(jsonb) to service_role;

commit;
