begin;

create or replace function public.guard_web_existing_customer_binding_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_customer_created_at timestamptz;
begin
  if old.customer_id is null
     and new.customer_id is not null
     and coalesce(old.metadata->>'entry_channel',new.metadata->>'entry_channel','')='website'
     and nullif(coalesce(new.metadata->>'web_identity_verified_at',''),'') is null
     and nullif(coalesce(new.metadata->>'web_customer_committed_at',''),'') is null then
    select c.created_at into v_customer_created_at
      from public.customers c
     where c.id=new.customer_id;
    if v_customer_created_at is not null and v_customer_created_at < old.created_at then
      raise exception 'customer_verification_required';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_web_existing_customer_binding_v1() from public,anon,authenticated;
grant execute on function public.guard_web_existing_customer_binding_v1() to service_role;

commit;
