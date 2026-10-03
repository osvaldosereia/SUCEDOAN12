-- 2026-10-03
-- customer_emails.email_normalized é GENERATED ALWAYS; o admin deve gravar somente email.
do $do$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('public.ops2_admin_customer_save_v2(jsonb)'::regprocedure::oid) into v_def;
  v_new:=replace(
    v_def,
    'update public.customer_emails set email=v_email,email_normalized=v_email,is_primary=true,source=''vitrine_admin'',updated_at=now() where id=v_email_row;',
    'update public.customer_emails set email=v_email,is_primary=true,source=''vitrine_admin'',updated_at=now() where id=v_email_row;'
  );
  v_new:=replace(
    v_new,
    'insert into public.customer_emails(customer_id,email,email_normalized,is_primary,source,updated_at)' || chr(10) || '      values(v_id,v_email,v_email,true,''vitrine_admin'',now());',
    'insert into public.customer_emails(customer_id,email,is_primary,source,updated_at)' || chr(10) || '      values(v_id,v_email,true,''vitrine_admin'',now());'
  );
  if v_new=v_def then
    raise exception 'customer_admin_email_patch_not_applied';
  end if;
  execute v_new;
end
$do$;
