-- Applied to canonical Supabase 20260930022320
-- Dona Antônia Operations 2.0
create or replace function public.ensure_storefront_customer_v2(
  p_phone text,
  p_name text default null,
  p_source_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_phone text:=public.canonical_whatsapp_e164_br_v2(p_phone);
  v_name text:=nullif(left(btrim(regexp_replace(coalesce(p_name,''),'\s+',' ','g')),180),'');
  v_ids uuid[];
  v_name_ids uuid[];
  v_customer_id uuid;
  v_created boolean:=false;
  v_ambiguous boolean:=false;
  v_status text:='verified_existing';
begin
  if v_phone is null then
    return jsonb_build_object('ok',false,'error','invalid_phone');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ops2:customer-phone:'||v_phone,0));

  select array_agg(id order by id) into v_ids
  from (
    select c.id
    from public.customers c
    where public.normalize_phone_digits(c.primary_whatsapp_e164)=public.normalize_phone_digits(v_phone)
    union
    select cp.customer_id
    from public.customer_phones cp
    where public.normalize_phone_digits(cp.phone_e164)=public.normalize_phone_digits(v_phone)
  ) s;

  if coalesce(array_length(v_ids,1),0)=1 then
    v_customer_id:=v_ids[1];
  elsif coalesce(array_length(v_ids,1),0)>1 then
    v_ambiguous:=true;
    if v_name is not null then
      select array_agg(c.id order by c.id) into v_name_ids
      from public.customers c
      where c.id=any(v_ids)
        and lower(btrim(coalesce(c.name,'')))=lower(v_name);
      if coalesce(array_length(v_name_ids,1),0)=1 then
        v_customer_id:=v_name_ids[1];
      end if;
    end if;
  end if;

  if v_customer_id is null then
    select array_agg(id order by id) into v_ids
    from (
      select c.id
      from public.customers c
      where public.normalize_phone_digits(c.primary_whatsapp_e164)=any(public.phone_variants_br(v_phone))
      union
      select cp.customer_id
      from public.customer_phones cp
      where public.normalize_phone_digits(cp.phone_e164)=any(public.phone_variants_br(v_phone))
    ) s;

    if coalesce(array_length(v_ids,1),0)=1 then
      v_customer_id:=v_ids[1];
    elsif coalesce(array_length(v_ids,1),0)>1 then
      v_ambiguous:=true;
      if v_name is not null then
        select array_agg(c.id order by c.id) into v_name_ids
        from public.customers c
        where c.id=any(v_ids)
          and lower(btrim(coalesce(c.name,'')))=lower(v_name);
        if coalesce(array_length(v_name_ids,1),0)=1 then
          v_customer_id:=v_name_ids[1];
        end if;
      end if;
    end if;
  end if;

  if v_customer_id is null then
    begin
      insert into public.customers(name,primary_whatsapp_e164,is_active,created_at,updated_at)
      values(v_name,v_phone,true,now(),now())
      returning id into v_customer_id;
      v_created:=true;
      v_status:='provisional';
    exception when unique_violation then
      select id into v_customer_id
      from public.customers
      where public.normalize_phone_digits(primary_whatsapp_e164)=public.normalize_phone_digits(v_phone)
      limit 1;
      if v_customer_id is null then raise; end if;
      v_created:=false;
      v_status:='verified_existing';
    end;
  else
    update public.customers
       set name=case when nullif(btrim(coalesce(name,'')),'') is null then v_name else name end,
           is_active=true,
           updated_at=now()
     where id=v_customer_id;
  end if;

  if not exists(
    select 1 from public.customer_phones cp
    where public.normalize_phone_digits(cp.phone_e164)=public.normalize_phone_digits(v_phone)
  ) then
    insert into public.customer_phones(customer_id,phone_e164,source,is_primary,verified_at)
    values(v_customer_id,v_phone,'whatsapp',true,case when v_created then null else now() end)
    on conflict(phone_e164) do nothing;
  end if;

  insert into public.customer_identity_profiles_v1(
    customer_id,identity_status,created_from,canonical_phone_e164,last_source_key,metadata,updated_at
  ) values(
    v_customer_id,
    case when v_created then 'provisional' else 'verified_existing' end,
    case when v_created then 'site_checkout' else 'existing' end,
    v_phone,
    nullif(left(coalesce(p_source_key,''),220),''),
    jsonb_build_object('ambiguous_variants_observed',v_ambiguous),
    now()
  )
  on conflict(customer_id) do update set
    canonical_phone_e164=coalesce(public.customer_identity_profiles_v1.canonical_phone_e164,excluded.canonical_phone_e164),
    last_source_key=coalesce(excluded.last_source_key,public.customer_identity_profiles_v1.last_source_key),
    metadata=coalesce(public.customer_identity_profiles_v1.metadata,'{}'::jsonb)
      || jsonb_build_object('ambiguous_variants_observed',
           coalesce((public.customer_identity_profiles_v1.metadata->>'ambiguous_variants_observed')::boolean,false)
           or v_ambiguous),
    updated_at=now();

  select identity_status into v_status
  from public.customer_identity_profiles_v1 where customer_id=v_customer_id;

  return jsonb_build_object(
    'ok',true,'customer_id',v_customer_id,'created',v_created,'status',v_status,
    'canonical_phone_e164',v_phone,'ambiguous_variants_observed',v_ambiguous
  );
end;
$$;
revoke all on function public.ensure_storefront_customer_v2(text,text,text) from public,anon,authenticated;
grant execute on function public.ensure_storefront_customer_v2(text,text,text) to service_role;
