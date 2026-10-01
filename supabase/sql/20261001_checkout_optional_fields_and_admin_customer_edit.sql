-- 2026-10-01
-- Hotfix: permitir salvar cliente no Vitrine Admin e não bloquear checkout por dados cadastrais ausentes.

alter table public.customer_phones
  drop constraint if exists customer_phones_source_check;

alter table public.customer_phones
  add constraint customer_phones_source_check
  check (source = any (array[
    'whatsapp'::text,
    'bling'::text,
    'manual'::text,
    'import'::text,
    'papoai_flow'::text,
    'vitrine_admin'::text
  ]));

alter table public.orders
  drop constraint if exists orders_site_customer_required_after_identity_cutover;

create or replace function public.ops2_orders_ensure_site_customer_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_name text;
  v_identity jsonb;
  v_customer_id uuid;
  v_phone text;
begin
  if new.source not in ('vitrine','storefront_v2') then
    return new;
  end if;

  v_name:=nullif(btrim(coalesce(
    new.customer_snapshot->>'name',
    new.customer_snapshot->>'display_name',
    new.delivery_address->>'customer_name',
    new.checkout_snapshot#>>'{customer,display_name}'
  )), '');

  -- O vínculo continua sendo tentado quando houver telefone, mas a ausência
  -- de telefone/nome não pode impedir a criação do pedido.
  if new.customer_id is null
     and nullif(btrim(coalesce(new.phone_e164,'')),'') is not null
  then
    v_identity:=public.ensure_storefront_customer_v2(
      new.phone_e164,
      v_name,
      coalesce(new.order_number,new.id::text)
    );

    if coalesce((v_identity->>'ok')::boolean,false) is true then
      v_customer_id:=(v_identity->>'customer_id')::uuid;
      v_phone:=v_identity->>'canonical_phone_e164';
      new.customer_id:=v_customer_id;
      new.phone_e164:=coalesce(v_phone,new.phone_e164);
      new.customer_snapshot:=coalesce(new.customer_snapshot,'{}'::jsonb)
        || jsonb_strip_nulls(jsonb_build_object(
          'customer_id',v_customer_id,
          'phone_e164',coalesce(v_phone,new.phone_e164),
          'identity_status',v_identity->>'status'
        ));
      new.delivery_address:=coalesce(new.delivery_address,'{}'::jsonb)
        || jsonb_build_object('source_customer_id',v_customer_id);
    end if;
  end if;

  return new;
end;
$function$;

-- As engines de pedido continuam rejeitando uma forma de pagamento inválida
-- quando preenchida, mas aceitam pagamento em branco.
do $do$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  foreach v_oid in array array[
    'public.create_vitrine_cart_order_v1(text,text,jsonb,jsonb,jsonb)'::regprocedure::oid,
    'public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb)'::regprocedure::oid
  ] loop
    select pg_get_functiondef(v_oid) into v_def;
    v_new:=replace(
      v_def,
      '  if v_payment_code is null then raise exception ''invalid_payment''; end if;',
      '  if v_payment_label<>'''' and v_payment_code is null then raise exception ''invalid_payment''; end if;'
    );
    if v_new<>v_def then
      execute v_new;
    end if;
  end loop;
end
$do$;

-- Telefone vazio deve permanecer NULL; só normalizamos quando o cliente
-- realmente informou um telefone.
do $do$
declare
  v_oid oid;
  v_def text;
  v_new text;
  v_replacement text;
begin
  v_replacement := '  if nullif(btrim(coalesce(p_phone,'''')),'''') is null then' || chr(10)
    || '    v_phone:=null;' || chr(10)
    || '  else' || chr(10)
    || '    v_phone:=public.normalize_storefront_phone_v2(p_phone);' || chr(10)
    || '  end if;';

  foreach v_oid in array array[
    'public.create_vitrine_cart_order_v1(text,text,jsonb,jsonb,jsonb)'::regprocedure::oid,
    'public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb)'::regprocedure::oid
  ] loop
    select pg_get_functiondef(v_oid) into v_def;
    v_new:=replace(
      v_def,
      '  v_phone:=public.normalize_storefront_phone_v2(p_phone);',
      v_replacement
    );
    if v_new<>v_def then
      execute v_new;
    end if;
  end loop;
end
$do$;
