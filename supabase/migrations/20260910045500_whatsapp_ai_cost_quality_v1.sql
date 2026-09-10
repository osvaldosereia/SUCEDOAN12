-- Dona Antônia — qualidade de atendimento com custo controlado.
-- 1) contexto compacto para o planejador; 2) consultas simples de produto sem IA.
-- Bling, pós-venda e demais gates permanecem inalterados.

begin;

create or replace function public.get_service_intelligence_compact_v1(
  p_channel text default 'whatsapp',
  p_intent text default null,
  p_stage text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  cfg public.service_intelligence_runtime_config%rowtype;
  k jsonb:='[]'::jsonb;
  g jsonb:='[]'::jsonb;
  p jsonb:='[]'::jsonb;
begin
  select * into cfg from public.service_intelligence_runtime_config where id=1;
  if not found or not cfg.enabled or cfg.execution_mode='off' then
    return jsonb_build_object('enabled',false,'knowledge','[]'::jsonb,'guidance','[]'::jsonb,'procedures','[]'::jsonb);
  end if;

  if cfg.knowledge_enabled then
    select coalesce(jsonb_agg(jsonb_build_object(
      'key',x.knowledge_key,
      'title',left(x.title,120),
      'content',left(x.content,600)
    ) order by x.priority desc,x.updated_at desc),'[]'::jsonb)
    into k
    from (
      select * from public.service_knowledge_items
      where status='published'
        and p_channel=any(channel_scope)
        and (valid_from is null or valid_from<=now())
        and (valid_until is null or valid_until>now())
      order by priority desc,updated_at desc
      limit least(cfg.max_knowledge_items,6)
    ) x;
  end if;

  if cfg.guidance_enabled then
    select coalesce(jsonb_agg(jsonb_build_object(
      'key',x.rule_key,
      'title',left(x.title,120),
      'instruction',left(x.instruction,500),
      'behavior_tags',x.behavior_tags
    ) order by x.priority desc,x.updated_at desc),'[]'::jsonb)
    into g
    from (
      select * from public.service_guidance_rules
      where status='published'
        and p_channel=any(channel_scope)
        and (cardinality(intent_scope)=0 or p_intent is null or p_intent=any(intent_scope))
        and (cardinality(stage_scope)=0 or p_stage is null or p_stage=any(stage_scope))
      order by priority desc,updated_at desc
      limit least(cfg.max_guidance_items,6)
    ) x;
  end if;

  if cfg.procedures_enabled then
    select coalesce(jsonb_agg(jsonb_build_object(
      'key',x.procedure_key,
      'title',left(x.title,120),
      'trigger',left(x.trigger_description,300),
      'steps',x.steps,
      'allowed_actions',x.allowed_actions,
      'confirmation_actions',x.confirmation_actions,
      'fallback',left(x.fallback,300)
    ) order by x.priority desc,x.updated_at desc),'[]'::jsonb)
    into p
    from (
      select * from public.service_procedures
      where status='published'
      order by priority desc,updated_at desc
      limit least(cfg.max_procedure_items,3)
    ) x;
  end if;

  return jsonb_build_object(
    'enabled',true,
    'execution_mode',cfg.execution_mode,
    'knowledge',k,
    'guidance',g,
    'procedures',p
  );
end;
$$;

revoke all on function public.get_service_intelligence_compact_v1(text,text,text) from public,anon,authenticated;
grant execute on function public.get_service_intelligence_compact_v1(text,text,text) to service_role;

create or replace function public.build_whatsapp_sales_context_v1(p_conversation_id uuid, p_message_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  c public.conversations%rowtype;
  m public.messages%rowtype;
  customer jsonb;
  history jsonb;
  products jsonb;
  cart jsonb;
  intelligence jsonb;
  q text;
  st jsonb;
  v_reset_at timestamptz;
begin
  select * into c from public.conversations where id=p_conversation_id;
  if not found then raise exception 'conversation_not_found'; end if;

  select * into m from public.messages where id=p_message_id and conversation_id=c.id;
  if not found then raise exception 'message_not_found'; end if;

  select r.reset_at into v_reset_at
  from public.whatsapp_order_context_resets r
  where r.conversation_id=c.id;

  q:=left(coalesce(m.body_text,m.transcript,''),100);

  select case when u.id is null then null else jsonb_build_object(
    'id',u.id,
    'name',left(u.name,100),
    'preferred_reply',u.preferred_reply,
    'order_count',u.order_count,
    'last_order_at',u.last_order_at
  ) end
  into customer
  from public.customers u where u.id=c.customer_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'direction',x.direction,
    'type',x.message_type,
    'text',left(coalesce(x.body_text,x.transcript,''),280)
  ) order by x.created_at),'[]'::jsonb)
  into history
  from (
    select direction,message_type,body_text,transcript,created_at
    from public.messages
    where conversation_id=c.id
      and created_at>coalesce(v_reset_at,'-infinity'::timestamptz)
    order by created_at desc
    limit 6
  ) x;

  select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb)
  into products
  from public.search_whatsapp_sellable_products_v1(q,6) s;

  cart:=public.get_whatsapp_sales_cart_v1(c.id);
  intelligence:=public.get_service_intelligence_compact_v1('whatsapp',null,c.stage);
  select to_jsonb(x) into st from public.whatsapp_sales_state x where x.conversation_id=c.id;

  return jsonb_build_object(
    'conversation',jsonb_build_object(
      'id',c.id,
      'stage',c.stage,
      'mode',c.mode,
      'fast_checkout',c.fast_checkout,
      'upsell_declined',c.upsell_declined
    ),
    'message',jsonb_build_object(
      'id',m.id,
      'type',m.message_type,
      'text',left(coalesce(m.body_text,m.transcript,''),1200),
      'interactive',jsonb_build_object(
        'id',coalesce(m.ai_interpretation->>'id','')
      )
    ),
    'customer',customer,
    'cart',cart,
    'sales_state',coalesce(st,'{}'::jsonb),
    'product_candidates',products,
    'history',history,
    'intelligence',intelligence,
    'catalog_source','counter_verified',
    'history_scope','current_order_only_compact'
  );
end;
$$;

revoke all on function public.build_whatsapp_sales_context_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.build_whatsapp_sales_context_v1(uuid,uuid) to service_role;

create or replace function public.route_whatsapp_simple_product_query_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  m public.messages%rowtype;
  raw_text text;
  n text;
  q text;
  rows_json jsonb;
  row_count integer:=0;
  reply text;
  interactive jsonb;
  first_row jsonb;
  price_question boolean:=false;
begin
  if new.job_type<>'conversation' or new.status<>'pending' then return new; end if;
  select * into m from public.messages where id=new.message_id and direction='inbound';
  if not found then return new; end if;
  if coalesce(m.ai_interpretation->>'id','')<>'' then return new; end if;

  raw_text:=trim(regexp_replace(coalesce(m.body_text,m.transcript,''),'\s+',' ','g'));
  if raw_text='' or length(raw_text)>140 then return new; end if;
  n:=translate(lower(raw_text),'áàãâéêíóôõúç','aaaaeeiooouc');

  -- Somente formatos inequívocos de consulta de catálogo. Conversa complexa continua na IA.
  if n ~ '^(qual|quais) (marca|marcas) de .+ (voce(s)? )?tem' then
    q:=regexp_replace(n,'^(qual|quais) (marca|marcas) de (.+?) (voce(s)? )?tem.*$','\3');
  elsif n ~ '^qual .+ (voce(s)? )?tem[ ?!]*$' then
    q:=regexp_replace(n,'^qual (.+?) (voce(s)? )?tem[ ?!]*$','\1');
  elsif n ~ '^(voce(s)? )?tem .+' then
    q:=regexp_replace(n,'^(voce(s)? )?tem (.+?)[ ?!]*$','\2');
  elsif n ~ '^quanto (custa|ta|esta) .+' then
    q:=regexp_replace(n,'^quanto (custa|ta|esta) (o |a |um |uma )?(.+?)[ ?!]*$','\4');
    price_question:=true;
  elsif n ~ '^(qual )?(o )?preco (do|da|de) .+' then
    q:=regexp_replace(n,'^(qual )?(o )?preco (do|da|de) (.+?)[ ?!]*$','\4');
    price_question:=true;
  else
    return new;
  end if;

  q:=trim(regexp_replace(coalesce(q,''),'\s+',' ','g'));
  if length(q)<2 or length(q)>80 then return new; end if;
  if q ~ '(cesta|cestas|entrega|frete|pagamento|pagar|pix|boleto|horario|hora|endereco|atendimento)' then return new; end if;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.score desc),'[]'::jsonb),count(*)::integer
    into rows_json,row_count
  from public.search_whatsapp_sellable_products_v1(q,8) s;

  if row_count=0 then
    reply:='Não encontrei '||left(q,70)||' entre os produtos disponíveis agora. Se quiser, me diga outra marca ou tamanho.';
    perform public.queue_whatsapp_sales_reply_v1(new.conversation_id,m.id,reply,'text',null,null,'simple_product_search',jsonb_build_object('query',q,'products','[]'::jsonb,'deterministic',true),1);
  elsif row_count=1 then
    first_row:=rows_json->0;
    reply:='Temos '||left(first_row->>'name',110)||' — R$ '||replace(to_char(coalesce((first_row->>'price')::numeric,0),'FM999999990.00'),'.',',')||'.';
    perform public.queue_whatsapp_sales_reply_v1(new.conversation_id,m.id,reply,'text',null,null,'simple_product_search',jsonb_build_object('query',q,'products',rows_json,'deterministic',true),1);
  else
    reply:=case when price_question then 'Encontrei estas opções e preços:' else 'Temos estas opções. Se quiser colocar alguma no pedido, toque nela:' end;
    select jsonb_build_object(
      'type','list',
      'body',jsonb_build_object('text',left(reply,1024)),
      'action',jsonb_build_object(
        'button','Escolher',
        'sections',jsonb_build_array(jsonb_build_object(
          'title','Opções',
          'rows',coalesce(jsonb_agg(jsonb_build_object(
            'id','da_add_product:'||(x->>'id'),
            'title',left(x->>'name',24),
            'description',left('R$ '||replace(to_char(coalesce((x->>'price')::numeric,0),'FM999999990.00'),'.',',')||case when coalesce(x->>'packaging','')<>'' then ' · '||(x->>'packaging') else '' end,72)
          )),'[]'::jsonb)
        ))
      )
    ) into interactive
    from jsonb_array_elements(rows_json) x;

    perform public.queue_whatsapp_sales_reply_v1(new.conversation_id,m.id,reply,'interactive',null,interactive,'simple_product_search',jsonb_build_object('query',q,'products',rows_json,'deterministic',true),1);
  end if;

  new.status:='done';
  new.result:=jsonb_build_object('deterministic',true,'action','simple_product_search','query',q,'product_count',row_count);
  new.updated_at:=now();
  return new;
end;
$$;

revoke all on function public.route_whatsapp_simple_product_query_v1() from public,anon,authenticated;

-- Triggers do mesmo evento executam em ordem alfabética. Mantém o release gate a0 primeiro.
drop trigger if exists a1_whatsapp_simple_product_query_v1 on public.ai_jobs;
create trigger a1_whatsapp_simple_product_query_v1
before insert on public.ai_jobs
for each row execute function public.route_whatsapp_simple_product_query_v1();

commit;
