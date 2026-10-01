-- Dona Antônia — cadastro avulso vinculado com segurança ao pedido
-- 2026-10-01

create table if not exists public.ops2_order_registration_links_v1 (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  phone_e164 text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_customer_id uuid references public.customers(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ops2_order_registration_links_v1_order_idx
  on public.ops2_order_registration_links_v1(order_id,created_at desc);
create index if not exists ops2_order_registration_links_v1_active_idx
  on public.ops2_order_registration_links_v1(order_id,expires_at desc)
  where consumed_at is null and revoked_at is null;

alter table public.ops2_order_registration_links_v1 enable row level security;
revoke all on table public.ops2_order_registration_links_v1 from public,anon,authenticated;
grant all on table public.ops2_order_registration_links_v1 to service_role;

create or replace function public.ops2_issue_order_registration_link_v1(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_order public.orders%rowtype;
  v_customer public.customers%rowtype;
  v_phone text;
  v_token text;
  v_hash text;
  v_id uuid;
  v_expires timestamptz:=now()+interval '24 hours';
begin
  if p_order_id is null then
    return jsonb_build_object('ok',false,'error','order_id_required');
  end if;

  select o.* into v_order
  from public.orders o
  where o.id=p_order_id
  for update;
  if not found then
    return jsonb_build_object('ok',false,'error','order_not_found');
  end if;

  if v_order.customer_id is not null then
    select c.* into v_customer from public.customers c where c.id=v_order.customer_id;
  end if;

  v_phone:=public.canonical_whatsapp_e164_br_v2(coalesce(v_order.phone_e164,v_customer.primary_whatsapp_e164));
  if v_phone is null then
    return jsonb_build_object('ok',false,'error','customer_phone_missing');
  end if;

  -- Um novo link invalida capabilities anteriores do mesmo pedido.
  update public.ops2_order_registration_links_v1
     set revoked_at=now(),updated_at=now()
   where order_id=p_order_id
     and consumed_at is null
     and revoked_at is null;

  v_token:=encode(extensions.gen_random_bytes(24),'hex');
  v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');

  insert into public.ops2_order_registration_links_v1(order_id,phone_e164,token_hash,expires_at)
  values(p_order_id,v_phone,v_hash,v_expires)
  returning id into v_id;

  return jsonb_build_object(
    'ok',true,
    'link_id',v_id,
    'token',v_token,
    'phone_e164',v_phone,
    'expires_at',v_expires,
    'registration_url','https://www.donaantonia.com.br/cadastro/?order_token='||v_token
  );
end;
$$;

create or replace function public.ops2_resolve_order_registration_link_v1(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_hash text;
  v_link public.ops2_order_registration_links_v1%rowtype;
begin
  if nullif(btrim(coalesce(p_token,'')),'') is null then
    return jsonb_build_object('ok',false,'error','order_token_required');
  end if;
  v_hash:=encode(extensions.digest(btrim(p_token),'sha256'),'hex');

  select l.* into v_link
  from public.ops2_order_registration_links_v1 l
  where l.token_hash=v_hash;
  if not found then
    return jsonb_build_object('ok',false,'error','order_token_invalid');
  end if;
  if v_link.revoked_at is not null then
    return jsonb_build_object('ok',false,'error','order_token_invalid');
  end if;
  if v_link.consumed_at is not null then
    return jsonb_build_object('ok',false,'error','token_already_used');
  end if;
  if v_link.expires_at<=now() then
    return jsonb_build_object('ok',false,'error','token_expired');
  end if;

  return jsonb_build_object(
    'ok',true,
    'phone_e164',v_link.phone_e164,
    'expires_at',v_link.expires_at
  );
end;
$$;

create or replace function public.ops2_consume_order_registration_link_v1(
  p_token text,
  p_customer_id uuid,
  p_phone text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_hash text;
  v_link public.ops2_order_registration_links_v1%rowtype;
  v_order public.orders%rowtype;
  v_customer public.customers%rowtype;
  v_existing public.customers%rowtype;
  v_phone text;
  v_existing_phone text;
  v_existing_provisional boolean:=false;
begin
  if nullif(btrim(coalesce(p_token,'')),'') is null then
    return jsonb_build_object('ok',false,'error','order_token_required');
  end if;
  if p_customer_id is null then
    return jsonb_build_object('ok',false,'error','customer_id_required');
  end if;

  v_hash:=encode(extensions.digest(btrim(p_token),'sha256'),'hex');
  select l.* into v_link
  from public.ops2_order_registration_links_v1 l
  where l.token_hash=v_hash
  for update;
  if not found or v_link.revoked_at is not null then
    return jsonb_build_object('ok',false,'error','order_token_invalid');
  end if;
  if v_link.consumed_at is not null then
    return jsonb_build_object('ok',false,'error','token_already_used');
  end if;
  if v_link.expires_at<=now() then
    return jsonb_build_object('ok',false,'error','token_expired');
  end if;

  select c.* into v_customer from public.customers c where c.id=p_customer_id;
  if not found then
    return jsonb_build_object('ok',false,'error','customer_not_found');
  end if;

  v_phone:=public.canonical_whatsapp_e164_br_v2(coalesce(p_phone,v_customer.primary_whatsapp_e164));
  if v_phone is null or v_phone<>v_link.phone_e164 then
    return jsonb_build_object('ok',false,'error','phone_mismatch');
  end if;
  if public.canonical_whatsapp_e164_br_v2(v_customer.primary_whatsapp_e164) is distinct from v_link.phone_e164 then
    return jsonb_build_object('ok',false,'error','phone_mismatch');
  end if;

  select o.* into v_order from public.orders o where o.id=v_link.order_id for update;
  if not found then
    return jsonb_build_object('ok',false,'error','order_not_found');
  end if;

  if v_order.customer_id is not null and v_order.customer_id<>p_customer_id then
    select c.* into v_existing from public.customers c where c.id=v_order.customer_id;
    v_existing_phone:=public.canonical_whatsapp_e164_br_v2(v_existing.primary_whatsapp_e164);
    select exists(
      select 1 from public.customer_identity_profiles_v1 ip
      where ip.customer_id=v_order.customer_id and ip.identity_status='provisional'
    ) into v_existing_provisional;

    if v_existing_phone is distinct from v_link.phone_e164
       or nullif(regexp_replace(coalesce(v_existing.cpf_cnpj,''),'[^0-9]','','g'),'') is not null
       or coalesce(v_existing.bling_contact_id,0)<>0
       or v_existing_provisional is not true then
      return jsonb_build_object('ok',false,'error','order_already_linked');
    end if;
  end if;

  update public.orders
     set customer_id=p_customer_id,
         phone_e164=v_link.phone_e164,
         customer_snapshot=coalesce(customer_snapshot,'{}'::jsonb)
           || jsonb_strip_nulls(jsonb_build_object(
                'customer_id',p_customer_id,
                'name',nullif(btrim(v_customer.name),''),
                'phone_e164',v_link.phone_e164,
                'registration_link_consumed_at',now()
              )),
         updated_at=now()
   where id=v_order.id;

  if v_order.conversation_id is not null then
    update public.conversations
       set customer_id=p_customer_id,updated_at=now()
     where id=v_order.conversation_id
       and (customer_id is null or customer_id=v_order.customer_id or customer_id=p_customer_id);
  end if;

  update public.ops2_order_registration_links_v1
     set consumed_at=now(),consumed_customer_id=p_customer_id,updated_at=now()
   where id=v_link.id;

  begin
    perform public.ops2_refresh_customer_registration_journeys_v1(p_customer_id,true);
  exception when undefined_function then
    null;
  end;

  return jsonb_build_object(
    'ok',true,
    'order_id',v_order.id,
    'customer_id',p_customer_id,
    'phone_e164',v_link.phone_e164,
    'linked',true
  );
end;
$$;

revoke all on function public.ops2_issue_order_registration_link_v1(uuid) from public,anon,authenticated;
revoke all on function public.ops2_resolve_order_registration_link_v1(text) from public,anon,authenticated;
revoke all on function public.ops2_consume_order_registration_link_v1(text,uuid,text) from public,anon,authenticated;
grant execute on function public.ops2_issue_order_registration_link_v1(uuid) to service_role;
grant execute on function public.ops2_resolve_order_registration_link_v1(text) to service_role;
grant execute on function public.ops2_consume_order_registration_link_v1(text,uuid,text) to service_role;
