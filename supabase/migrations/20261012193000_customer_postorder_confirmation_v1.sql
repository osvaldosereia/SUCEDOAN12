-- Separate 256-bit customer action capability: the 16-character public-view token is READ ONLY.
create table if not exists private.order_customer_actions_v1 (
  order_id uuid primary key references public.orders(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  confirmed_total numeric(14,2),
  source text not null default 'whatsapp_order_utility',
  constraint order_customer_actions_expiry_check check (expires_at>issued_at)
);
create index if not exists order_customer_actions_active_v1 on private.order_customer_actions_v1(expires_at) where confirmed_at is null;
alter table private.order_customer_actions_v1 enable row level security;
revoke all on private.order_customer_actions_v1 from public,anon,authenticated;
grant select,insert,update on private.order_customer_actions_v1 to service_role;

create or replace function public.ops3_issue_customer_order_action_v1(p_order_id uuid,p_token_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;
begin
  if p_token_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('ok',false,'error','invalid_token_hash'); end if;
  select * into o from public.orders where id=p_order_id for update;
  if not found then return jsonb_build_object('ok',false,'error','order_not_found'); end if;
  if o.source not in ('vitrine','storefront_v2') or o.status<>'storefront_received' or o.confirmed_at is not null
     or o.cancelled_at is not null then return jsonb_build_object('ok',false,'error','order_not_eligible'); end if;
  insert into private.order_customer_actions_v1(order_id,token_hash,expires_at)
  values(o.id,p_token_hash,now()+interval '7 days')
  on conflict(order_id) do update set token_hash=excluded.token_hash,issued_at=now(),expires_at=excluded.expires_at,
    confirmed_at=null,confirmed_total=null;
  return jsonb_build_object('ok',true,'order_id',o.id);
end;$$;

create or replace function public.ops3_get_customer_order_action_v1(p_token_hash text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a private.order_customer_actions_v1%rowtype; o public.orders%rowtype; v_public text; v_code text;
begin
  if p_token_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('ok',false,'error','invalid_token'); end if;
  select * into a from private.order_customer_actions_v1 where token_hash=p_token_hash;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  select * into o from public.orders where id=a.order_id;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  select public_token,public_code into v_public,v_code from public.order_public_snapshots_v1 where order_id=o.id;
  if v_public is null then return jsonb_build_object('ok',false,'error','snapshot_missing'); end if;
  return jsonb_build_object('ok',true,'order_id',o.id,'public_token',v_public,'public_code',v_code,
    'status',o.status,'total',o.total,'updated_at',o.updated_at,
    'confirmed',o.status='confirmed' and o.confirmed_at is not null,
    'can_confirm',a.expires_at>now() and a.confirmed_at is null and o.status='storefront_received' and o.confirmed_at is null,
    'expires_at',a.expires_at);
end;$$;

create or replace function public.ops3_confirm_customer_order_v1(
  p_token_hash text,p_expected_total numeric,p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.order_customer_actions_v1%rowtype; o public.orders%rowtype;
  d jsonb; stock jsonb; problems text[]:=array[]::text[];
begin
  if p_token_hash !~ '^[a-f0-9]{64}$' or p_expected_total is null or p_expected_updated_at is null
    then return jsonb_build_object('ok',false,'error','invalid_request'); end if;
  select * into a from private.order_customer_actions_v1 where token_hash=p_token_hash for update;
  if not found then return jsonb_build_object('ok',false,'error','invalid_token'); end if;
  select * into o from public.orders where id=a.order_id for update;
  if not found then return jsonb_build_object('ok',false,'error','order_not_found'); end if;
  if a.confirmed_at is not null and o.status='confirmed' then
    return jsonb_build_object('ok',true,'already_confirmed',true,'order_id',o.id,'status','confirmed','total',o.total);
  end if;
  if now()>a.expires_at then return jsonb_build_object('ok',false,'error','session_expired'); end if;
  if o.source not in ('vitrine','storefront_v2') or o.status<>'storefront_received' or o.confirmed_at is not null
     or o.cancelled_at is not null then return jsonb_build_object('ok',false,'error','order_status_closed','status',o.status); end if;
  if o.bling_order_id is not null or o.bling_synced_at is not null or coalesce(o.sync_status,'local')<>'local'
     then return jsonb_build_object('ok',false,'error','bling_sync_started'); end if;
  if exists(select 1 from public.order_separation_assignments_v1 x where x.order_id=o.id)
     or exists(select 1 from public.order_separation_items_v1 x where x.order_id=o.id)
     then return jsonb_build_object('ok',false,'error','separation_started'); end if;
  if o.updated_at<>p_expected_updated_at or round(o.total,2)<>round(p_expected_total,2) then
    return jsonb_build_object('ok',false,'error','order_changed','current_total',o.total,'updated_at',o.updated_at);
  end if;
  d:=coalesce(o.delivery_address,'{}'::jsonb);
  if nullif(btrim(coalesce(d->>'customer_name',d->>'recipient_name','')),'') is null then problems:=array_append(problems,'customer_required'); end if;
  if nullif(btrim(coalesce(d->>'street','')),'') is null then problems:=array_append(problems,'delivery_street_required'); end if;
  if nullif(btrim(coalesce(d->>'number','')),'') is null then problems:=array_append(problems,'delivery_number_required'); end if;
  if nullif(btrim(coalesce(d->>'city','')),'') is null then problems:=array_append(problems,'delivery_city_required'); end if;
  if nullif(btrim(coalesce(d->>'state','')),'') is null then problems:=array_append(problems,'delivery_state_required'); end if;
  if nullif(btrim(coalesce(o.payment_method,'')),'') is null then problems:=array_append(problems,'payment_method_required'); end if;
  if array_length(problems,1)>0 then return jsonb_build_object('ok',false,'error','order_operational_data_incomplete','blockers',to_jsonb(problems)); end if;
  stock:=public.reserve_vitrine_order_stock_v1(o.id);
  if coalesce((stock->>'ok')::boolean,false) is not true then
    raise exception 'customer_confirm_stock_unavailable:%',coalesce(stock->>'error','unknown') using errcode='P0001';
  end if;
  update public.orders set status='confirmed',confirmed_at=now(),updated_at=now() where id=o.id;
  update private.order_customer_actions_v1 set confirmed_at=now(),confirmed_total=o.total where order_id=o.id;
  perform public.ops2_refresh_order_public_snapshot_v1(o.id);
  return jsonb_build_object('ok',true,'order_id',o.id,'status','confirmed','total',o.total,'confirmed_at',now());
end;$$;

revoke all on function public.ops3_issue_customer_order_action_v1(uuid,text) from public,anon,authenticated;
revoke all on function public.ops3_get_customer_order_action_v1(text) from public,anon,authenticated;
revoke all on function public.ops3_confirm_customer_order_v1(text,numeric,timestamptz) from public,anon,authenticated;
grant execute on function public.ops3_issue_customer_order_action_v1(uuid,text) to service_role;
grant execute on function public.ops3_get_customer_order_action_v1(text) to service_role;
grant execute on function public.ops3_confirm_customer_order_v1(text,numeric,timestamptz) to service_role;