begin;

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
  v_write jsonb:=public.get_whatsapp_flow_commercial_write_readiness_v1();
  v_write_ready boolean:=coalesce((v_write->>'ready')::boolean,false);
begin
  select coalesce(jsonb_agg(jsonb_build_object('id',section_key,'title',section_title) order by sort_order,section_title),'[]'::jsonb)
    into v_sections from public.get_whatsapp_flow_sections_v1();

  if v_write_ready then
    v_review:=public.format_whatsapp_flow_cart_review_v1(p_conversation_id);
    v_total:=coalesce(nullif(v_review->>'total',''),'Pedido em montagem');
  else
    v_total:='Prévia em montagem';
  end if;

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
grant execute on function public.get_whatsapp_flow_extras_screen_v2(uuid,text) to service_role;

commit;
