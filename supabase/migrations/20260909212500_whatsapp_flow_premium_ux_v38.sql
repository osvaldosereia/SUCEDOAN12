-- Dona Antonia WhatsApp Flow V27 premium UX candidate.
-- Adds new functions/definition only. Does not change the live V3 definition, rollout,
-- Data Exchange route, or Bling sync.

create or replace function public.search_whatsapp_sellable_products_v2(
  p_query text,
  p_limit integer default 120
) returns table(
  id uuid, sku text, gtin text, name text, brand text, category text, packaging text,
  price numeric, stock numeric, image_url text, gondola text, shelf text, score integer
)
language sql
stable
security definer
set search_path=''
as $$
with q as (
  select translate(lower(trim(coalesce(p_query,''))),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc') term,
         greatest(1,least(coalesce(p_limit,120),200)) lim
), normalized as (
  select p.*,
    translate(lower(coalesce(p.name,'')),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc') n_name,
    translate(lower(coalesce(p.brand,'')),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc') n_brand,
    translate(lower(coalesce(p.category,'')),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc') n_category
  from public.products p
  where p.physically_verified=true
    and p.is_active=true
    and p.is_whatsapp_active=true
    and p.price is not null and p.price>=0
    and coalesce(p.stock,0)>0
), ranked as (
  select p.id,p.sku,p.gtin,p.name,p.brand,p.category,p.packaging,p.price,p.stock,p.image_url,p.gondola,p.shelf,
    case
      when q.term<>'' and lower(coalesce(p.gtin,''))=q.term then 100
      when q.term<>'' and lower(coalesce(p.sku,''))=q.term then 98
      when q.term<>'' and p.n_name=q.term then 96
      when q.term<>'' and p.n_name like q.term||'%' then 94
      when q.term<>'' and strpos(p.n_name,q.term) between 1 and 14 then 90
      when q.term<>'' and p.n_name like '%'||q.term||'%' then 80
      when q.term<>'' and p.n_brand like '%'||q.term||'%' then 70
      when q.term<>'' and p.n_category like '%'||q.term||'%' then 60
      else 10 end score,
    case when q.term='' then 9999 else nullif(strpos(p.n_name,q.term),0) end term_position,
    p.sort_order
  from normalized p cross join q
  where q.term=''
     or lower(coalesce(p.gtin,''))=q.term
     or lower(coalesce(p.sku,''))=q.term
     or p.n_name like '%'||q.term||'%'
     or p.n_brand like '%'||q.term||'%'
     or p.n_category like '%'||q.term||'%'
)
select r.id,r.sku,r.gtin,r.name,r.brand,r.category,r.packaging,r.price,r.stock,r.image_url,r.gondola,r.shelf,r.score
from ranked r cross join q
order by r.score desc,r.term_position nulls last,r.sort_order nulls last,r.name,r.id
limit (select lim from q)
$$;

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
      when 'mercearia' then upper(coalesce(p.category,'')) similar to '%(CAFÉ|CAFE|BOLACHA|BISCOITO|MACARRÃO|MACARRAO|MOLHO|MERCEARIA|BALA|CHICLETE|TEMPERO|CONFEITARIA|CHOCOLATE|DOCE|SALGADINHO|PETISCO|ARROZ|FEIJÃO|FEIJAO|AÇÚCAR|ACUCAR|OLEO|ÓLEO|FARINHA)%'
      when 'limpeza' then upper(coalesce(p.category,'')) similar to '%(LIMPEZA|LAVANDERIA|DETERGENTE|DESINFETANTE|SABÃO|SABAO|AMACIANTE)%'
      when 'higiene' then upper(coalesce(p.category,'')) similar to '%(HIGIENE|SHAMPOO|CONDICIONADOR|SABONETE|BELEZA|DENTAL|CREME|BEBÊ|BEBE)%'
      when 'bebidas' then upper(coalesce(p.category,'')) similar to '%(SUCO|REFRI|REFRIGERANTE|ENERGÉTICO|ENERGETICO|BEBIDA|ÁGUA|AGUA|ISOTÔNICO|ISOTONICO)%'
      when 'casa_pet' then upper(coalesce(p.category,'')) similar to '%(PET|UTILIDADE|CASA)%'
      else false end
), ranked as (
  select b.*,row_number() over(order by b.sort_order nulls last,b.name,b.id) rn,count(*) over() total_count
  from base b
), page_rows as (
  select r.* from ranked r,params x
  where r.rn>((x.pg-1)*x.ps) and r.rn<=(x.pg*x.ps)
), totals as (select coalesce(max(total_count),0)::integer total from ranked)
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

create or replace function public.get_whatsapp_flow_product_results_page_v2(
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
), totals as (select coalesce(max(total_count),0)::integer total from ranked)
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

create or replace function public.get_whatsapp_flow_premium_review_v1(
  p_conversation_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_review jsonb; v_total text; begin
  v_review:=public.format_whatsapp_flow_cart_review_v1(p_conversation_id);
  v_total:=coalesce(v_review->>'total','R$ 0,00');
  return jsonb_build_object(
    'summary',coalesce(v_review->>'summary',''),
    'total',v_total,
    'total_label','Total do pedido: '||v_total,
    'pricing_note',coalesce(v_review->>'pricing_note','A cesta possui preço comercial próprio. Os componentes da cesta não exibem preço individual.')
  );
end;
$$;

create or replace function public.get_whatsapp_flow_premium_menu_v1(
  p_session_id uuid,
  p_conversation_id uuid,
  p_message text default null
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_review jsonb; v_ctx jsonb:='{}'::jsonb; v_actions jsonb:='[]'::jsonb;
  v_has_more boolean:=false; v_title text:='';
begin
  if p_session_id is not null then
    select coalesce(context,'{}'::jsonb) into v_ctx from public.experience_sessions where id=p_session_id;
    v_has_more:=coalesce((v_ctx->>'flow_browse_has_more')::boolean,false);
    v_title:=left(coalesce(v_ctx->>'flow_query_title',''),22);
  end if;
  v_review:=public.get_whatsapp_flow_premium_review_v1(p_conversation_id);
  v_actions:=v_actions||jsonb_build_array(jsonb_build_object('id','revisar','title','Finalizar pedido','enabled',true));
  if v_has_more and v_title<>'' then
    v_actions:=v_actions||jsonb_build_array(jsonb_build_object('id','mais','title',left('Ver mais de '||v_title,30),'enabled',true));
  end if;
  v_actions:=v_actions||jsonb_build_array(
    jsonb_build_object('id','mercearia','title','Mercearia','enabled',true),
    jsonb_build_object('id','limpeza','title','Limpeza','enabled',true),
    jsonb_build_object('id','higiene','title','Higiene e beleza','enabled',true),
    jsonb_build_object('id','bebidas','title','Bebidas','enabled',true),
    jsonb_build_object('id','casa_pet','title','Casa e pet','enabled',true)
  );
  return jsonb_build_object(
    'cart_total','Total atual: '||coalesce(v_review->>'total','R$ 0,00'),
    'message',left(coalesce(nullif(trim(p_message),''),'Sua cesta está pronta. Finalize agora ou acrescente outros produtos.'),220),
    'quick_actions',v_actions,
    'search_hint','Ex.: leite, sabonete, café, detergente'
  );
end;
$$;

create or replace function public.get_whatsapp_flow_premium_product_picker_v1(
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
  v_page jsonb; v_products jsonb; v_options jsonb:='[]'::jsonb; v_item jsonb;
  v_total integer:=0; v_has_more boolean:=false; v_review jsonb; i integer;
begin
  if v_mode='section' then
    v_page:=public.get_whatsapp_flow_section_results_page_v2(v_key,v_page_no,20);
  elsif v_mode='query' then
    v_page:=public.get_whatsapp_flow_product_results_page_v2(v_key,v_page_no,20);
  else
    return jsonb_build_object('has_products',false,'product_options','[]'::jsonb);
  end if;
  v_products:=coalesce(v_page->'products','[]'::jsonb);
  v_total:=coalesce((v_page->>'total')::integer,0);
  v_has_more:=coalesce((v_page->>'has_more')::boolean,false);
  for i in 0..least(19,greatest(-1,jsonb_array_length(v_products)-1)) loop
    v_item:=v_products->i;
    v_options:=v_options||jsonb_build_array(jsonb_build_object(
      'id',coalesce(v_item->>'id',''),
      'title',left(coalesce(v_item->>'name','Produto'),30),
      'description',left(
        'R$ '||replace(to_char(coalesce((v_item->>'price')::numeric,0),'FM999999990.00'),'.',',')||
        case when length(coalesce(v_item->>'name',''))>30 then ' · '||coalesce(v_item->>'name','') else '' end||
        case when nullif(trim(coalesce(v_item->>'brand','')),'') is not null then ' · '||trim(v_item->>'brand') else '' end||
        case when nullif(trim(coalesce(v_item->>'packaging','')),'') is not null then ' · '||trim(v_item->>'packaging') else '' end,
        280),
      'image_url',left(coalesce(v_item->>'image_url',''),2000),
      'alt-text',left(coalesce(v_item->>'name','Produto'),80),
      'enabled',true
    ));
  end loop;
  v_review:=public.get_whatsapp_flow_premium_review_v1(p_conversation_id);
  return jsonb_build_object(
    'query_title',v_title,
    'cart_total','Total atual: '||coalesce(v_review->>'total','R$ 0,00'),
    'result_note',case
      when v_total=0 then 'Nenhum produto disponível.'
      when v_total<=20 then v_total::text||case when v_total=1 then ' produto disponível.' else ' produtos disponíveis.' end
      else 'Mostrando até 20 de '||v_total::text||'. Selecione quantos quiser.' end,
    'product_options',v_options,
    'has_products',jsonb_array_length(v_options)>0,
    'has_more',v_has_more,
    'page_number',v_page_no
  );
end;
$$;

create or replace function public.get_whatsapp_flow_premium_quantities_v1(
  p_selected jsonb
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_selected jsonb:=coalesce(p_selected,'[]'::jsonb); v_data jsonb; v_init jsonb:='{}'::jsonb;
  v_slots jsonb:='{}'::jsonb; v_item text; v_id uuid; v_product jsonb; v_opts jsonb; v_stock integer;
  v_count integer:=0; q text; i integer;
begin
  if jsonb_typeof(v_selected)<>'array' then return jsonb_build_object('ok',false,'reason','invalid_product_selection'); end if;
  if jsonb_array_length(v_selected)>20 then return jsonb_build_object('ok',false,'reason','too_many_products'); end if;
  v_data:=jsonb_build_object('title','Escolha as quantidades','message','Já deixamos 1 unidade selecionada. Altere somente o que quiser.');
  for i in 1..20 loop
    q:='q'||lpad(i::text,2,'0');
    v_data:=v_data||jsonb_build_object(q||'_label','',q||'_visible',false,q||'_options','[]'::jsonb);
    v_init:=v_init||jsonb_build_object(q,'1');
  end loop;
  for v_item in select value #>> '{}' from jsonb_array_elements(v_selected) loop
    exit when v_count>=20;
    begin v_id:=v_item::uuid; exception when others then return jsonb_build_object('ok',false,'reason','invalid_product_id'); end;
    v_product:=public.get_whatsapp_sellable_product_v1(v_id);
    if v_product is null then return jsonb_build_object('ok',false,'reason','product_not_sellable'); end if;
    v_count:=v_count+1; q:='q'||lpad(v_count::text,2,'0');
    v_stock:=greatest(0,floor(coalesce((v_product->>'stock')::numeric,0))::integer);
    select coalesce(jsonb_agg(jsonb_build_object('id',g::text,'title',case when g=0 then '0 · Retirar' when g=1 then '1 unidade' else g::text||' unidades' end) order by g),'[]'::jsonb)
      into v_opts from generate_series(0,least(6,v_stock)) g;
    v_data:=v_data||jsonb_build_object(
      q||'_label',left(coalesce(v_product->>'name','Produto'),20),
      q||'_visible',true,
      q||'_options',v_opts
    );
    v_slots:=v_slots||jsonb_build_object(q,v_id::text);
  end loop;
  return jsonb_build_object('ok',true,'count',v_count,'slot_map',v_slots,'data',v_data||jsonb_build_object('init_values',v_init));
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
  v_screen text:=coalesce(p_screen,''); v_trigger text:=coalesce(p_data->>'trigger',''); v_round text:='A'; v_next_round text;
  v_choice text:=''; v_query text; v_mode text; v_key text; v_title text; v_page integer:=1; v_picker jsonb; v_quant jsonb;
  v_selected jsonb:='[]'::jsonb; v_slots jsonb:='{}'::jsonb; v_review jsonb; v_result jsonb; v_response jsonb; v_data jsonb;
  v_write jsonb:=public.get_whatsapp_flow_commercial_write_readiness_v1(); v_write_ready boolean:=coalesce((v_write->>'ready')::boolean,false);
  v_pending jsonb; v_product_id uuid; v_product jsonb; v_qty numeric; v_stock integer; v_state integer; v_op text; q text; i integer;
  v_order public.orders%rowtype;
begin
  if v_screen ~ '_(A|B|C)$' then v_round:=right(v_screen,1); end if;
  select * into s from public.experience_sessions where id=p_session_id for update;
  if not found or s.conversation_id is distinct from p_conversation_id then return jsonb_build_object('ok',false,'reason','flow_session_not_found'); end if;
  if s.expires_at<=now() or s.status not in ('offered','open') then return jsonb_build_object('ok',false,'reason','flow_session_inactive'); end if;

  if p_action='data_exchange' and v_screen ~ '^SECOES_[ABC]$' and v_trigger in ('premium_menu_action_v1','premium_search_v1') then
    if coalesce(s.flow_current_screen,'')<>'SECOES' then return jsonb_build_object('ok',false,'reason','flow_transition_invalid'); end if;
    if v_trigger='premium_search_v1' then
      v_query:=left(trim(coalesce(p_data->>'direct_query','')),80);
      if length(v_query)<2 then
        return jsonb_build_object('ok',true,'response',jsonb_build_object('screen',v_screen,'data',public.get_whatsapp_flow_premium_menu_v1(s.id,p_conversation_id,'Digite pelo menos 2 letras para buscar.')));
      end if;
      v_mode:='query';v_key:=v_query;v_title:=v_query;v_page:=1;
    else
      if jsonb_typeof(p_data->'choice')='array' then v_choice:=lower(trim(coalesce(p_data->'choice'->>0,'')));
      else v_choice:=lower(trim(coalesce(p_data->>'choice',''))); end if;
      if v_choice='revisar' then
        v_review:=public.get_whatsapp_flow_premium_review_v1(p_conversation_id);
        update public.experience_sessions set flow_current_screen='REVISAO',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
        return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','REVISAO','data',v_review));
      elsif v_choice='mais' then
        v_mode:=coalesce(s.context->>'flow_browse_mode','');v_key:=coalesce(s.context->>'flow_browse_key','');
        v_title:=coalesce(s.context->>'flow_query_title',v_key);v_page:=greatest(1,coalesce((s.context->>'flow_products_page')::integer,1))+1;
      elsif v_choice in ('mercearia','limpeza','higiene','bebidas','casa_pet') then
        v_mode:='section';v_key:=v_choice;v_page:=1;
        v_title:=case v_choice when 'mercearia' then 'Mercearia' when 'limpeza' then 'Limpeza e lavanderia' when 'higiene' then 'Higiene e beleza' when 'bebidas' then 'Bebidas' else 'Casa e pet' end;
      else
        return jsonb_build_object('ok',true,'response',jsonb_build_object('screen',v_screen,'data',public.get_whatsapp_flow_premium_menu_v1(s.id,p_conversation_id,'Escolha uma opção ou faça uma busca.')));
      end if;
    end if;
    v_picker:=public.get_whatsapp_flow_premium_product_picker_v1(p_conversation_id,v_mode,v_key,v_title,v_page);
    if not coalesce((v_picker->>'has_products')::boolean,false) then
      return jsonb_build_object('ok',true,'response',jsonb_build_object('screen',v_screen,'data',public.get_whatsapp_flow_premium_menu_v1(s.id,p_conversation_id,'Nenhum produto disponível nessa opção.')));
    end if;
    update public.experience_sessions set context=coalesce(context,'{}'::jsonb)||jsonb_build_object(
      'flow_browse_mode',v_mode,'flow_browse_key',v_key,'flow_query_title',v_title,
      'flow_products_page',v_page,'flow_browse_has_more',coalesce((v_picker->>'has_more')::boolean,false)
    ),flow_current_screen='PRODUTOS',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
    v_picker:=v_picker-'has_products'-'has_more'-'page_number';
    return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','PRODUTOS_'||v_round,'data',v_picker));
  end if;

  if p_action='data_exchange' and v_screen ~ '^PRODUTOS_[ABC]$' and v_trigger='premium_products_selected_v1' then
    if coalesce(s.flow_current_screen,'')<>'PRODUTOS' then return jsonb_build_object('ok',false,'reason','flow_transition_invalid'); end if;
    v_selected:=coalesce(p_data->'selected_products','[]'::jsonb);
    if jsonb_typeof(v_selected)<>'array' then v_selected:='[]'::jsonb; end if;
    if jsonb_array_length(v_selected)=0 then
      if v_round='C' then
        v_review:=public.get_whatsapp_flow_premium_review_v1(p_conversation_id);
        update public.experience_sessions set flow_current_screen='REVISAO',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
        return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','REVISAO','data',v_review));
      end if;
      v_next_round:=case v_round when 'A' then 'B' else 'C' end;
      update public.experience_sessions set flow_current_screen='SECOES',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
      return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','SECOES_'||v_next_round,'data',public.get_whatsapp_flow_premium_menu_v1(s.id,p_conversation_id,'Nenhum produto adicionado. Você pode finalizar ou escolher outra categoria.')));
    end if;
    v_quant:=public.get_whatsapp_flow_premium_quantities_v1(v_selected);
    if not coalesce((v_quant->>'ok')::boolean,false) then return jsonb_build_object('ok',false,'reason',coalesce(v_quant->>'reason','quantity_screen_failed')); end if;
    update public.experience_sessions set context=coalesce(context,'{}'::jsonb)||jsonb_build_object('flow_quantity_slots',v_quant->'slot_map'),
      flow_current_screen='QUANTIDADES',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
    return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','QUANTIDADES_'||v_round,'data',v_quant->'data'));
  end if;

  if p_action='data_exchange' and v_screen ~ '^QUANTIDADES_[ABC]$' and v_trigger='premium_quantities_continue_v1' then
    if coalesce(s.flow_current_screen,'')<>'QUANTIDADES' then return jsonb_build_object('ok',false,'reason','flow_transition_invalid'); end if;
    v_slots:=coalesce(s.context->'flow_quantity_slots','{}'::jsonb); v_state:=coalesce(s.flow_state_version,0);
    v_pending:=coalesce(s.context->'flow_pending_addons','[]'::jsonb); if jsonb_typeof(v_pending)<>'array' then v_pending:='[]'::jsonb; end if;
    for i in 1..20 loop
      q:='q'||lpad(i::text,2,'0');
      if nullif(v_slots->>q,'') is null then continue; end if;
      begin v_qty:=coalesce(nullif(trim(p_data->>q),''),'1')::numeric; exception when others then return jsonb_build_object('ok',false,'reason','invalid_quantity'); end;
      if v_qty<>trunc(v_qty) or v_qty<0 or v_qty>6 then return jsonb_build_object('ok',false,'reason','invalid_quantity'); end if;
      begin v_product_id:=(v_slots->>q)::uuid; exception when others then return jsonb_build_object('ok',false,'reason','invalid_product_slot'); end;
      v_product:=public.get_whatsapp_sellable_product_v1(v_product_id); if v_product is null then return jsonb_build_object('ok',false,'reason','product_not_sellable'); end if;
      v_stock:=greatest(0,floor(coalesce((v_product->>'stock')::numeric,0))::integer); if v_qty>least(6,v_stock) then return jsonb_build_object('ok',false,'reason','quantity_exceeds_stock'); end if;
    end loop;
    for i in 1..20 loop
      q:='q'||lpad(i::text,2,'0'); if nullif(v_slots->>q,'') is null then continue; end if;
      begin v_qty:=coalesce(nullif(trim(p_data->>q),''),'1')::numeric; exception when others then v_qty:=0; end;
      if v_qty<=0 then continue; end if; v_product_id:=(v_slots->>q)::uuid;
      if v_write_ready then
        v_op:=replace(s.id::text,'-','')||':premium:'||v_state::text||':'||i::text;
        perform public.apply_whatsapp_flow_commercial_write_v1(s.id,v_state,v_op,'set_addon',jsonb_build_object('product_id',v_product_id,'quantity',v_qty));
      elsif jsonb_array_length(v_pending)<30 then
        v_pending:=v_pending||jsonb_build_array(jsonb_build_object('product_id',v_product_id,'quantity',v_qty));
      end if;
    end loop;
    if v_round='C' then
      v_review:=public.get_whatsapp_flow_premium_review_v1(p_conversation_id);
      update public.experience_sessions set context=(coalesce(context,'{}'::jsonb)||jsonb_build_object('flow_pending_addons',v_pending))-'flow_quantity_slots',
        flow_current_screen='REVISAO',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
      return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','REVISAO','data',v_review));
    end if;
    v_next_round:=case v_round when 'A' then 'B' else 'C' end;
    update public.experience_sessions set context=(coalesce(context,'{}'::jsonb)||jsonb_build_object('flow_pending_addons',v_pending))-'flow_quantity_slots',
      flow_current_screen='SECOES',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
    return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','SECOES_'||v_next_round,'data',public.get_whatsapp_flow_premium_menu_v1(s.id,p_conversation_id,'Produtos adicionados. Você pode finalizar ou continuar comprando.')));
  end if;

  v_result:=public.handle_whatsapp_flow_commercial_exchange_v12(p_session_id,p_conversation_id,p_action,p_screen,p_data);
  if not coalesce((v_result->>'ok')::boolean,false) then return v_result; end if;
  v_response:=coalesce(v_result->'response','{}'::jsonb); v_data:=coalesce(v_response->'data','{}'::jsonb);
  if coalesce(v_response->>'screen','') ~ '^SECOES_[ABC]$' then
    v_response:=jsonb_build_object('screen',v_response->>'screen','data',public.get_whatsapp_flow_premium_menu_v1(s.id,p_conversation_id,'Sua cesta está pronta. Finalize agora ou acrescente outros produtos.'));
    return jsonb_set(v_result,'{response}',v_response,false);
  end if;
  if coalesce(v_response->>'screen','')='REVISAO' then
    v_response:=jsonb_build_object('screen','REVISAO','data',public.get_whatsapp_flow_premium_review_v1(p_conversation_id));
    return jsonb_set(v_result,'{response}',v_response,false);
  end if;
  if coalesce(v_response->>'screen','')='FINALIZAR' then
    select * into v_order from public.orders where conversation_id=p_conversation_id and confirmed_at is not null and coalesce(total,0)>0 order by confirmed_at desc,created_at desc limit 1;
    if not found then
      v_response:=jsonb_build_object('screen','FALHA_FINALIZACAO','data',jsonb_build_object('message','Não conseguimos confirmar o pedido com segurança. Volte ao WhatsApp para concluirmos com você.'));
      return jsonb_set(v_result,'{response}',v_response,false);
    end if;
    v_data:=v_data||jsonb_build_object(
      'confirmation','Pedido confirmado com sucesso!',
      'order_number','Pedido #'||upper(right(replace(v_order.id::text,'-',''),6)),
      'final_summary',case when coalesce(v_data->>'final_summary','')='' or lower(coalesce(v_data->>'final_summary','')) like '%nenhum pedido%' then 'Pedido registrado e pronto para seguir para separação.' else v_data->>'final_summary' end,
      'final_total','R$ '||replace(to_char(v_order.total,'FM999999990.00'),'.',','),
      'final_total_label','Total: R$ '||replace(to_char(v_order.total,'FM999999990.00'),'.',','),
      'payment_label','Pagamento na entrega',
      'next_step','Ao voltar para a conversa, envie sua localização para confirmarmos o ponto exato da entrega.',
      'write_enabled',true
    );
    v_response:=jsonb_build_object('screen','FINALIZAR','data',v_data);
    return jsonb_set(v_result,'{response}',v_response,false);
  end if;
  return v_result;
end;
$$;

insert into public.experience_definitions(slug,feature_key,experience_type,purpose,status,provider,provider_id,schema_version,config,metadata)
select 'flow-cestas-comercial-v4',feature_key,experience_type,
       'Flow comercial V4 candidato premium: navegação de um toque, até 20 produtos com foto por página, seleção múltipla e quantidades em lote.',
       'draft','meta_whatsapp_flow',null,schema_version,
       config||jsonb_build_object(
         'flow_json_version','v27','handler_version','v13','candidate_products_per_page',20,
         'compact_media_product_list',true,'multi_select_product_page',true,'quantity_batch_screen',true,
         'single_choice_direct_actions',true,'review_total_label_server_built',true,
         'success_requires_confirmed_order',true,'production_enabled',false
       ),
       jsonb_build_object('candidate_not_live',true,'default_for_new_sessions',false,'source_definition_slug','flow-cestas-comercial-v3','created_at',now())
from public.experience_definitions where slug='flow-cestas-comercial-v3'
on conflict(slug) do update set purpose=excluded.purpose,status='draft',provider='meta_whatsapp_flow',provider_id=null,
  config=excluded.config,metadata=public.experience_definitions.metadata||excluded.metadata,updated_at=now();

revoke all on function public.search_whatsapp_sellable_products_v2(text,integer) from public,anon,authenticated;
revoke all on function public.get_whatsapp_flow_section_results_page_v2(text,integer,integer) from public,anon,authenticated;
revoke all on function public.get_whatsapp_flow_product_results_page_v2(text,integer,integer) from public,anon,authenticated;
revoke all on function public.get_whatsapp_flow_premium_review_v1(uuid) from public,anon,authenticated;
revoke all on function public.get_whatsapp_flow_premium_menu_v1(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.get_whatsapp_flow_premium_product_picker_v1(uuid,text,text,text,integer) from public,anon,authenticated;
revoke all on function public.get_whatsapp_flow_premium_quantities_v1(jsonb) from public,anon,authenticated;
revoke all on function public.handle_whatsapp_flow_commercial_exchange_v13(uuid,uuid,text,text,jsonb) from public,anon,authenticated;

grant execute on function public.search_whatsapp_sellable_products_v2(text,integer) to service_role;
grant execute on function public.get_whatsapp_flow_section_results_page_v2(text,integer,integer) to service_role;
grant execute on function public.get_whatsapp_flow_product_results_page_v2(text,integer,integer) to service_role;
grant execute on function public.get_whatsapp_flow_premium_review_v1(uuid) to service_role;
grant execute on function public.get_whatsapp_flow_premium_menu_v1(uuid,uuid,text) to service_role;
grant execute on function public.get_whatsapp_flow_premium_product_picker_v1(uuid,text,text,text,integer) to service_role;
grant execute on function public.get_whatsapp_flow_premium_quantities_v1(jsonb) to service_role;
grant execute on function public.handle_whatsapp_flow_commercial_exchange_v13(uuid,uuid,text,text,jsonb) to service_role;
