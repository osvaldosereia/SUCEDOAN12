begin;

create or replace function public.handle_whatsapp_flow_commercial_exchange_v7(
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
  v_screen text:=p_screen;
  v_result jsonb;
  v_response jsonb;
  v_next text;
begin
  -- A Meta aceita IDs de tela apenas com letras e underscore. O backend legado usa 1/2/3
  -- internamente para as rodadas; esta camada traduz sem alterar a máquina comercial.
  v_screen:=replace(v_screen,'_A','_1');
  v_screen:=replace(v_screen,'_B','_2');
  v_screen:=replace(v_screen,'_C','_3');
  if v_screen in ('CLIENTE_EXISTENTE','CLIENTE_NOVO') then v_screen:='CLIENTE'; end if;

  v_result:=public.handle_whatsapp_flow_commercial_exchange_v6(
    p_session_id,p_conversation_id,p_action,v_screen,p_data
  );
  if not coalesce((v_result->>'ok')::boolean,false) then return v_result; end if;

  v_response:=coalesce(v_result->'response','{}'::jsonb);
  v_next:=coalesce(v_response->>'screen','');
  v_next:=replace(v_next,'_1','_A');
  v_next:=replace(v_next,'_2','_B');
  v_next:=replace(v_next,'_3','_C');

  if v_next='CLIENTE' then
    if coalesce((v_response#>>'{data,customer_registered}')::boolean,false) then
      v_next:='CLIENTE_EXISTENTE';
    else
      v_next:='CLIENTE_NOVO';
    end if;
  end if;

  v_response:=jsonb_set(v_response,'{screen}',to_jsonb(v_next),false);
  return jsonb_set(v_result,'{response}',v_response,false);
end;
$$;

revoke all on function public.handle_whatsapp_flow_commercial_exchange_v7(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.handle_whatsapp_flow_commercial_exchange_v7(uuid,uuid,text,text,jsonb) to service_role;

update public.experience_definitions
set config=coalesce(config,'{}'::jsonb)||jsonb_build_object(
  'handler_version','v7',
  'meta_alpha_screen_ids',true,
  'customer_checkout_split',true
),
metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('implementation_stage','meta_validation_v7_alpha_ids'),
updated_at=now()
where slug='flow-cestas-comercial-v1';

update public.automation_config
set whatsapp_live_canary_percent=1,
    experience_orchestrator_enabled=false,
    whatsapp_flow_data_exchange_enabled=false,
    whatsapp_flow_send_enabled=false,
    whatsapp_flow_commercial_write_enabled=false,
    bling_order_sync_enabled=false,
    updated_at=now()
where id=1;

commit;
