begin;

create or replace function public.handle_whatsapp_flow_commercial_exchange_v4(
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
  v_screen text:=coalesce(p_screen,'');
  v_canonical text:=coalesce(p_screen,'');
  v_round int:=1;
  v_result jsonb;
  v_response jsonb;
  v_next text;
begin
  if v_screen ~ '^(SECOES|TERMOS|PRODUTOS|PRODUTO)_[123]$' then
    v_round:=right(v_screen,1)::int;
    v_canonical:=regexp_replace(v_screen,'_[123]$','');
  elsif coalesce(p_data->>'round','') ~ '^[123]$' then
    v_round:=(p_data->>'round')::int;
  end if;

  v_result:=public.handle_whatsapp_flow_commercial_exchange_v3(
    p_session_id,p_conversation_id,p_action,v_canonical,p_data
  );
  if not coalesce((v_result->>'ok')::boolean,false) then return v_result; end if;
  if jsonb_typeof(v_result->'response')<>'object' then return v_result; end if;

  v_response:=v_result->'response';
  v_next:=coalesce(v_response->>'screen','');

  if v_next='SECOES' then
    if v_screen='PRODUTO_3' then
      -- O visual v5 é forward-only e limita esta etapa a três adicionais.
      return public.handle_whatsapp_flow_commercial_exchange_v3(
        p_session_id,p_conversation_id,'data_exchange','SECOES',jsonb_build_object('trigger','extras_continue','extras_action','finish')
      );
    end if;
    if v_screen like 'PRODUTO_%' then v_round:=least(v_round+1,3); else v_round:=1; end if;
    v_response:=jsonb_set(v_response,'{screen}',to_jsonb('SECOES_'||v_round::text),false);
  elsif v_next='TERMOS' then
    v_response:=jsonb_set(v_response,'{screen}',to_jsonb('TERMOS_'||v_round::text),false);
  elsif v_next='PRODUTOS' then
    v_response:=jsonb_set(v_response,'{screen}',to_jsonb('PRODUTOS_'||v_round::text),false);
  elsif v_next='PRODUTO' then
    v_response:=jsonb_set(v_response,'{screen}',to_jsonb('PRODUTO_'||v_round::text),false);
  end if;

  return jsonb_set(v_result,'{response}',v_response,false);
end;
$$;

revoke all on function public.handle_whatsapp_flow_commercial_exchange_v4(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.handle_whatsapp_flow_commercial_exchange_v4(uuid,uuid,text,text,jsonb) to service_role;

update public.experience_definitions
set config=coalesce(config,'{}'::jsonb)||jsonb_build_object(
  'handler_version','v4',
  'flow_json_version','v5',
  'unrolled_extras_rounds',3,
  'meta_forward_only_routing',true
),updated_at=now()
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
