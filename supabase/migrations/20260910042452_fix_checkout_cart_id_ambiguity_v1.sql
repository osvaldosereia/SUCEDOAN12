-- Fixa colisões PL/pgSQL entre variável local e coluna cart_id no checkout da cesta.
create or replace function public.format_whatsapp_basket_checkout_brief_v1(p_conversation_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare
  flow jsonb; contact jsonb; basket_session_id uuid; v_cart_id uuid; basket_name text;
  total_value numeric:=0; customized boolean:=false; extras_units integer:=0; address_line text; txt text;
begin
  flow:=public.get_whatsapp_basket_flow_state_v1(p_conversation_id);
  if coalesce((flow->>'active')::boolean,false) is not true then raise exception 'basket_flow_not_found'; end if;
  contact:=public.get_whatsapp_checkout_contact_v1(p_conversation_id);
  basket_session_id:=nullif(flow->'basket_session'->>'id','')::uuid;
  v_cart_id:=nullif(flow->'cart'->>'id','')::uuid;
  basket_name:=coalesce(nullif(flow->'basket'->>'name',''),'Cesta básica');
  total_value:=coalesce((flow->'cart'->>'total')::numeric,(flow->'basket'->>'base_price')::numeric,0);
  address_line:=public.whatsapp_address_line_v1(coalesce(contact->'address','{}'::jsonb));
  if basket_session_id is not null then
    select exists(select 1 from public.catalog_session_items i where i.catalog_session_id=basket_session_id and (i.quantity is distinct from coalesce(nullif(i.metadata->>'base_quantity','')::numeric,i.quantity) or coalesce(i.metadata->'substitution','null'::jsonb)<>'null'::jsonb)) into customized;
  end if;
  if v_cart_id is not null then
    select coalesce(sum(ci.quantity),0)::integer into extras_units from public.cart_items ci where ci.cart_id=v_cart_id and ci.source='addon' and ci.quantity>0;
  end if;
  txt:='*Revise sua encomenda*'||E'\n'||'Cesta: '||left(basket_name,90)||case when customized then ' (personalizada)' else '' end||E'\n'||case when extras_units>0 then 'Produtos adicionais: '||extras_units::text||E'\n' else '' end||'*Total: R$ '||replace(to_char(total_value,'FM999999990.00'),'.',',')||'*'||E'\n'||'Entrega: '||left(address_line,300)||E'\n\n'||'Se está tudo certo, escolha como vai pagar para confirmar a encomenda.';
  return left(txt,1000);
end; $$;

create or replace function public.format_whatsapp_basket_checkout_summary_v1(p_conversation_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare
  flow jsonb; contact jsonb; base_id uuid; v_cart_id uuid; basket_name text; totalv numeric:=0; txt text; rec record; line text;
begin
  flow:=public.get_whatsapp_basket_flow_state_v1(p_conversation_id);
  if coalesce((flow->>'active')::boolean,false) is not true then raise exception 'basket_flow_not_found'; end if;
  contact:=public.get_whatsapp_checkout_contact_v1(p_conversation_id);
  base_id:=nullif(flow->'basket_session'->>'id','')::uuid;
  v_cart_id:=nullif(flow->'cart'->>'id','')::uuid;
  basket_name:=coalesce(flow->'basket'->>'name','Cesta básica');
  totalv:=coalesce((flow->'cart'->>'total')::numeric,(flow->'basket'->>'base_price')::numeric,0);
  txt:='*RESUMO DA ENCOMENDA*'||E'\n\n*'||left(basket_name,100)||'*'||E'\n';
  for rec in select i.quantity,p.name from public.catalog_session_items i join public.products p on p.id=i.product_id where i.catalog_session_id=base_id and i.quantity>0 order by i.rank loop
    line:='• '||trim(to_char(rec.quantity,'FM999999990.###'))||'x '||left(rec.name,88);
    if length(txt)+length(line)<2850 then txt:=txt||line||E'\n'; end if;
  end loop;
  if v_cart_id is not null and exists(select 1 from public.cart_items ci where ci.cart_id=v_cart_id and ci.source='addon' and ci.quantity>0) then
    txt:=txt||E'\n*Produtos adicionais*'||E'\n';
    for rec in select ci.quantity,p.name from public.cart_items ci join public.products p on p.id=ci.product_id where ci.cart_id=v_cart_id and ci.source='addon' and ci.quantity>0 order by p.name loop
      line:='• '||trim(to_char(rec.quantity,'FM999999990.###'))||'x '||left(rec.name,88);
      if length(txt)+length(line)<3300 then txt:=txt||line||E'\n'; end if;
    end loop;
  end if;
  txt:=txt||E'\n*Total:* R$ '||replace(to_char(totalv,'FM999999990.00'),'.',',')||E'\n\n*DADOS DE ENTREGA*'||E'\n'||'Nome: '||coalesce(nullif(contact->>'name',''),'Não informado')||E'\n'||'Telefone: '||coalesce(nullif(contact->>'phone_display',''),'Não informado')||E'\n'||'Endereço: '||public.whatsapp_address_line_v1(contact->'address');
  return left(txt,4000);
end; $$;

revoke all on function public.format_whatsapp_basket_checkout_brief_v1(uuid) from public,anon,authenticated;
revoke all on function public.format_whatsapp_basket_checkout_summary_v1(uuid) from public,anon,authenticated;
grant execute on function public.format_whatsapp_basket_checkout_brief_v1(uuid) to service_role;
grant execute on function public.format_whatsapp_basket_checkout_summary_v1(uuid) to service_role;
