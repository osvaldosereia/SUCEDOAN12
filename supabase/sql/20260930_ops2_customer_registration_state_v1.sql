-- Dona Antonia Operations 2.0
-- PapoAI Phase 1: canonical derived customer registration/readiness contract.
-- Read-only: this file defines functions and permissions only.

create or replace function public.ops2_customer_registration_state_v1(p_customer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_customer public.customers%rowtype;
  v_phone text;
  v_name_ok boolean:=false;
  v_phone_ok boolean:=false;
  v_document_ok boolean:=false;
  v_has_address boolean:=false;
  v_has_city boolean:=false;
  v_has_usable_address boolean:=false;
  v_identity_ready boolean:=false;
  v_registration_complete boolean:=false;
  v_already_linked_bling boolean:=false;
  v_bling_ready boolean:=false;
  v_missing text[]:=array[]::text[];
begin
  select c.* into v_customer
  from public.customers c
  where c.id=p_customer_id;

  if not found then
    return jsonb_build_object(
      'ok',false,
      'error','customer_not_found',
      'customer_id',p_customer_id,
      'identity_ready',false,
      'registration_complete',false,
      'bling_ready',false,
      'already_linked_bling',false,
      'missing_fields',to_jsonb(array['name','phone','document','address','city']::text[])
    );
  end if;

  v_name_ok:=nullif(btrim(coalesce(v_customer.name,'')),'') is not null;
  v_phone:=public.canonical_whatsapp_e164_br_v2(v_customer.primary_whatsapp_e164);
  v_phone_ok:=v_phone is not null;
  v_document_ok:=public.ops2_valid_cpf_cnpj_v1(v_customer.cpf_cnpj);

  select
    coalesce(bool_or(nullif(btrim(coalesce(a.street,'')),'') is not null),false),
    coalesce(bool_or(nullif(btrim(coalesce(a.city,'')),'') is not null),false),
    coalesce(bool_or(
      nullif(btrim(coalesce(a.street,'')),'') is not null
      and nullif(btrim(coalesce(a.city,'')),'') is not null
    ),false)
  into v_has_address,v_has_city,v_has_usable_address
  from public.customer_addresses a
  where a.customer_id=p_customer_id
    and a.is_active=true;

  v_identity_ready:=v_name_ok and v_phone_ok;
  v_registration_complete:=v_identity_ready and v_document_ok and v_has_usable_address;
  v_already_linked_bling:=coalesce(v_customer.bling_contact_id,0)>0;
  v_bling_ready:=v_already_linked_bling or v_registration_complete;

  if not v_name_ok then v_missing:=array_append(v_missing,'name'); end if;
  if not v_phone_ok then v_missing:=array_append(v_missing,'phone'); end if;
  if not v_document_ok then v_missing:=array_append(v_missing,'document'); end if;
  if not v_has_address then v_missing:=array_append(v_missing,'address'); end if;
  if not v_has_city then v_missing:=array_append(v_missing,'city'); end if;

  return jsonb_build_object(
    'ok',true,
    'customer_id',p_customer_id,
    'identity_ready',v_identity_ready,
    'registration_complete',v_registration_complete,
    'bling_ready',v_bling_ready,
    'already_linked_bling',v_already_linked_bling,
    'missing_fields',to_jsonb(v_missing)
  );
end;
$$;

revoke all on function public.ops2_customer_registration_state_v1(uuid) from public,anon,authenticated;
grant execute on function public.ops2_customer_registration_state_v1(uuid) to service_role;
