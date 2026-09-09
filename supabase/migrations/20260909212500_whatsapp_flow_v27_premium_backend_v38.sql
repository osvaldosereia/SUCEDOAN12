-- Dona Antonia WhatsApp Flow V27 premium backend.
-- Safe rollout: creates a new dormant definition (flow-cestas-comercial-v4) and
-- a new handler v13. It does NOT change the live V3 definition, rollout or gates.

begin;

create or replace function public.get_whatsapp_flow_section_results_page_v2(
  p_section_key text,
  p_page integer default 1,
  p_page_size integer default 20
) returns jsonb
language sql
stable
security definer
set search_path=''
as $$
with params as (
  select lower(trim(coalesce(p_section_key,''))) section_key,
         greatest(1,coalesce(p_page,1)) pg,
         greatest(1,least(coalesce(p_page_size,20),20)) ps
), base as (
  select p.*
  from public.products p cross join params x
  where p.physically_verified=true
    and p.is_active=true
    and p.is_whatsapp_active=true
    and p.price is not null and p.price>=0
    and coalesce(p.stock,0)>0
    and case x.section_key
      when 'mercearia' then upper(coalesce(p.category,'')) similar to '%(CAFÉ|CAFE|BOLACHA|BISCOITO|MACARRÃO|MACARRAO|MOLHO|MERCEARIA|BALA|CHICLETE|TEMPERO|CONFEITARIA|CHOCOLATE|DOCE|SALGADINHO|PETISCO|ARROZ|FEIJÃO|FEIJAO|AÇÚCAR|ACUCAR|OLEO|ÓLEO|FARINHA|LEITE)%'
      when 'limpeza' then upper(coalesce(p.category,'')) similar to '%(LIMPEZA|LAVANDERIA|DETERGENTE|DESINFETANTE|SABÃO|SABAO|AMACIANTE|ALVEJANTE)%'
      when 'higiene' then upper(coalesce(p.category,'')) similar to '%(HIGIENE|SHAMPOO|CONDICIONADOR|SABONETE|BELEZA|BEBÊ|BEBE|CREME DENTAL|DESODORANTE)%'
      when 'bebidas' then upper(coalesce(p.category,'')) similar to '%(SUCO|REFRI|REFRIGERANTE|ENERGÉTICO|ENERGETICO|BEBIDA|ÁGUA|AGUA|ISOTÔNICO|ISOTONICO)%'
      when 'casa_pet' then upper(coalesce(p.category,'')) similar to '%(PET|UTILIDADE|CASA|DESCARTÁVEL|DESCARTAVEL)%'
      else false end
), ranked as (
  select b.*,row_number() over(order by b.sort_order nulls last,b.name,b.id) rn,count(*) over() total_count
  from base b
), page_rows as (
  select r.* from ranked r,params x
  where r.rn>((x.pg-1)*x.ps) and r.rn<=(x.pg*x.ps)
), totals as (
  select coalesce(max(total_count),0)::integer total from ranked
)
select jsonb_build_object(
  'section_key',(select section_key from params),
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
  from params p cross join lateral public.search_whatsapp_sellable_products_v1(p.q,20) x
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

create or replace function public.get_whatsapp_flow_premium_menu_v1(
  p_conversation_id uuid,
  p_message text default null,
  p_has_more boolean default false,
  p_more_title text default null
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_review jsonb;
  v_total text:='Pedido em montagem';
  v_actions jsonb:='[]'::jsonb;
begin
  if p_conversation_id is not null then
    begin
      v_review:=public.format_whatsapp_flow_cart_review_v1(p_conversation_id);
      if coalesce((v_review->>'exists')::boolean,false) then
        v_total:='Total atual: '||coalesce(v_review->>'total','');
      end if;
    exception when others then
      v_total:='Pedido em montagem';
    end;
  end if;

  v_actions:=jsonb_build_array(jsonb_build_object('id','revisar','title','Finalizar pedido','enabled',true));
  if coalesce(p_has_more,false) then
    v_actions:=v_actions||jsonb_build_array(jsonb_build_object(
      'id','mais','title',left(coalesce(nullif(trim(p_more_title),''),'Ver mais'),30),'enabled',true));
  end if;
  v_actions:=v_actions||jsonb_build_array(
    jsonb_build_object('id','mercearia','title','Mercearia','enabled',true),
    jsonb_build_object('id','limpeza','title','Limpeza','enabled',true),
    jsonb_build_object('id','higiene','title','Higiene e beleza','enabled',true),
    jsonb_build_object('id','bebidas','title','Bebidas','enabled',true),
    jsonb_build_object('id','casa_pet','title','Casa e pet','enabled',true)
  );

  return jsonb_build_object(
    'cart_total',v_total,
    'message',left(coalesce(nullif(trim(p_message),''),'Sua cesta está pronta. Finalize agora ou acrescente outros produtos.'),220),
    'quick_actions',v_actions,
    'search_hint','Ex.: leite, sabonete, café, detergente'
  );
end;
$$;

create or replace function public.get_whatsapp_flow_premium_product_page_v1(
  p_conversation_id uuid,
  p_mode text,
  p_key text,
  p_title text,
  p_page integer default 1
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_mode text:=lower(trim(coalesce(p_mode,'')));
  v_key text:=left(trim(coalesce(p_key,'')),120);
  v_title text:=left(coalesce(nullif(trim(p_title),''),v_key),80);
  v_page_no integer:=greatest(1,coalesce(p_page,1));
  v_page jsonb;
  v_products jsonb;
  v_options jsonb:='[]'::jsonb;
  v_ids jsonb:='[]'::jsonb;
  v_review jsonb;
  v_cart_total text:='Pedido em montagem';
  v_total integer:=0;
  v_has_more boolean:=false;
  v_item jsonb;
  v_desc text;
  i integer;
begin
  if v_mode='section' then
    v_page:=public.get_whatsapp_flow_section_results_page_v2(v_key,v_page_no,20);
  elsif v_mode='query' then
    v_page:=public.get_whatsapp_flow_query_results_page_v2(v_key,v_page_no,20);
  else
    return jsonb_build_object('has_products',false,'product_options','[]'::jsonb,'slot_ids','[]'::jsonb);
  end if;

  v_products:=coalesce(v_page->'products','[]'::jsonb);
  v_total:=coalesce((v_page->>'total')::integer,0);
  v_has_more:=coalesce((v_page->>'has_more')::boolean,false);

  if p_conversation_id is not null then
    begin
      v_review:=public.format_whatsapp_flow_cart_review_v1(p_conversation_id);
      if coalesce((v_review->>'exists')::boolean,false) then
        v_cart_total:='Total atual: '||coalesce(v_review->>'total','');
      end if;
    exception when others then
      v_cart_total:='Pedido em montagem';
    end;
  end if;

  for i in 0..greatest(jsonb_array_length(v_products)-1,-1) loop
    exit when i<0;
    v_item:=v_products->i;
    v_desc:='R$ '||replace(to_char(coalesce((v_item->>'price')::numeric,0),'FM999999990.00'),'.',',');
    if nullif(trim(coalesce(v_item->>'brand','')),'') is not null then
      v_desc:=v_desc||' · '||trim(v_item->>'brand');
    end if;
    if nullif(trim(coalesce(v_item->>'packaging','')),'') is not null then
      v_desc:=v_desc||' · '||trim(v_item->>'packaging');
    end if;
    v_options:=v_options||jsonb_build_array(jsonb_build_object(
      'id',coalesce(v_item->>'id',''),
      'title',left(coalesce(v_item->>'name','Produto'),30),
      'description',left(v_desc,300),
      'image_url',left(coalesce(v_item->>'image_url',''),2000),
      'alt-text',left(coalesce(v_item->>'name','Produto'),80),
      'enabled',true
    ));
    v_ids:=v_ids||jsonb_build_array(coalesce(v_item->>'id',''));
  end loop;

  return jsonb_build_object(
    'query_title',v_title,
    'cart_total',v_cart_total,
    'result_note',case
      when v_total=0 then 'Nenhum produto disponível.'
      when v_total<=20 then v_total::text||case when v_total=1 then ' produto disponível' else ' produtos disponíveis' end
      else 'Mostrando até 20 por vez. Selecione quantos quiser.' end,
    'product_options',v_options,
    'slot_ids',v_ids,
    'has_products',jsonb_array_length(v_options)>0,
    'has_more',v_has_more,
    'page_number',v_page_no,
    'browse_mode',v_mode,
    'browse_key',v_key,
    'browse_title',v_title
  );
end;
$$;

create or replace function public.handle_whatsapp_flow_commercial_exchange_v13(
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
  s public.experience_sessions%rowtype;
  v_screen text:=coalesce(p_screen,'');
  v_trigger text:=coalesce(p_data->>'trigger','');
  v_round text:='A';
  v_next_round text;
  v_choice text;
  v_query text;
  v_mode text;
  v_key text;
  v_title text;
  v_page integer:=1;
  v_page_data jsonb;
  v_allowed jsonb;
  v_selected jsonb;
  v_qty_data jsonb;
  v_init jsonb:='{}'::jsonb;
  v_slots jsonb:='{}'::jsonb;
  v_item jsonb;
  v_product jsonb;
  v_product_id uuid;
  v_stock integer;
  v_opts jsonb;
  v_qty numeric;
  v_write jsonb:=public.get_whatsapp_flow_commercial_write_readiness_v1();
  v_write_ready boolean:=coalesce((v_write->>'ready')::boolean,false);
  v_state integer;
  v_op text;
  v_pending jsonb;
  v_review jsonb;
  v_result jsonb;
  v_response jsonb;
  v_data jsonb;
  v_payment text;
  i integer;
begin
  if v_screen ~ '_(A|B|C)$' then v_round:=right(v_screen,1); end if;
  if v_round='A' then v_next_round:='B'; elsif v_round='B' then v_next_round:='C'; else v_next_round:=null; end if;

  select * into s from public.experience_sessions where id=p_session_id for update;
  if not found or s.conversation_id is distinct from p_conversation_id then
    return jsonb_build_object('ok',false,'reason','flow_session_not_found');
  end if;
  if s.expires_at<=now() or s.status not in ('offered','open') then
    return jsonb_build_object('ok',false,'reason','flow_session_inactive');
  end if;

  if p_action='data_exchange' and v_screen ~ '^SECOES_[ABC]$' and v_trigger='premium_menu_action_v1' then
    if coalesce(s.flow_current_screen,'')<>'SECOES' then
      return jsonb_build_object('ok',false,'reason','flow_transition_invalid');
    end if;
    if jsonb_typeof(p_data->'choice')='array' then
      v_choice:=lower(trim(coalesce(p_data->'choice'->>0,'')));
    else
      v_choice:=lower(trim(coalesce(p_data->>'choice','')));
    end if;

    if v_choice='revisar' then
      v_review:=public.format_whatsapp_flow_cart_review_v1(p_conversation_id);
      update public.experience_sessions
         set flow_current_screen='REVISAO',flow_state_version=flow_state_version+1,updated_at=now()
       where id=s.id;
      return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','REVISAO','data',jsonb_build_object(
        'summary',coalesce(v_review->>'summary',''),
        'total',coalesce(v_review->>'total',''),
        'total_label','Total do pedido: '||coalesce(v_review->>'total',''),
        'pricing_note',coalesce(v_review->>'pricing_note','A cesta possui preço comercial próprio.'))));
    end if;

    if v_choice='mais' then
      v_mode:=coalesce(s.context->>'flow_browse_mode','');
      v_key:=coalesce(s.context->>'flow_browse_key','');
      v_title:=coalesce(s.context->>'flow_query_title',v_key);
      begin v_page:=greatest(1,coalesce((s.context->>'flow_products_page')::integer,1))+1; exception when others then v_page:=2; end;
    elsif v_choice in ('mercearia','limpeza','higiene','bebidas','casa_pet') then
      v_mode:='section'; v_key:=v_choice; v_page:=1;
      v_title:=case v_choice when 'mercearia' then 'Mercearia' when 'limpeza' then 'Limpeza e lavanderia' when 'higiene' then 'Higiene e beleza' when 'bebidas' then 'Bebidas' else 'Casa e pet' end;
    else
      return jsonb_build_object('ok',true,'response',jsonb_build_object('screen',v_screen,'data',public.get_whatsapp_flow_premium_menu_v1(p_conversation_id,'Escolha uma categoria, finalize ou use a busca.',coalesce((s.context->>'flow_has_more')::boolean,false),case when coalesce((s.context->>'flow_has_more')::boolean,false) then 'Ver mais' else null end)));
    end if;

    v_page_data:=public.get_whatsapp_flow_premium_product_page_v1(p_conversation_id,v_mode,v_key,v_title,v_page);
    if not coalesce((v_page_data->>'has_products')::boolean,false) then
      return jsonb_build_object('ok',true,'response',jsonb_build_object('screen',v_screen,'data',public.get_whatsapp_flow_premium_menu_v1(p_conversation_id,'Não há mais produtos nessa opção. Escolha outra categoria ou finalize.',false,null)));
    end if;
    v_allowed:=coalesce(v_page_data->'slot_ids','[]'::jsonb);
    update public.experience_sessions
       set context=coalesce(context,'{}'::jsonb)||jsonb_build_object(
          'flow_browse_mode',v_mode,'flow_browse_key',v_key,'flow_query_title',v_title,
          'flow_products_page',v_page,'flow_product_option_ids',v_allowed,
          'flow_has_more',coalesce((v_page_data->>'has_more')::boolean,false)),
           flow_current_screen='PRODUTOS',flow_state_version=flow_state_version+1,updated_at=now()
     where id=s.id;
    v_page_data:=v_page_data-'slot_ids'-'has_products'-'page_number'-'has_more'-'browse_mode'-'browse_key'-'browse_title';
    return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','PRODUTOS_'||v_round,'data',v_page_data));
  end if;

  if p_action='data_exchange' and v_screen ~ '^SECOES_[ABC]$' and v_trigger='premium_search_v1' then
    if coalesce(s.flow_current_screen,'')<>'SECOES' then
      return jsonb_build_object('ok',false,'reason','flow_transition_invalid');
    end if;
    v_query:=left(trim(coalesce(p_data->>'direct_query','')),80);
    if length(v_query)<2 then
      return jsonb_build_object('ok',true,'response',jsonb_build_object('screen',v_screen,'data',public.get_whatsapp_flow_premium_menu_v1(p_conversation_id,'Digite pelo menos 2 letras para buscar.',coalesce((s.context->>'flow_has_more')::boolean,false),'Ver mais')));
    end if;
    v_page_data:=public.get_whatsapp_flow_premium_product_page_v1(p_conversation_id,'query',v_query,v_query,1);
    if not coalesce((v_page_data->>'has_products')::boolean,false) then
      return jsonb_build_object('ok',true,'response',jsonb_build_object('screen',v_screen,'data',public.get_whatsapp_flow_premium_menu_v1(p_conversation_id,'Não encontrei produto disponível nessa busca. Tente outro nome.',false,null)));
    end if;
    v_allowed:=coalesce(v_page_data->'slot_ids','[]'::jsonb);
    update public.experience_sessions
       set context=coalesce(context,'{}'::jsonb)||jsonb_build_object(
         'flow_browse_mode','query','flow_browse_key',v_query,'flow_query_title',v_query,
         'flow_products_page',1,'flow_product_option_ids',v_allowed,
         'flow_has_more',coalesce((v_page_data->>'has_more')::boolean,false)),
           flow_current_screen='PRODUTOS',flow_state_version=flow_state_version+1,updated_at=now()
     where id=s.id;
    v_page_data:=v_page_data-'slot_ids'-'has_products'-'page_number'-'has_more'-'browse_mode'-'browse_key'-'browse_title';
    return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','PRODUTOS_'||v_round,'data',v_page_data));
  end if;

  if p_action='data_exchange' and v_screen ~ '^PRODUTOS_[ABC]$' and v_trigger='premium_products_selected_v1' then
    if coalesce(s.flow_current_screen,'')<>'PRODUTOS' then
      return jsonb_build_object('ok',false,'reason','flow_transition_invalid');
    end if;
    v_selected:=coalesce(p_data->'selected_products','[]'::jsonb);
    if jsonb_typeof(v_selected)<>'array' then
      begin v_selected:=(p_data->>'selected_products')::jsonb; exception when others then v_selected:='[]'::jsonb; end;
    end if;
    if jsonb_typeof(v_selected)<>'array' or jsonb_array_length(v_selected)>20 then
      return jsonb_build_object('ok',false,'reason','invalid_product_selection');
    end if;

    if jsonb_array_length(v_selected)=0 then
      if v_next_round is null then
        v_review:=public.format_whatsapp_flow_cart_review_v1(p_conversation_id);
        update public.experience_sessions set flow_current_screen='REVISAO',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
        return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','REVISAO','data',jsonb_build_object(
          'summary',coalesce(v_review->>'summary',''),'total',coalesce(v_review->>'total',''),
          'total_label','Total do pedido: '||coalesce(v_review->>'total',''),
          'pricing_note',coalesce(v_review->>'pricing_note','A cesta possui preço comercial próprio.'))));
      end if;
      update public.experience_sessions set flow_current_screen='SECOES',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
      return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','SECOES_'||v_next_round,'data',public.get_whatsapp_flow_premium_menu_v1(
        p_conversation_id,'Nenhum produto foi selecionado. Você pode escolher outra categoria ou finalizar.',coalesce((s.context->>'flow_has_more')::boolean,false),'Ver mais')));
    end if;

    v_allowed:=coalesce(s.context->'flow_product_option_ids','[]'::jsonb);
    for i in 0..jsonb_array_length(v_selected)-1 loop
      if not (v_allowed @> jsonb_build_array(v_selected->>i)) then
        return jsonb_build_object('ok',false,'reason','product_selection_out_of_page');
      end if;
    end loop;

    v_qty_data:=jsonb_build_object(
      'title','Escolha as quantidades',
      'message','Já deixamos 1 unidade selecionada. Altere somente o que quiser.'
    );
    for i in 1..20 loop
      v_qty_data:=v_qty_data||jsonb_build_object(
        'q'||lpad(i::text,2,'0')||'_label','Produto',
        'q'||lpad(i::text,2,'0')||'_visible',false,
        'q'||lpad(i::text,2,'0')||'_options',jsonb_build_array(jsonb_build_object('id','0','title','0 · Retirar'))
      );
    end loop;

    for i in 0..jsonb_array_length(v_selected)-1 loop
      begin v_product_id:=(v_selected->>i)::uuid; exception when others then return jsonb_build_object('ok',false,'reason','invalid_product_id'); end;
      v_product:=public.get_whatsapp_sellable_product_v1(v_product_id);
      if v_product is null then return jsonb_build_object('ok',false,'reason','product_not_sellable'); end if;
      v_stock:=greatest(0,floor(coalesce((v_product->>'stock')::numeric,0))::integer);
      select coalesce(jsonb_agg(jsonb_build_object('id',g::text,'title',case when g=0 then '0 · Retirar' when g=1 then '1 unidade' else g::text||' unidades' end) order by g),'[]'::jsonb)
        into v_opts from generate_series(0,least(6,v_stock)) g;
      v_qty_data:=v_qty_data||jsonb_build_object(
        'q'||lpad((i+1)::text,2,'0')||'_label',left(coalesce(v_product->>'name','Produto'),20),
        'q'||lpad((i+1)::text,2,'0')||'_visible',true,
        'q'||lpad((i+1)::text,2,'0')||'_options',v_opts
      );
      v_init:=v_init||jsonb_build_object('q'||lpad((i+1)::text,2,'0'),'1');
      v_slots:=v_slots||jsonb_build_object('q'||lpad((i+1)::text,2,'0'),v_product_id::text);
    end loop;
    v_qty_data:=v_qty_data||jsonb_build_object('init_values',v_init);

    update public.experience_sessions
       set context=coalesce(context,'{}'::jsonb)||jsonb_build_object(
         'flow_selected_product_ids',v_selected,'flow_quantity_slots',v_slots),
           flow_current_screen='QUANTIDADES',flow_state_version=flow_state_version+1,updated_at=now()
     where id=s.id;
    return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','QUANTIDADES_'||v_round,'data',v_qty_data));
  end if;

  if p_action='data_exchange' and v_screen ~ '^QUANTIDADES_[ABC]$' and v_trigger='premium_quantities_continue_v1' then
    if coalesce(s.flow_current_screen,'')<>'QUANTIDADES' then
      return jsonb_build_object('ok',false,'reason','flow_transition_invalid');
    end if;
    v_slots:=coalesce(s.context->'flow_quantity_slots','{}'::jsonb);
    v_state:=coalesce(s.flow_state_version,0);
    v_pending:=coalesce(s.context->'flow_pending_addons','[]'::jsonb);
    if jsonb_typeof(v_pending)<>'array' then v_pending:='[]'::jsonb; end if;

    for i in 1..20 loop
      if nullif(v_slots->>('q'||lpad(i::text,2,'0')),'') is null then continue; end if;
      begin v_qty:=coalesce(nullif(trim(p_data->>('q'||lpad(i::text,2,'0'))),''),'1')::numeric; exception when others then return jsonb_build_object('ok',false,'reason','invalid_quantity'); end;
      if v_qty<>trunc(v_qty) or v_qty<0 or v_qty>6 then return jsonb_build_object('ok',false,'reason','invalid_quantity'); end if;
      begin v_product_id:=(v_slots->>('q'||lpad(i::text,2,'0')))::uuid; exception when others then return jsonb_build_object('ok',false,'reason','invalid_product_slot'); end;
      v_product:=public.get_whatsapp_sellable_product_v1(v_product_id);
      if v_product is null then return jsonb_build_object('ok',false,'reason','product_not_sellable'); end if;
      v_stock:=greatest(0,floor(coalesce((v_product->>'stock')::numeric,0))::integer);
      if v_qty>least(6,v_stock) then return jsonb_build_object('ok',false,'reason','quantity_exceeds_stock'); end if;
    end loop;

    for i in 1..20 loop
      if nullif(v_slots->>('q'||lpad(i::text,2,'0')),'') is null then continue; end if;
      begin v_qty:=coalesce(nullif(trim(p_data->>('q'||lpad(i::text,2,'0'))),''),'1')::numeric; exception when others then v_qty:=1; end;
      if v_qty<=0 then continue; end if;
      v_product_id:=(v_slots->>('q'||lpad(i::text,2,'0')))::uuid;
      if v_write_ready then
        v_op:=replace(s.id::text,'-','')||':premium:'||v_state::text||':'||i::text;
        perform public.apply_whatsapp_flow_commercial_write_v1(s.id,v_state,v_op,'set_addon',jsonb_build_object('product_id',v_product_id,'quantity',v_qty));
      elsif jsonb_array_length(v_pending)<80 then
        v_pending:=v_pending||jsonb_build_array(jsonb_build_object('product_id',v_product_id,'quantity',v_qty));
      end if;
    end loop;

    if v_next_round is null then
      v_review:=public.format_whatsapp_flow_cart_review_v1(p_conversation_id);
      update public.experience_sessions
         set context=coalesce(context,'{}'::jsonb)||jsonb_build_object('flow_pending_addons',v_pending),
             flow_current_screen='REVISAO',flow_state_version=flow_state_version+1,updated_at=now()
       where id=s.id;
      return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','REVISAO','data',jsonb_build_object(
        'summary',coalesce(v_review->>'summary',''),'total',coalesce(v_review->>'total',''),
        'total_label','Total do pedido: '||coalesce(v_review->>'total',''),
        'pricing_note',coalesce(v_review->>'pricing_note','A cesta possui preço comercial próprio.'))));
    end if;

    update public.experience_sessions
       set context=coalesce(context,'{}'::jsonb)||jsonb_build_object('flow_pending_addons',v_pending),
           flow_current_screen='SECOES',flow_state_version=flow_state_version+1,updated_at=now()
     where id=s.id;
    return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','SECOES_'||v_next_round,'data',public.get_whatsapp_flow_premium_menu_v1(
      p_conversation_id,'Produtos adicionados. Finalize agora ou continue comprando.',coalesce((s.context->>'flow_has_more')::boolean,false),'Ver mais')));
  end if;

  v_result:=public.handle_whatsapp_flow_commercial_exchange_v12(p_session_id,p_conversation_id,p_action,p_screen,p_data);
  if not coalesce((v_result->>'ok')::boolean,false) then return v_result; end if;
  v_response:=coalesce(v_result->'response','{}'::jsonb);
  v_data:=coalesce(v_response->'data','{}'::jsonb);

  if coalesce(v_response->>'screen','') ~ '^SECOES_[ABC]$' then
    v_response:=jsonb_build_object('screen',v_response->>'screen','data',public.get_whatsapp_flow_premium_menu_v1(
      p_conversation_id,'Sua cesta está pronta. Finalize agora ou acrescente outros produtos.',false,null));
    return jsonb_set(v_result,'{response}',v_response,false);
  end if;

  if coalesce(v_response->>'screen','')='REVISAO' then
    v_data:=v_data||jsonb_build_object('total_label','Total do pedido: '||coalesce(v_data->>'total',''));
    v_response:=jsonb_set(v_response,'{data}',v_data,false);
    return jsonb_set(v_result,'{response}',v_response,false);
  end if;

  if coalesce(v_response->>'screen','')='FINALIZAR' then
    if not coalesce((v_data->>'write_enabled')::boolean,false) or nullif(trim(coalesce(v_data->>'final_total','')),'') is null then
      v_response:=jsonb_build_object('screen','FALHA_FINALIZACAO','data',jsonb_build_object(
        'message','Não conseguimos confirmar o pedido com segurança. Volte ao WhatsApp para concluirmos com você.'));
      return jsonb_set(v_result,'{response}',v_response,false);
    end if;
    v_payment:=lower(trim(coalesce(p_data->>'payment_method','')));
    v_data:=v_data||jsonb_build_object(
      'order_number','Pedido confirmado',
      'final_total_label','Total: '||coalesce(v_data->>'final_total',''),
      'payment_label',case v_payment when 'pix' then 'PIX na entrega' when 'dinheiro' then 'Dinheiro na entrega' when 'cartao_entrega' then 'Cartão na entrega' else 'Pagamento na entrega' end
    );
    v_response:=jsonb_set(v_response,'{data}',v_data,false);
    return jsonb_set(v_result,'{response}',v_response,false);
  end if;

  return v_result;
end;
$$;

insert into public.experience_definitions(
  slug,feature_key,experience_type,purpose,status,provider,provider_id,schema_version,config,metadata
)
select
  'flow-cestas-comercial-v4',feature_key,experience_type,
  'Flow comercial V27 premium candidato: menus de um toque, ate 20 produtos visuais por pagina, multisselecao e quantidades somente dos selecionados.',
  'draft','meta_whatsapp_flow',null,schema_version,
  config||jsonb_build_object(
    'flow_json_version','v27',
    'handler_version','v13',
    'products_per_page',20,
    'product_selection_mode','multi_select_then_quantity',
    'single_choice_navigation','chips_on_select_data_exchange',
    'compact_product_media',true,
    'review_total_server_label',true,
    'safe_terminal_confirmation',true,
    'production_enabled',false,
    'never_load_full_catalog',true,
    'full_catalog_load_forbidden',true
  ),
  jsonb_build_object(
    'candidate_not_live',true,
    'default_for_new_sessions',false,
    'source_definition_slug','flow-cestas-comercial-v3',
    'implementation_stage','v27_backend_ready',
    'created_at',now()
  )
from public.experience_definitions
where slug='flow-cestas-comercial-v3'
on conflict(slug) do update set
  purpose=excluded.purpose,
  status='draft',
  provider='meta_whatsapp_flow',
  provider_id=null,
  config=excluded.config,
  metadata=public.experience_definitions.metadata||excluded.metadata,
  updated_at=now();

revoke all on function public.get_whatsapp_flow_section_results_page_v2(text,integer,integer) from public,anon,authenticated;
revoke all on function public.get_whatsapp_flow_query_results_page_v2(text,integer,integer) from public,anon,authenticated;
revoke all on function public.get_whatsapp_flow_premium_menu_v1(uuid,text,boolean,text) from public,anon,authenticated;
revoke all on function public.get_whatsapp_flow_premium_product_page_v1(uuid,text,text,text,integer) from public,anon,authenticated;
revoke all on function public.handle_whatsapp_flow_commercial_exchange_v13(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_section_results_page_v2(text,integer,integer) to service_role;
grant execute on function public.get_whatsapp_flow_query_results_page_v2(text,integer,integer) to service_role;
grant execute on function public.get_whatsapp_flow_premium_menu_v1(uuid,text,boolean,text) to service_role;
grant execute on function public.get_whatsapp_flow_premium_product_page_v1(uuid,text,text,text,integer) to service_role;
grant execute on function public.handle_whatsapp_flow_commercial_exchange_v13(uuid,uuid,text,text,jsonb) to service_role;

commit;
