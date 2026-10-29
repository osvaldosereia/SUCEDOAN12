-- Exclusão lógica de clientes: preservar pedidos e conversas, liberar identificadores.
create or replace function public.ops2_site_admin_customer_delete_v1(
  p_customer_id uuid, p_expected_customer_updated_at timestamptz
) returns jsonb language plpgsql security invoker
set search_path = pg_catalog, public as $function$
declare
  v_customer public.customers%rowtype;
  v_when timestamptz := clock_timestamp();
begin
  if p_customer_id is null or p_expected_customer_updated_at is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_customer_snapshot');
  end if;
  select * into v_customer from public.customers
  where id=p_customer_id and is_active=true for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'customer_not_found');
  end if;
  if v_customer.updated_at is distinct from p_expected_customer_updated_at then
    return jsonb_build_object('ok', false, 'error', 'customer_changed');
  end if;
  update public.customers set is_active=false,
    cpf_cnpj=null, primary_whatsapp_e164=null,
    marketing_opt_in=false, updated_at=v_when
  where id=p_customer_id;
  delete from public.customer_phones where customer_id=p_customer_id;
  delete from public.customer_emails where customer_id=p_customer_id;
  update public.customer_addresses set is_active=false,
    is_default=false, updated_at=v_when
  where customer_id=p_customer_id and is_active=true;
  update public.customer_identity_profiles_v1
    set canonical_phone_e164=null,updated_at=v_when
  where customer_id=p_customer_id;
  insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,details)
  values(null,'customer_delete_admin_code','customer',p_customer_id::text,
    jsonb_build_object('source','site_admin_code','mode','deactivate_and_release_identifiers',
      'preserves','orders_and_commercial_history'));
  return jsonb_build_object('ok',true,'deleted',true,'customer_id',p_customer_id);
end;
$function$;
revoke all on function public.ops2_site_admin_customer_delete_v1(uuid,timestamptz)
  from public,anon,authenticated;
grant execute on function public.ops2_site_admin_customer_delete_v1(uuid,timestamptz)
  to service_role;
