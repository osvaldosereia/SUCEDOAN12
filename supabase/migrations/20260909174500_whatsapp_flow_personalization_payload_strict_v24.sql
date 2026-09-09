begin;

create or replace function public.get_whatsapp_flow_basket_editor_v2(p_basket_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  b public.basket_templates%rowtype;
  v_items jsonb;
  v_selection jsonb;
  v_summary text;
  v_total integer;
  v_resolved integer;
  v_verified integer;
  v_write_readiness jsonb;
  v_write_ready boolean:=false;
begin
  select * into b
  from public.basket_templates
  where id=p_basket_id and is_active=true and is_whatsapp_active=true;
  if not found then raise exception 'basket_not_available'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id::text,
      'title',left(p.name,30),
      'description',case
        when bi.removable then 'Atual: '||trim(to_char(bi.quantity,'FM999990D##'))||' · pode retirar'
        else 'Atual: '||trim(to_char(bi.quantity,'FM999990D##'))
      end
    ) order by bi.sort_order,p.name),'[]'::jsonb)
    into v_items
  from public.basket_template_items bi
  join public.products p on p.id=bi.product_id
  where bi.basket_id=b.id
    and bi.quantity_editable=true
    and (
      bi.add_unit_delta is not null
      or bi.remove_unit_delta is not null
      or coalesce(p.price,0)>0
    );

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'product_id',p.id,
      'sku',p.sku,
      'quantity',bi.quantity
    ) order by bi.sort_order,p.name),'[]'::jsonb),
    coalesce(string_agg(trim(to_char(bi.quantity,'FM999990D##'))||' × '||p.name,E'\n' order by bi.sort_order,p.name),''),
    count(*)::integer,
    count(p.id)::integer,
    count(*) filter(where p.is_active and p.physically_verified)::integer
  into v_selection,v_summary,v_total,v_resolved,v_verified
  from public.basket_template_items bi
  join public.products p on p.id=bi.product_id
  where bi.basket_id=b.id;

  v_write_readiness:=public.get_whatsapp_basket_component_readiness_v1(b.id);
  v_write_ready:=coalesce((v_write_readiness->>'ready')::boolean,false);

  return jsonb_build_object(
    'basket_id',b.id,
    'basket_sku',b.sku,
    'basket_name',b.name,
    'basket_price','R$ '||replace(to_char(b.base_price,'FM999999990.00'),'.',','),
    'basket_image_url',b.image_url,
    'items',v_items,
    'selection',v_selection,
    'summary',v_summary,
    'actions',jsonb_build_array(
      jsonb_build_object('id','edit','title','Alterar um item'),
      jsonb_build_object('id','continue','title','Concluir personalização')
    ),
    'quantities',(select jsonb_agg(jsonb_build_object('id',g::text,'title',g::text) order by g) from generate_series(0,20) g),
    'readiness',jsonb_build_object(
      'preview_ready',v_total>0 and v_resolved=v_total,
      'total_components',v_total,
      'resolved_in_supabase',v_resolved,
      'physically_verified_components',v_verified,
      'cart_write_ready',v_write_ready
    )
  );
end;
$$;

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
  v_data jsonb;
  v_items jsonb;
  v_actions jsonb;
begin
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

  if v_next ~ '^PERSONALIZAR_[ABC]$' then
    v_data:=coalesce(v_response->'data','{}'::jsonb);

    select coalesce(jsonb_agg(jsonb_build_object(
      'id',left(coalesce(e->>'id',''),80),
      'title',left(coalesce(e->>'title','Produto'),30),
      'description',left(coalesce(e->>'description',''),80)
    )),'[]'::jsonb)
    into v_items
    from jsonb_array_elements(coalesce(v_data->'items','[]'::jsonb)) e;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id',left(coalesce(e->>'id',''),80),
      'title',left(coalesce(e->>'title',''),30)
    )),'[]'::jsonb)
    into v_actions
    from jsonb_array_elements(coalesce(v_data->'actions','[]'::jsonb)) e;

    v_response:=jsonb_set(v_response,'{data}',jsonb_build_object(
      'basket_name',left(coalesce(v_data->>'basket_name','Sua cesta'),80),
      'basket_price',left(coalesce(v_data->>'basket_price',''),40),
      'basket_note',left(coalesce(v_data->>'basket_note',''),300),
      'items_summary',left(coalesce(v_data->>'items_summary',''),4000),
      'actions',v_actions,
      'items',v_items,
      'error_text',left(coalesce(v_data->>'error_text',''),300),
      'basket_image_url',left(coalesce(v_data->>'basket_image_url',''),2000),
      'basket_image_base64','',
      'has_basket_image',false
    ),false);
  end if;

  return jsonb_set(v_result,'{response}',v_response,false);
end;
$$;

revoke all on function public.get_whatsapp_flow_basket_editor_v2(uuid) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_basket_editor_v2(uuid) to service_role;
revoke all on function public.handle_whatsapp_flow_commercial_exchange_v7(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.handle_whatsapp_flow_commercial_exchange_v7(uuid,uuid,text,text,jsonb) to service_role;

update public.experience_definitions
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'personalization_payload_strict',true,
  'personalization_item_media_disabled',true,
  'personalization_only_editable_items',true,
  'implementation_stage','personalization_payload_strict_v24'
),updated_at=now()
where slug='flow-cestas-comercial-v1';

commit;
