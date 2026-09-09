-- Dona Antonia WhatsApp Flow V27/V4 candidate.
-- Hardens final success: only the confirmed order explicitly linked to this Flow
-- session may populate the terminal success screen. Live V3 remains unchanged.

create or replace function public.handle_whatsapp_flow_commercial_exchange_v15(
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
  v_result jsonb;
  v_response jsonb;
  v_data jsonb;
  v_context jsonb;
  v_order_id uuid;
  v_order public.orders%rowtype;
  v_payment text:=lower(trim(coalesce(p_data->>'payment_method','')));
begin
  v_result:=public.handle_whatsapp_flow_commercial_exchange_v14(
    p_session_id,p_conversation_id,p_action,p_screen,p_data
  );
  if not coalesce((v_result->>'ok')::boolean,false) then return v_result; end if;

  v_response:=coalesce(v_result->'response','{}'::jsonb);
  if coalesce(v_response->>'screen','')<>'FINALIZAR' then return v_result; end if;

  select coalesce(context,'{}'::jsonb)
    into v_context
  from public.experience_sessions
  where id=p_session_id
    and conversation_id=p_conversation_id;

  if not found then
    return jsonb_build_object('ok',false,'reason','flow_session_not_found');
  end if;

  begin
    v_order_id:=nullif(trim(coalesce(v_context->>'flow_order_id','')),'')::uuid;
  exception when others then
    v_order_id:=null;
  end;

  if v_order_id is null then
    return jsonb_build_object(
      'ok',true,
      'response',jsonb_build_object(
        'screen','FALHA_FINALIZACAO',
        'data',jsonb_build_object(
          'message','Não conseguimos confirmar o pedido com segurança. Volte ao WhatsApp para concluirmos com você.'
        )
      )
    );
  end if;

  select * into v_order
  from public.orders
  where id=v_order_id
    and conversation_id=p_conversation_id
    and status='confirmed'
    and confirmed_at is not null
    and coalesce(total,0)>0;

  if not found then
    return jsonb_build_object(
      'ok',true,
      'response',jsonb_build_object(
        'screen','FALHA_FINALIZACAO',
        'data',jsonb_build_object(
          'message','Não conseguimos confirmar o pedido com segurança. Volte ao WhatsApp para concluirmos com você.'
        )
      )
    );
  end if;

  v_data:=coalesce(v_response->'data','{}'::jsonb);
  v_data:=v_data||jsonb_build_object(
    'confirmation','Pedido confirmado com sucesso.',
    'order_number','Pedido #'||upper(right(replace(v_order.id::text,'-',''),6)),
    'final_summary',case
      when coalesce(v_data->>'final_summary','')='' or lower(coalesce(v_data->>'final_summary','')) like '%nenhum pedido%'
        then 'Pedido registrado e pronto para seguir para separação.'
      else v_data->>'final_summary'
    end,
    'final_total','R$ '||replace(to_char(v_order.total,'FM999999990.00'),'.',','),
    'final_total_label','Total: R$ '||replace(to_char(v_order.total,'FM999999990.00'),'.',','),
    'payment_label',case v_payment
      when 'pix' then 'PIX na entrega'
      when 'dinheiro' then 'Dinheiro na entrega'
      when 'cartao_entrega' then 'Cartão na entrega'
      when 'cartao' then 'Cartão na entrega'
      when 'alimentacao' then 'Cartão alimentação/refeição na entrega'
      when 'refeicao' then 'Cartão alimentação/refeição na entrega'
      else 'Pagamento na entrega'
    end,
    'next_step','Ao voltar para a conversa, envie sua localização para confirmarmos o ponto exato da entrega.',
    'write_enabled',true
  );

  return jsonb_build_object(
    'ok',true,
    'response',jsonb_build_object('screen','FINALIZAR','data',v_data)
  );
end;
$$;

revoke all on function public.handle_whatsapp_flow_commercial_exchange_v15(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.handle_whatsapp_flow_commercial_exchange_v15(uuid,uuid,text,text,jsonb) to service_role;

update public.experience_definitions
set config=coalesce(config,'{}'::jsonb)||jsonb_build_object(
      'handler_version','v15',
      'success_requires_session_bound_confirmed_order',true
    ),
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'implementation_stage','v27_session_bound_finalization_v40',
      'candidate_not_live',true,
      'default_for_new_sessions',false
    ),
    updated_at=now()
where slug='flow-cestas-comercial-v4';
