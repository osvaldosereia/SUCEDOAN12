-- Fixa colisão PL/pgSQL entre variável local e coluna cart_id no retorno da vitrine.
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
  v_cart_id uuid;
  basket_name text;
  total_value numeric:=0;
  txt text;
  line text;
  rec record;
  changed boolean:=false;
begin
  flow:=public.get_whatsapp_basket_flow_state_v1(p_conversation_id);
  if coalesce((flow->>'active')::boolean,false) is not true then raise exception 'basket_flow_not_found'; end if;
  basket_session_id:=nullif(flow->'basket_session'->>'id','')::uuid;
  v_cart_id:=nullif(flow->'cart'->>'id','')::uuid;
  basket_name:=coalesce(nullif(flow->'basket'->>'name',''),'Cesta básica');
  total_value:=coalesce((flow->'cart'->>'total')::numeric,(flow->'basket'->>'base_price')::numeric,0);
  if basket_session_id is not null then
    select exists(select 1 from public.catalog_session_items i where i.catalog_session_id=basket_session_id and (i.quantity is distinct from coalesce(nullif(i.metadata->>'base_quantity','')::numeric,i.quantity) or coalesce(i.metadata->'substitution','null'::jsonb)<>'null'::jsonb)) into changed;
  end if;
  txt:=case when changed then '*Recebi sua cesta personalizada*' else '*Recebi sua cesta*' end||E'\n'||left(basket_name,100)||E'\n\n';
  if basket_session_id is not null then
    for rec in select i.quantity,p.name as original_name,nullif(i.metadata->'substitution'->>'replacement_name','') as replacement_name from public.catalog_session_items i join public.products p on p.id=i.product_id where i.catalog_session_id=basket_session_id and i.quantity>0 order by i.rank,p.name loop
      line:='• '||trim(to_char(rec.quantity,'FM999999990.###'))||'x '||left(coalesce(rec.replacement_name,rec.original_name),92)||case when rec.replacement_name is not null then ' (troca)' else '' end;
      if length(txt)+length(line)<3100 then txt:=txt||line||E'\n'; end if;
    end loop;
  end if;
  if v_cart_id is not null and exists(select 1 from public.cart_items ci where ci.cart_id=v_cart_id and ci.source='addon' and ci.quantity>0) then
    txt:=txt||E'\n*Produtos adicionados*\n';
    for rec in select ci.quantity,p.name from public.cart_items ci join public.products p on p.id=ci.product_id where ci.cart_id=v_cart_id and ci.source='addon' and ci.quantity>0 order by p.name loop
      line:='• '||trim(to_char(rec.quantity,'FM999999990.###'))||'x '||left(rec.name,92);
      if length(txt)+length(line)<3650 then txt:=txt||line||E'\n'; end if;
    end loop;
  end if;
  txt:=txt||E'\n*Total: R$ '||replace(to_char(total_value,'FM999999990.00'),'.',',')||'*'||E'\n\nAgora vamos confirmar a entrega e a forma de pagamento.';
  return left(txt,4000);
end;
$$;
revoke all on function public.format_whatsapp_basket_storefront_return_v1(uuid) from public,anon,authenticated;
grant execute on function public.format_whatsapp_basket_storefront_return_v1(uuid) to service_role;
