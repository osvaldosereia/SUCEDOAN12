begin;

create or replace function public.ops2_admin_attendance_marketing_optout_v1(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_changed boolean := false;
begin
  if p_conversation_id is null then
    return jsonb_build_object('ok',false,'error','invalid_conversation_id');
  end if;

  select c.customer_id
    into v_customer_id
  from public.conversations c
  where c.id = p_conversation_id
  limit 1;

  if not found then
    return jsonb_build_object('ok',false,'error','conversation_not_found');
  end if;

  if v_customer_id is null then
    return jsonb_build_object('ok',false,'error','customer_not_linked');
  end if;

  update public.customers
     set marketing_opt_in = false,
         marketing_consent_updated_at = now()
   where id = v_customer_id
     and coalesce(marketing_opt_in,false) is distinct from false;

  v_changed := found;

  perform public.marketing_repurchase_recalc_v1(v_customer_id);

  return jsonb_build_object(
    'ok',true,
    'customer_id',v_customer_id,
    'marketing_opt_in',false,
    'changed',v_changed
  );
end;
$$;

revoke all on function public.ops2_admin_attendance_marketing_optout_v1(uuid) from public, anon, authenticated;
grant execute on function public.ops2_admin_attendance_marketing_optout_v1(uuid) to service_role;

commit;
