-- WhatsApp Flow V65: align terminal payment options with current commercial rules.
-- Keeps rollout gates closed; no order/cart/customer writes are performed here.

create or replace function public.handle_whatsapp_flow_commercial_exchange_v23(
  p_session_id uuid,
  p_conversation_id uuid,
  p_action text,
  p_screen text default null,
  p_data jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_result jsonb; v_response jsonb; v_data jsonb; v_screen text;
  v_contact jsonb; v_address jsonb; v_known boolean:=false; v_complete boolean:=false;
  v_address_summary text:=''; v_payment_options jsonb;
begin
  v_result:=public.handle_whatsapp_flow_commercial_exchange_v22(p_session_id,p_conversation_id,p_action,p_screen,p_data);
  if not coalesce((v_result->>'ok')::boolean,false) then return v_result; end if;
  if jsonb_typeof(v_result->'response') is distinct from 'object' then return v_result; end if;
  v_response:=coalesce(v_result->'response','{}'::jsonb); v_screen:=coalesce(v_response->>'screen','');
  if v_screen in ('CLIENTE_EXISTENTE','CLIENTE_NOVO') then
    v_contact:=public.get_whatsapp_checkout_contact_v1(p_conversation_id);
    v_address:=coalesce(v_contact->'address','{}'::jsonb);
    v_known:=coalesce((v_contact->>'known_customer')::boolean,false);
    v_complete:=coalesce((v_contact->>'base_complete')::boolean,false);
    v_screen:=case when v_known and v_complete then 'CLIENTE_EXISTENTE' else 'CLIENTE_NOVO' end;
    v_address_summary:=trim(concat_ws(', ',nullif(v_address->>'street',''),nullif(v_address->>'number',''),nullif(v_address->>'complement',''),nullif(v_address->>'neighborhood',''),nullif(v_address->>'city','')));
    v_payment_options:=jsonb_build_array(
      jsonb_build_object('id','pix','title','PIX na entrega'),
      jsonb_build_object('id','dinheiro','title','Dinheiro na entrega'),
      jsonb_build_object('id','cartao_entrega','title','Cartão de crédito na entrega'),
      jsonb_build_object('id','cartao_alimentacao','title','Cartão alimentação/refeição')
    );
    v_data:=coalesce(v_response->'data','{}'::jsonb)||jsonb_build_object(
      'customer_name',coalesce(v_contact->>'name',''),'address_summary',v_address_summary,'customer_registered',v_known,
      'name_value',coalesce(v_contact->>'name',''),'street_value',coalesce(v_address->>'street',''),'number_value',coalesce(v_address->>'number',''),
      'complement_value',coalesce(v_address->>'complement',''),'neighborhood_value',coalesce(v_address->>'neighborhood',''),
      'city_value',coalesce(nullif(v_address->>'city',''),'Cuiabá'),'locator_value',coalesce(v_address->>'reference',''),
      'payment_options',v_payment_options,
      'error_text',case when v_known and not v_complete then 'Confirme e complete apenas os dados que faltam para a entrega.' when not v_known then coalesce(v_response#>>'{data,error_text}','') else '' end
    );
    v_response:=jsonb_set(v_response,'{screen}',to_jsonb(v_screen),false);
    v_response:=jsonb_set(v_response,'{data}',v_data,false);
    v_result:=jsonb_set(v_result,'{response}',v_response,false);
  end if;
  return v_result;
end;
$function$;

revoke all on function public.handle_whatsapp_flow_commercial_exchange_v23(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.handle_whatsapp_flow_commercial_exchange_v23(uuid,uuid,text,text,jsonb) to service_role;

create or replace function public.get_whatsapp_flow_v65_payment_rules_readiness_v1()
returns jsonb language plpgsql stable security invoker set search_path=''
as $function$
declare
  cfg public.automation_config%rowtype;
  fn text:=lower(coalesce(pg_get_functiondef('public.handle_whatsapp_flow_commercial_exchange_v23(uuid,uuid,text,text,jsonb)'::regprocedure),''));
  control jsonb:=public.get_whatsapp_flow_v64_homologation_control_plane_v1();
  terminal jsonb:=public.get_whatsapp_flow_v60_terminal_commercial_readiness_v1();
begin
  select * into cfg from public.automation_config where id=1;
  return jsonb_build_object(
    'ok', position('pix na entrega' in fn)>0 and position('dinheiro na entrega' in fn)>0 and position('cartão de crédito na entrega' in fn)>0 and position('cartão alimentação/refeição' in fn)>0 and position('débito' in fn)=0
      and coalesce((control->>'ok')::boolean,false) and coalesce((terminal->>'ok')::boolean,false)
      and cfg.whatsapp_live_canary_percent=1 and not cfg.experience_orchestrator_enabled and not cfg.whatsapp_flow_data_exchange_enabled and not cfg.whatsapp_flow_send_enabled and not cfg.whatsapp_flow_commercial_write_enabled and not cfg.bling_order_sync_enabled,
    'payment_options',jsonb_build_array('pix','dinheiro','cartao_credito','cartao_alimentacao_refeicao'),
    'debit_exposed_in_flow',position('débito' in fn)>0,
    'known_complete_no_reentry',position('v_known and v_complete' in fn)>0,
    'known_incomplete_prefill',position('complete apenas os dados que faltam' in fn)>0,
    'physical_next_required',control->>'physical_next_required',
    'eligible_owner_conversations',coalesce((control->>'eligible_owner_conversations')::int,0),
    'safe_to_launch_owner_v11',coalesce((control->>'safe_to_launch_owner_v11')::boolean,false),
    'writes_performed',false,
    'gates',jsonb_build_object('whatsapp_live_canary_percent',cfg.whatsapp_live_canary_percent,'experience_orchestrator_enabled',cfg.experience_orchestrator_enabled,'whatsapp_flow_data_exchange_enabled',cfg.whatsapp_flow_data_exchange_enabled,'whatsapp_flow_send_enabled',cfg.whatsapp_flow_send_enabled,'whatsapp_flow_commercial_write_enabled',cfg.whatsapp_flow_commercial_write_enabled,'bling_order_sync_enabled',cfg.bling_order_sync_enabled)
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v65_payment_rules_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v65_payment_rules_readiness_v1() to service_role;
