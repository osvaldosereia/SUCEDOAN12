begin;

alter table public.automation_config
  add column if not exists whatsapp_flow_commercial_write_enabled boolean not null default false;

create table if not exists public.whatsapp_flow_write_operations (
  operation_key text primary key,
  session_id uuid not null references public.experience_sessions(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  operation_type text not null,
  request_fingerprint text not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint whatsapp_flow_write_operation_key_check check (operation_key ~ '^[A-Za-z0-9:_-]{8,180}$'),
  constraint whatsapp_flow_write_operation_type_check check (operation_type in ('start_basket','apply_basket_selection','set_addon','set_upsell')),
  constraint whatsapp_flow_write_request_fingerprint_check check (request_fingerprint ~ '^[0-9a-f]{64}$')
);

alter table public.whatsapp_flow_write_operations enable row level security;
revoke all on table public.whatsapp_flow_write_operations from public,anon,authenticated;
grant select,insert on table public.whatsapp_flow_write_operations to service_role;
create index if not exists idx_whatsapp_flow_write_operations_session_created on public.whatsapp_flow_write_operations(session_id,created_at desc);

create or replace function public.apply_whatsapp_flow_commercial_write_v1(
  p_session_id uuid,
  p_expected_state_version integer,
  p_operation_key text,
  p_operation_type text,
  p_data jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $flow$
declare
  a public.automation_config%rowtype;
  s public.experience_sessions%rowtype;
  c public.conversations%rowtype;
  v_key text:=trim(coalesce(p_operation_key,''));
  v_type text:=lower(trim(coalesce(p_operation_type,'')));
  v_fp text;
  v_existing public.whatsapp_flow_write_operations%rowtype;
  v_result jsonb;
  v_cart jsonb;
  v_cart_id uuid;
  v_basket_id uuid;
  v_product_id uuid;
  v_quantity numeric;
  v_selection jsonb;
  v_validated jsonb;
  x jsonb;
begin
  select * into a from public.automation_config where id=1;
  if not coalesce(a.whatsapp_flow_commercial_write_enabled,false) then raise exception 'whatsapp_flow_commercial_write_disabled'; end if;
  if not a.experience_orchestrator_enabled then raise exception 'experience_orchestrator_disabled'; end if;
  if not a.whatsapp_flow_data_exchange_enabled then raise exception 'whatsapp_flow_data_exchange_disabled'; end if;
  if not a.whatsapp_flow_send_enabled then raise exception 'whatsapp_flow_send_disabled'; end if;

  if v_key !~ '^[A-Za-z0-9:_-]{8,180}$' then raise exception 'invalid_operation_key'; end if;
  if v_type not in ('start_basket','apply_basket_selection','set_addon','set_upsell') then raise exception 'invalid_operation_type'; end if;
  v_fp:=encode(extensions.digest(convert_to(v_type||':'||coalesce(p_data,'{}'::jsonb)::text,'UTF8'),'sha256'),'hex');

  select * into v_existing from public.whatsapp_flow_write_operations where operation_key=v_key;
  if found then
    if v_existing.session_id is distinct from p_session_id or v_existing.operation_type<>v_type or v_existing.request_fingerprint<>v_fp then raise exception 'flow_write_idempotency_conflict'; end if;
    return v_existing.result || jsonb_build_object('idempotent_replay',true);
  end if;

  select * into s from public.experience_sessions where id=p_session_id for update;
  if not found then raise exception 'experience_session_not_found'; end if;
  if s.status not in ('offered','open') or s.expires_at<=now() then raise exception 'experience_session_inactive'; end if;
  if s.flow_state_version is distinct from p_expected_state_version then raise exception 'flow_state_version_conflict'; end if;
  select * into c from public.conversations where id=s.conversation_id for update;
  if not found then raise exception 'conversation_not_found'; end if;
  if c.human_required or c.mode='human' then raise exception 'conversation_requires_human'; end if;

  if v_type='start_basket' then
    begin v_basket_id:=(p_data->>'basket_id')::uuid; exception when others then raise exception 'invalid_basket_id'; end;
    v_result:=public.start_basket_cart(c.id,v_basket_id);
  elsif v_type='apply_basket_selection' then
    select (coalesce(s.context->>'basket_id',''))::uuid into v_basket_id;
    v_selection:=coalesce(p_data->'selection','[]'::jsonb);
    v_validated:=public.validate_basket_flow_selection_v1(v_basket_id,v_selection);
    if not coalesce((v_validated->>'valid')::boolean,false) then raise exception 'basket_selection_invalid'; end if;
    v_cart:=public.get_whatsapp_sales_cart_v1(c.id);
    if not coalesce((v_cart->>'exists')::boolean,false) or coalesce(v_cart->>'basket_id','')<>v_basket_id::text then raise exception 'basket_cart_not_started'; end if;
    v_cart_id:=(v_cart->>'cart_id')::uuid;
    for x in select value from jsonb_array_elements(v_validated->'normalized') loop
      perform public.set_basket_cart_item_quantity(v_cart_id,(x->>'product_id')::uuid,(x->>'quantity')::numeric);
    end loop;
    v_result:=public.get_whatsapp_sales_cart_v1(c.id) || jsonb_build_object('selection',v_validated->'normalized');
  elsif v_type in ('set_addon','set_upsell') then
    begin v_product_id:=(p_data->>'product_id')::uuid; exception when others then raise exception 'invalid_product_id'; end;
    begin v_quantity:=(p_data->>'quantity')::numeric; exception when others then raise exception 'invalid_quantity'; end;
    if v_quantity<0 or v_quantity>99 then raise exception 'invalid_quantity'; end if;
    v_cart:=public.get_whatsapp_sales_cart_v1(c.id);
    if not coalesce((v_cart->>'exists')::boolean,false) then raise exception 'cart_not_started'; end if;
    v_cart_id:=(v_cart->>'cart_id')::uuid;
    v_result:=public.set_cart_addon_quantity(v_cart_id,v_product_id,v_quantity);
  end if;

  insert into public.whatsapp_flow_write_operations(operation_key,session_id,conversation_id,operation_type,request_fingerprint,result)
  values(v_key,s.id,c.id,v_type,v_fp,coalesce(v_result,'{}'::jsonb));

  return coalesce(v_result,'{}'::jsonb) || jsonb_build_object('idempotent_replay',false);
end;
$flow$;

revoke all on function public.apply_whatsapp_flow_commercial_write_v1(uuid,integer,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.apply_whatsapp_flow_commercial_write_v1(uuid,integer,text,text,jsonb) to service_role;

update public.automation_config set whatsapp_flow_commercial_write_enabled=false,experience_orchestrator_enabled=false,whatsapp_flow_data_exchange_enabled=false,whatsapp_flow_send_enabled=false,bling_order_sync_enabled=false,updated_at=now() where id=1;

commit;