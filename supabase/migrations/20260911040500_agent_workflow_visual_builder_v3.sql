begin;

-- Visual builder V3: keeps the existing Agent Core/runtime and makes each
-- operational moment editable as a visual chatbot block. A condition has one
-- active entry block at a time; alternative blocks can be created as drafts
-- and activated explicitly from the Admin.

update public.agent_workflow_stages
set config = coalesce(config,'{}'::jsonb) || jsonb_build_object(
  'entry_condition', stage_key,
  'is_entry', true,
  'system_stage', true,
  'node_kind', 'ai',
  'draft', false
), updated_at=now()
where stage_key in ('initial','basket_selected','personalization','finalization','delivery','post_sale')
  and coalesce(config->>'entry_condition','')='';

create or replace function public.agent_workflow_condition_for_packet_v1(p_packet jsonb)
returns text
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  p jsonb:=coalesce(p_packet,'{}'::jsonb);
  awaiting text:=lower(coalesce(p#>>'{sales_state,awaiting}',''));
  order_status text:=lower(coalesce(p#>>'{order,status}',''));
  cart_exists boolean:=coalesce((p#>>'{cart,exists}')::boolean,false);
  basket_active boolean:=coalesce((p#>>'{pre_router_state,basket_session_active}')::boolean,false);
  order_confirmed boolean:=coalesce((p#>>'{order,commercial_commitment_exists}')::boolean,false)
    or coalesce((p#>>'{order,confirmed}')::boolean,false);
  delivered boolean:=coalesce((p#>>'{order,delivered}')::boolean,false)
    or order_status in ('delivered','completed','concluido','entregue');
begin
  if awaiting ~ '(post_storefront|personal|extra|swap|replacement|custom)' then
    return 'personalization';
  end if;
  if awaiting ~ '(customer|address|payment|final_confirmation|checkout|delivery_locator)' then
    return 'finalization';
  end if;
  if cart_exists or basket_active then
    if coalesce(p#>>'{cart,basket_id}','')<>'' or basket_active then
      return 'basket_selected';
    end if;
    return 'finalization';
  end if;
  if delivered then return 'post_sale'; end if;
  if order_confirmed then return 'delivery'; end if;
  return 'initial';
end;
$$;

create or replace function public.ensure_agent_workflow_entry_v1(p_condition text)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_condition text:=lower(trim(coalesce(p_condition,'')));
begin
  if v_condition not in ('initial','basket_selected','personalization','finalization','delivery','post_sale') then
    return;
  end if;

  if exists(
    select 1 from public.agent_workflow_stages s
    where s.enabled
      and coalesce(s.config->>'entry_condition',s.stage_key)=v_condition
      and coalesce(s.config->>'is_entry','false')='true'
  ) then
    return;
  end if;

  update public.agent_workflow_stages
     set config=jsonb_set(coalesce(config,'{}'::jsonb),'{is_entry}','true'::jsonb,true),
         updated_at=now()
   where stage_key=v_condition and enabled;

  if not found then
    update public.agent_workflow_stages s
       set config=jsonb_set(coalesce(s.config,'{}'::jsonb),'{is_entry}','true'::jsonb,true),
           updated_at=now()
     where s.stage_key=(
       select x.stage_key
       from public.agent_workflow_stages x
       where x.enabled and coalesce(x.config->>'entry_condition',x.stage_key)=v_condition
       order by x.position,x.updated_at desc
       limit 1
     );
  end if;
end;
$$;

create or replace function public.resolve_agent_workflow_stage_v2(p_packet jsonb)
returns text
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_packet jsonb:=coalesce(p_packet,'{}'::jsonb);
  v_condition text;
  v_conversation_stage text:=lower(coalesce(v_packet#>>'{conversation,stage}',''));
  v_stage text;
begin
  -- If another deterministic subsystem already placed the conversation in an
  -- exact workflow block, respect it.
  select s.stage_key into v_stage
  from public.agent_workflow_stages s
  where s.enabled and s.stage_key=v_conversation_stage
  limit 1;
  if v_stage is not null then return v_stage; end if;

  v_condition:=public.agent_workflow_condition_for_packet_v1(v_packet);

  select s.stage_key into v_stage
  from public.agent_workflow_stages s
  where s.enabled
    and coalesce(s.config->>'entry_condition',s.stage_key)=v_condition
    and coalesce(s.config->>'is_entry','false')='true'
  order by s.position,s.updated_at desc
  limit 1;

  if v_stage is not null then return v_stage; end if;

  select s.stage_key into v_stage
  from public.agent_workflow_stages s
  where s.enabled and s.stage_key=v_condition
  limit 1;
  if v_stage is not null then return v_stage; end if;

  select s.stage_key into v_stage
  from public.agent_workflow_stages s
  where s.enabled and coalesce(s.config->>'entry_condition',s.stage_key)=v_condition
  order by s.position,s.updated_at desc
  limit 1;

  return coalesce(v_stage,'initial');
end;
$$;

create or replace function public.get_agent_workflow_policy_v1(p_packet jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  s public.agent_workflow_stages%rowtype;
  cfg public.agent_workflow_settings%rowtype;
  k text;
begin
  select * into cfg from public.agent_workflow_settings where id=1;
  if not found or not cfg.enabled then
    return jsonb_build_object('enabled',false,'stage_key',null,'allowed_tools','[]'::jsonb);
  end if;

  k:=public.resolve_agent_workflow_stage_v2(p_packet);
  select * into s from public.agent_workflow_stages where stage_key=k and enabled;
  if not found then
    return jsonb_build_object('enabled',false,'stage_key',k,'allowed_tools','[]'::jsonb);
  end if;

  return jsonb_build_object(
    'enabled',true,
    'version',cfg.version,
    'stage_key',s.stage_key,
    'name',s.name,
    'entry_condition',coalesce(s.config->>'entry_condition',s.stage_key),
    'autonomous',s.autonomous,
    'instructions',s.instructions,
    'allowed_tools',to_jsonb(s.allowed_tools),
    'next_stages',to_jsonb(s.next_stages),
    'max_offers',s.max_offers,
    'human_on_unknown',s.human_on_unknown,
    'config',s.config
  );
end;
$$;

create or replace function public.create_agent_workflow_stage_v2(
  p_name text,
  p_entry_condition text,
  p_instructions text default ''
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid:=auth.uid();
  role_name text;
  v_condition text:=lower(trim(coalesce(p_entry_condition,'')));
  v_key text;
  template public.agent_workflow_stages%rowtype;
  created public.agent_workflow_stages%rowtype;
  v_position integer;
begin
  select role into role_name from public.admin_users where user_id=uid and is_active limit 1;
  if role_name not in ('owner','operator') then raise exception 'admin_write_not_authorized'; end if;
  if v_condition not in ('initial','basket_selected','personalization','finalization','delivery','post_sale') then
    raise exception 'invalid_entry_condition';
  end if;

  select * into template
  from public.agent_workflow_stages s
  where s.enabled
    and coalesce(s.config->>'entry_condition',s.stage_key)=v_condition
    and coalesce(s.config->>'is_entry','false')='true'
  order by s.position
  limit 1;

  select coalesce(max(position),0)+10 into v_position from public.agent_workflow_stages;
  v_key:='custom_'||replace(substr(gen_random_uuid()::text,1,8),'-','');

  insert into public.agent_workflow_stages(
    stage_key,name,position,enabled,autonomous,instructions,allowed_tools,next_stages,
    max_offers,human_on_unknown,config,updated_at,updated_by
  ) values (
    v_key,
    left(coalesce(nullif(trim(p_name),''),'Nova etapa'),120),
    v_position,
    true,
    coalesce(template.autonomous,true),
    left(coalesce(nullif(trim(p_instructions),''),template.instructions,''),4000),
    coalesce(template.allowed_tools,'{}'),
    coalesce(template.next_stages,'{}'),
    coalesce(template.max_offers,0),
    coalesce(template.human_on_unknown,false),
    jsonb_build_object(
      'entry_condition',v_condition,
      'is_entry',false,
      'system_stage',false,
      'node_kind','ai',
      'draft',true
    ),
    now(),uid
  ) returning * into created;

  update public.agent_workflow_settings
     set version=version+1,updated_at=now(),updated_by=uid
   where id=1;

  return jsonb_build_object('ok',true,'stage',to_jsonb(created));
end;
$$;

create or replace function public.save_agent_workflow_stage_v2(
  p_stage_key text,
  p_name text,
  p_instructions text,
  p_allowed_tools text[],
  p_next_stages text[],
  p_enabled boolean,
  p_autonomous boolean,
  p_max_offers integer,
  p_human_on_unknown boolean,
  p_entry_condition text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid:=auth.uid();
  role_name text;
  bad_tool text;
  bad_stage text;
  before_row public.agent_workflow_stages%rowtype;
  r public.agent_workflow_stages%rowtype;
  v_condition text:=lower(trim(coalesce(p_entry_condition,'')));
  v_was_entry boolean:=false;
  v_old_condition text;
begin
  select role into role_name from public.admin_users where user_id=uid and is_active limit 1;
  if role_name not in ('owner','operator') then raise exception 'admin_write_not_authorized'; end if;

  select * into before_row from public.agent_workflow_stages where stage_key=p_stage_key;
  if not found then raise exception 'stage_not_found'; end if;

  if v_condition not in ('initial','basket_selected','personalization','finalization','delivery','post_sale') then
    raise exception 'invalid_entry_condition';
  end if;

  select x into bad_tool
  from unnest(coalesce(p_allowed_tools,'{}')) x
  where not exists(select 1 from public.ai_action_registry a where a.action_key=x and a.enabled)
  limit 1;
  if bad_tool is not null then raise exception 'invalid_tool:%',bad_tool; end if;

  select x into bad_stage
  from unnest(coalesce(p_next_stages,'{}')) x
  where not exists(select 1 from public.agent_workflow_stages s where s.stage_key=x)
  limit 1;
  if bad_stage is not null then raise exception 'invalid_next_stage:%',bad_stage; end if;

  v_old_condition:=coalesce(before_row.config->>'entry_condition',before_row.stage_key);
  v_was_entry:=coalesce(before_row.config->>'is_entry','false')='true';

  update public.agent_workflow_stages
  set name=left(trim(coalesce(p_name,name)),120),
      instructions=left(trim(coalesce(p_instructions,'')),4000),
      allowed_tools=coalesce(p_allowed_tools,'{}'),
      next_stages=coalesce(p_next_stages,'{}'),
      enabled=coalesce(p_enabled,true),
      autonomous=coalesce(p_autonomous,true),
      max_offers=greatest(0,least(5,coalesce(p_max_offers,0))),
      human_on_unknown=coalesce(p_human_on_unknown,false),
      config=jsonb_set(
        jsonb_set(coalesce(config,'{}'::jsonb),'{entry_condition}',to_jsonb(v_condition),true),
        '{node_kind}',
        '"ai"'::jsonb,
        true
      ),
      updated_at=now(),updated_by=uid
  where stage_key=p_stage_key
  returning * into r;

  -- Changing the moment or disabling an active entry must not leave the old
  -- operational moment without a valid runtime block.
  if v_was_entry and (v_old_condition<>v_condition or not r.enabled) then
    update public.agent_workflow_stages
       set config=jsonb_set(coalesce(config,'{}'::jsonb),'{is_entry}','false'::jsonb,true)
     where stage_key=p_stage_key;
    perform public.ensure_agent_workflow_entry_v1(v_old_condition);
    select * into r from public.agent_workflow_stages where stage_key=p_stage_key;
  end if;

  update public.agent_workflow_settings
     set version=version+1,updated_at=now(),updated_by=uid
   where id=1;

  return jsonb_build_object('ok',true,'stage',to_jsonb(r));
end;
$$;

create or replace function public.activate_agent_workflow_stage_v1(p_stage_key text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid:=auth.uid();
  role_name text;
  r public.agent_workflow_stages%rowtype;
  v_condition text;
begin
  select role into role_name from public.admin_users where user_id=uid and is_active limit 1;
  if role_name not in ('owner','operator') then raise exception 'admin_write_not_authorized'; end if;

  select * into r from public.agent_workflow_stages where stage_key=p_stage_key;
  if not found then raise exception 'stage_not_found'; end if;
  v_condition:=coalesce(r.config->>'entry_condition',r.stage_key);
  if v_condition not in ('initial','basket_selected','personalization','finalization','delivery','post_sale') then
    raise exception 'invalid_entry_condition';
  end if;

  update public.agent_workflow_stages s
     set config=jsonb_set(coalesce(s.config,'{}'::jsonb),'{is_entry}','false'::jsonb,true),
         updated_at=now(),updated_by=uid
   where coalesce(s.config->>'entry_condition',s.stage_key)=v_condition
     and coalesce(s.config->>'is_entry','false')='true';

  update public.agent_workflow_stages
     set enabled=true,
         config=jsonb_set(
           jsonb_set(coalesce(config,'{}'::jsonb),'{is_entry}','true'::jsonb,true),
           '{draft}','false'::jsonb,true
         ),
         updated_at=now(),updated_by=uid
   where stage_key=p_stage_key
   returning * into r;

  update public.agent_workflow_settings
     set version=version+1,updated_at=now(),updated_by=uid
   where id=1;

  return jsonb_build_object('ok',true,'stage',to_jsonb(r),'entry_condition',v_condition);
end;
$$;

create or replace function public.delete_agent_workflow_stage_v1(p_stage_key text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid:=auth.uid();
  role_name text;
  r public.agent_workflow_stages%rowtype;
  v_condition text;
  v_was_entry boolean;
begin
  select role into role_name from public.admin_users where user_id=uid and is_active limit 1;
  if role_name not in ('owner','operator') then raise exception 'admin_write_not_authorized'; end if;

  select * into r from public.agent_workflow_stages where stage_key=p_stage_key;
  if not found then raise exception 'stage_not_found'; end if;
  if coalesce(r.config->>'system_stage','false')='true' then raise exception 'system_stage_cannot_be_deleted'; end if;

  v_condition:=coalesce(r.config->>'entry_condition',r.stage_key);
  v_was_entry:=coalesce(r.config->>'is_entry','false')='true';

  update public.agent_workflow_stages
     set next_stages=array_remove(next_stages,p_stage_key),updated_at=now(),updated_by=uid
   where p_stage_key=any(next_stages);

  delete from public.agent_workflow_stages where stage_key=p_stage_key;
  if v_was_entry then perform public.ensure_agent_workflow_entry_v1(v_condition); end if;

  update public.agent_workflow_settings
     set version=version+1,updated_at=now(),updated_by=uid
   where id=1;

  return jsonb_build_object('ok',true,'deleted',p_stage_key);
end;
$$;

create or replace function public.get_agent_workflow_admin_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  uid uuid:=auth.uid();
  role_name text;
  out_stages jsonb;
  out_tools jsonb;
  cfg public.agent_workflow_settings%rowtype;
  conditions jsonb:=jsonb_build_array(
    jsonb_build_object('key','initial','label','Atendimento inicial','help','Quando o cliente inicia uma conversa ou ainda não começou uma compra.'),
    jsonb_build_object('key','basket_selected','label','Cesta escolhida','help','Depois que o cliente escolheu uma cesta e antes de decidir padrão ou personalização.'),
    jsonb_build_object('key','personalization','label','Personalização','help','Enquanto personaliza ou quando volta do site com a cesta alterada.'),
    jsonb_build_object('key','finalization','label','Finalização','help','Cadastro, endereço, pagamento, resumo e confirmação.'),
    jsonb_build_object('key','delivery','label','Pedido confirmado / entrega','help','Depois da confirmação e durante separação/entrega.'),
    jsonb_build_object('key','post_sale','label','Pós-venda','help','Depois da entrega: suporte, avaliação e recompra.')
  );
begin
  select role into role_name from public.admin_users where user_id=uid and is_active limit 1;
  if role_name is null then raise exception 'admin_not_authorized'; end if;

  select * into cfg from public.agent_workflow_settings where id=1;
  select coalesce(jsonb_agg(to_jsonb(s) order by s.position),'[]'::jsonb)
    into out_stages
  from public.agent_workflow_stages s;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'action_key',a.action_key,
        'display_name',a.display_name,
        'description',a.description,
        'category',a.category,
        'risk_class',a.risk_class,
        'confirmation_required',a.confirmation_required,
        'cost_class',a.cost_class,
        'execution_mode',a.execution_mode
      ) order by a.category,a.display_name,a.action_key
    ),
    '[]'::jsonb
  ) into out_tools
  from public.ai_action_registry a
  where a.enabled;

  return jsonb_build_object(
    'ok',true,
    'role',role_name,
    'settings',to_jsonb(cfg),
    'stages',out_stages,
    'tools',out_tools,
    'entry_conditions',conditions
  );
end;
$$;

revoke all on function public.create_agent_workflow_stage_v2(text,text,text) from public,anon;
revoke all on function public.save_agent_workflow_stage_v2(text,text,text,text[],text[],boolean,boolean,integer,boolean,text) from public,anon;
revoke all on function public.activate_agent_workflow_stage_v1(text) from public,anon;
revoke all on function public.delete_agent_workflow_stage_v1(text) from public,anon;
revoke all on function public.get_agent_workflow_admin_v1() from public,anon;

grant execute on function public.create_agent_workflow_stage_v2(text,text,text) to authenticated,service_role;
grant execute on function public.save_agent_workflow_stage_v2(text,text,text,text[],text[],boolean,boolean,integer,boolean,text) to authenticated,service_role;
grant execute on function public.activate_agent_workflow_stage_v1(text) to authenticated,service_role;
grant execute on function public.delete_agent_workflow_stage_v1(text) to authenticated,service_role;
grant execute on function public.get_agent_workflow_admin_v1() to authenticated,service_role;
grant execute on function public.resolve_agent_workflow_stage_v2(jsonb) to service_role;
grant execute on function public.agent_workflow_condition_for_packet_v1(jsonb) to service_role;

commit;
