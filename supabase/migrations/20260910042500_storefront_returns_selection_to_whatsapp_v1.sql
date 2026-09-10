-- Dona Antônia — a vitrine devolve ao WhatsApp exatamente o que ficou na compra.
-- Sem preços individuais dos componentes da cesta; sem deep link para abrir o app.

create or replace function public.format_whatsapp_basket_storefront_return_v1(p_conversation_id uuid)
returns text
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  flow jsonb;
  basket_session_id uuid;
  cart_id uuid;
  basket_name text;
  total_value numeric:=0;
  txt text;
  line text;
  rec record;
  changed boolean:=false;
begin
  flow:=public.get_whatsapp_basket_flow_state_v1(p_conversation_id);
  if coalesce((flow->>'active')::boolean,false) is not true then
    raise exception 'basket_flow_not_found';
  end if;

  basket_session_id:=nullif(flow->'basket_session'->>'id','')::uuid;
  cart_id:=nullif(flow->'cart'->>'id','')::uuid;
  basket_name:=coalesce(nullif(flow->'basket'->>'name',''),'Cesta básica');
  total_value:=coalesce((flow->'cart'->>'total')::numeric,(flow->'basket'->>'base_price')::numeric,0);

  if basket_session_id is not null then
    select exists(
      select 1 from public.catalog_session_items i
      where i.catalog_session_id=basket_session_id
        and (
          i.quantity is distinct from coalesce(nullif(i.metadata->>'base_quantity','')::numeric,i.quantity)
          or coalesce(i.metadata->'substitution','null'::jsonb)<>'null'::jsonb
        )
    ) into changed;
  end if;

  txt:=case when changed then '*Recebi sua cesta personalizada*' else '*Recebi sua cesta*' end
    ||E'\n'||left(basket_name,100)||E'\n\n';

  if basket_session_id is not null then
    for rec in
      select
        i.quantity,
        p.name as original_name,
        nullif(i.metadata->'substitution'->>'replacement_name','') as replacement_name
      from public.catalog_session_items i
      join public.products p on p.id=i.product_id
      where i.catalog_session_id=basket_session_id and i.quantity>0
      order by i.rank,p.name
    loop
      line:='• '||trim(to_char(rec.quantity,'FM999999990.###'))||'x '
        ||left(coalesce(rec.replacement_name,rec.original_name),92)
        ||case when rec.replacement_name is not null then ' (troca)' else '' end;
      if length(txt)+length(line)<3100 then txt:=txt||line||E'\n'; end if;
    end loop;
  end if;

  if cart_id is not null and exists(
    select 1 from public.cart_items ci where ci.cart_id=cart_id and ci.source='addon' and ci.quantity>0
  ) then
    txt:=txt||E'\n*Produtos adicionados*\n';
    for rec in
      select ci.quantity,p.name
      from public.cart_items ci
      join public.products p on p.id=ci.product_id
      where ci.cart_id=cart_id and ci.source='addon' and ci.quantity>0
      order by p.name
    loop
      line:='• '||trim(to_char(rec.quantity,'FM999999990.###'))||'x '||left(rec.name,92);
      if length(txt)+length(line)<3650 then txt:=txt||line||E'\n'; end if;
    end loop;
  end if;

  txt:=txt||E'\n*Total: R$ '||replace(to_char(total_value,'FM999999990.00'),'.',',')||'*'
    ||E'\n\nAgora vamos confirmar a entrega e a forma de pagamento.';
  return left(txt,4000);
end;
$$;

revoke all on function public.format_whatsapp_basket_storefront_return_v1(uuid) from public,anon,authenticated;
grant execute on function public.format_whatsapp_basket_storefront_return_v1(uuid) to service_role;

create or replace function public.complete_whatsapp_basket_storefront_v1(
  p_public_token text,
  p_intent text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  s public.catalog_sessions%rowtype;
  v_intent text:=lower(trim(coalesce(p_intent,'')));
  v_flow text;
  src uuid;
  checkout jsonb;
  already boolean:=false;
  selection_summary text;
begin
  if p_public_token !~* '^[a-f0-9]{64}$' then raise exception 'invalid_token'; end if;

  select * into s
  from public.catalog_sessions
  where public_token=p_public_token
    and status='open'
    and expires_at>now()
  for update;
  if not found then raise exception 'catalog_session_unavailable'; end if;

  v_flow:=coalesce(s.metadata->>'flow','');
  if (v_flow='basket_basic_v1' and v_intent<>'order')
     or (v_flow='basket_extras_v1' and v_intent<>'extras_done')
     or v_flow not in ('basket_basic_v1','basket_extras_v1') then
    raise exception 'invalid_return_intent';
  end if;

  already:=coalesce(s.metadata->>'checkout_return_intent','')=v_intent
    and nullif(s.metadata->>'checkout_return_queued_at','') is not null;
  if already then
    return jsonb_build_object(
      'ok',true,'duplicate',true,'queued',true,
      'conversation_id',s.conversation_id,'intent',v_intent
    );
  end if;

  perform public.mark_whatsapp_basket_return_v1(p_public_token,v_intent);

  select id into src
  from public.messages
  where conversation_id=s.conversation_id and direction='inbound'
  order by created_at desc
  limit 1;

  selection_summary:=public.format_whatsapp_basket_storefront_return_v1(s.conversation_id);
  perform public.queue_whatsapp_sales_reply_v1(
    s.conversation_id,src,selection_summary,'text',null,null,
    'basket_storefront_selection_return',
    jsonb_build_object('catalog_session_id',s.id,'intent',v_intent),1
  );

  checkout:=public.start_whatsapp_basket_checkout_v2(s.conversation_id,src);

  update public.catalog_sessions
     set metadata=metadata||jsonb_build_object(
           'checkout_return_intent',v_intent,
           'selection_return_queued_at',now(),
           'checkout_return_queued_at',now()
         ),
         current_view='returning',
         last_activity_at=now()
   where id=s.id;

  return jsonb_build_object(
    'ok',coalesce((checkout->>'ok')::boolean,false),
    'duplicate',false,
    'queued',coalesce((checkout->>'queued')::boolean,false),
    'selection_returned',true,
    'conversation_id',s.conversation_id,
    'intent',v_intent,
    'next_step',checkout->>'step'
  );
end;
$$;

revoke all on function public.complete_whatsapp_basket_storefront_v1(text,text) from public,anon,authenticated;
grant execute on function public.complete_whatsapp_basket_storefront_v1(text,text) to service_role;
