-- Dona Antônia — contexto v2 mais enxuto para reduzir tokens sem perder verdade comercial.
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
      'title',left(x.title,100),
      'content',left(x.content,420)
    ) order by x.priority desc,x.updated_at desc),'[]'::jsonb)
    into k
    from (
      select * from public.service_knowledge_items
      where status='published'
        and p_channel=any(channel_scope)
        and (valid_from is null or valid_from<=now())
        and (valid_until is null or valid_until>now())
      order by priority desc,updated_at desc
      limit least(cfg.max_knowledge_items,4)
    ) x;
  end if;

  if cfg.guidance_enabled then
    select coalesce(jsonb_agg(jsonb_build_object(
      'key',x.rule_key,
      'title',left(x.title,100),
      'instruction',left(x.instruction,380),
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
      limit least(cfg.max_guidance_items,4)
    ) x;
  end if;

  if cfg.procedures_enabled then
    select coalesce(jsonb_agg(jsonb_build_object(
      'key',x.procedure_key,
      'title',left(x.title,100),
      'trigger',left(x.trigger_description,240),
      'steps',left(x.steps::text,800),
      'allowed_actions',x.allowed_actions,
      'confirmation_actions',x.confirmation_actions,
      'fallback',left(x.fallback,220)
    ) order by x.priority desc,x.updated_at desc),'[]'::jsonb)
    into p
    from (
      select * from public.service_procedures
      where status='published'
      order by priority desc,updated_at desc
      limit least(cfg.max_procedure_items,1)
    ) x;
  end if;

  return jsonb_build_object('enabled',true,'execution_mode',cfg.execution_mode,'knowledge',k,'guidance',g,'procedures',p);
end;
$$;

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
  cart_full jsonb;
  cart jsonb;
  compact_items jsonb:='[]'::jsonb;
  intelligence jsonb;
  q text;
  st jsonb;
  v_reset_at timestamptz;
begin
  select * into c from public.conversations where id=p_conversation_id;
  if not found then raise exception 'conversation_not_found'; end if;
  select * into m from public.messages where id=p_message_id and conversation_id=c.id;
  if not found then raise exception 'message_not_found'; end if;

  select r.reset_at into v_reset_at from public.whatsapp_order_context_resets r where r.conversation_id=c.id;
  q:=left(coalesce(m.body_text,m.transcript,''),100);

  select case when u.id is null then null else jsonb_build_object(
    'id',u.id,'name',left(u.name,100),'preferred_reply',u.preferred_reply,
    'order_count',u.order_count,'last_order_at',u.last_order_at
  ) end into customer
  from public.customers u where u.id=c.customer_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'direction',x.direction,'type',x.message_type,'text',left(coalesce(x.body_text,x.transcript,''),240)
  ) order by x.created_at),'[]'::jsonb)
  into history
  from (
    select direction,message_type,body_text,transcript,created_at
    from public.messages
    where conversation_id=c.id and created_at>coalesce(v_reset_at,'-infinity'::timestamptz)
    order by created_at desc limit 5
  ) x;

  select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) into products
  from public.search_whatsapp_sellable_products_v1(q,5) s;

  cart_full:=public.get_whatsapp_sales_cart_v1(c.id);
  if jsonb_typeof(cart_full->'items')='array' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'product_id',x->>'product_id',
      'name',left(x->>'name',90),
      'quantity',x->'quantity',
      'unit_price',x->'unit_price',
      'line_total',x->'line_total',
      'source',x->>'source'
    )),'[]'::jsonb)
    into compact_items
    from (select value x from jsonb_array_elements(cart_full->'items') limit 20) i;
  end if;
  cart:=jsonb_build_object(
    'exists',coalesce((cart_full->>'exists')::boolean,false),
    'id',cart_full->'id',
    'status',cart_full->'status',
    'total',cart_full->'total',
    'items',compact_items
  );

  intelligence:=public.get_service_intelligence_compact_v1('whatsapp',null,c.stage);
  select to_jsonb(x) into st from public.whatsapp_sales_state x where x.conversation_id=c.id;

  return jsonb_build_object(
    'conversation',jsonb_build_object('id',c.id,'stage',c.stage,'mode',c.mode,'fast_checkout',c.fast_checkout,'upsell_declined',c.upsell_declined),
    'message',jsonb_build_object('id',m.id,'type',m.message_type,'text',left(coalesce(m.body_text,m.transcript,''),1000),'interactive',jsonb_build_object('id',coalesce(m.ai_interpretation->>'id',''))),
    'customer',customer,
    'cart',cart,
    'sales_state',coalesce(st,'{}'::jsonb),
    'product_candidates',products,
    'history',history,
    'intelligence',intelligence,
    'catalog_source','counter_verified',
    'history_scope','current_order_only_compact_v2'
  );
end;
$$;

revoke all on function public.get_service_intelligence_compact_v1(text,text,text) from public,anon,authenticated;
grant execute on function public.get_service_intelligence_compact_v1(text,text,text) to service_role;
revoke all on function public.build_whatsapp_sales_context_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.build_whatsapp_sales_context_v1(uuid,uuid) to service_role;

commit;
