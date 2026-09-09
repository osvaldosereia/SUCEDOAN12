-- Dona Antonia WhatsApp Flow V27 premium reconciliation.
-- Keeps the candidate dormant. Restores deep query paging and adds a strict
-- confirmed-order guard around V13 so a success screen can never show R$ 0,00.

begin;

create or replace function public.get_whatsapp_flow_query_results_page_v2(
  p_query text,
  p_page integer default 1,
  p_page_size integer default 20
) returns jsonb
language sql
stable
security definer
set search_path=''
as $$
with params as (
  select left(trim(coalesce(p_query,'')),120) q,
         greatest(1,coalesce(p_page,1)) pg,
         greatest(1,least(coalesce(p_page_size,20),20)) ps
), ranked as (
  select x.*,row_number() over(order by x.score desc,x.name,x.id) rn,count(*) over() total_count
  from params p cross join lateral public.search_whatsapp_sellable_products_v2(p.q,200) x
), page_rows as (
  select r.* from ranked r,params p
  where r.rn>((p.pg-1)*p.ps) and r.rn<=(p.pg*p.ps)
), totals as (
  select coalesce(max(total_count),0)::integer total from ranked
)
select jsonb_build_object(
  'query',(select q from params),
  'page',(select pg from params),
  'page_size',(select ps from params),
  'total',(select total from totals),
  'has_more',(select total>((select pg*ps from params)) from totals),
  'products',coalesce((select jsonb_agg(jsonb_build_object(
    'id',id,'name',name,'brand',brand,'packaging',packaging,'price',price,
    'stock',stock,'image_url',image_url,'category',category
  ) order by rn) from page_rows),'[]'::jsonb)
);
$$;

create or replace function public.handle_whatsapp_flow_commercial_exchange_v14(
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
  v_order public.orders%rowtype;
  v_payment text:=lower(trim(coalesce(p_data->>'payment_method','')));
begin
  v_result:=public.handle_whatsapp_flow_commercial_exchange_v13(
    p_session_id,p_conversation_id,p_action,p_screen,p_data
  );
  if not coalesce((v_result->>'ok')::boolean,false) then return v_result; end if;

  v_response:=coalesce(v_result->'response','{}'::jsonb);
  if coalesce(v_response->>'screen','')<>'FINALIZAR' then return v_result; end if;
  v_data:=coalesce(v_response->'data','{}'::jsonb);

  select * into v_order
  from public.orders
  where conversation_id=p_conversation_id
    and confirmed_at is not null
    and coalesce(total,0)>0
  order by confirmed_at desc,created_at desc
  limit 1;

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

  v_data:=v_data||jsonb_build_object(
    'confirmation','Pedido confirmado com sucesso!',
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
      else 'Pagamento na entrega'
    end,
    'next_step','Ao voltar para a conversa, envie sua localização para confirmarmos o ponto exato da entrega.',
    'write_enabled',true
  );

  return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','FINALIZAR','data',v_data));
end;
$$;

update public.experience_definitions
set config=config||jsonb_build_object(
      'handler_version','v14',
      'query_page_size',20,
      'query_search_cap',200,
      'success_requires_confirmed_order',true,
      'production_enabled',false
    ),
    metadata=metadata||jsonb_build_object(
      'candidate_not_live',true,
      'default_for_new_sessions',false,
      'implementation_stage','v27_backend_reconciled_v39'
    ),
    status='draft',
    provider_id=null,
    updated_at=now()
where slug='flow-cestas-comercial-v4';

revoke all on function public.get_whatsapp_flow_query_results_page_v2(text,integer,integer) from public,anon,authenticated;
revoke all on function public.handle_whatsapp_flow_commercial_exchange_v14(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_query_results_page_v2(text,integer,integer) to service_role;
grant execute on function public.handle_whatsapp_flow_commercial_exchange_v14(uuid,uuid,text,text,jsonb) to service_role;

commit;
