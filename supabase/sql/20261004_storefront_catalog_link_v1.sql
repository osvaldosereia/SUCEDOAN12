begin;

create or replace function public.ops2_issue_storefront_catalog_link_v1(
  p_phone text,
  p_conversation_id uuid default null,
  p_source_event_key text default null,
  p_source text default 'attendance',
  p_ttl_minutes integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions'
as $function$
declare
  v_phone text;
  v_digits text;
  v_customer_id uuid;
  v_conv public.conversations%rowtype;
  v_existing public.storefront_identity_tokens%rowtype;
  v_code text;
  v_hash text;
  v_exp timestamptz;
  v_try integer:=0;
  v_source text:=lower(coalesce(nullif(btrim(p_source),''),'attendance'));
  v_ttl integer:=greatest(5,least(coalesce(p_ttl_minutes,120),1440));
begin
  if v_source !~ '^[a-z0-9_-]{2,40}$' then raise exception 'invalid_catalog_link_source'; end if;

  v_phone:=public.normalize_storefront_phone_v2(p_phone);
  v_digits:=regexp_replace(coalesce(v_phone,''),'\D','','g');
  if length(v_digits)<10 then raise exception 'invalid_phone'; end if;

  if p_conversation_id is not null then
    select * into v_conv from public.conversations where id=p_conversation_id;
    if not found then raise exception 'conversation_not_found'; end if;
    if regexp_replace(coalesce(v_conv.wa_contact_e164,''),'\D','','g')<>v_digits then
      raise exception 'conversation_phone_mismatch';
    end if;
  end if;

  select c.id into v_customer_id
  from public.customers c
  where regexp_replace(coalesce(c.primary_whatsapp_e164,''),'\D','','g')=v_digits
  limit 1;

  if v_customer_id is null then
    select cp.customer_id into v_customer_id
    from public.customer_phones cp
    where regexp_replace(coalesce(cp.phone_e164,''),'\D','','g')=v_digits
    order by cp.is_primary desc,cp.created_at asc
    limit 1;
  end if;

  if p_conversation_id is not null and v_conv.customer_id is not null then
    if v_customer_id is not null and v_customer_id<>v_conv.customer_id then
      raise exception 'conversation_customer_conflict';
    end if;
    v_customer_id:=v_conv.customer_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ops2:storefront:identity:'||v_digits,0));

  select * into v_existing
  from public.storefront_identity_tokens t
  where regexp_replace(coalesce(t.phone_e164,''),'\D','','g')=v_digits
    and t.redeemed_at is null
    and t.expires_at>now()
    and (p_conversation_id is null or t.conversation_id=p_conversation_id)
  order by t.created_at desc
  limit 1
  for update;

  if found then
    return jsonb_build_object(
      'ok',true,'reused',true,'token_id',v_existing.id,'short_code',v_existing.short_code,
      'catalog_path','/catalogo_'||v_existing.short_code,
      'expires_at',v_existing.expires_at,'customer_linked',v_existing.customer_id is not null,
      'conversation_linked',v_existing.conversation_id is not null,'source',v_existing.source
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ops2:storefront:identity-code-pool',0));
  v_exp:=now()+make_interval(mins=>v_ttl);

  loop
    v_try:=v_try+1;
    if v_try>60 then raise exception 'identity_code_pool_busy'; end if;
    v_code:=lpad((1000+floor(random()*9000)::integer)::text,4,'0');
    exit when not exists(
      select 1 from public.storefront_identity_tokens
      where short_code=v_code and redeemed_at is null and expires_at>now()
    );
  end loop;

  v_hash:=encode(digest(v_code,'sha256'),'hex');

  insert into public.storefront_identity_tokens(
    token_hash,phone_e164,contact_name,source,expires_at,use_count,short_code,
    conversation_id,customer_id,source_event_key
  ) values(
    v_hash,v_phone,null,v_source,v_exp,0,v_code,
    p_conversation_id,v_customer_id,nullif(left(trim(coalesce(p_source_event_key,'')),220),'')
  )
  returning * into v_existing;

  return jsonb_build_object(
    'ok',true,'reused',false,'token_id',v_existing.id,'short_code',v_code,
    'catalog_path','/catalogo_'||v_code,'expires_at',v_exp,
    'customer_linked',v_customer_id is not null,'conversation_linked',p_conversation_id is not null,
    'source',v_source
  );
end;
$function$;

revoke all on function public.ops2_issue_storefront_catalog_link_v1(text,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.ops2_issue_storefront_catalog_link_v1(text,uuid,text,text,integer) to service_role;

-- Compatibility bridge: the current Attendance Edge still invokes the legacy RPC name.
-- Attendance calls no longer consult the PapoAI runtime; non-Attendance legacy callers retain the old kill-switch/TTL.
create or replace function public.ops2_issue_papoai_catalog_link_v1(
  p_phone text,
  p_conversation_id uuid default null,
  p_source_event_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions'
as $function$
declare
  v_cfg public.ops2_papoai_bridge_runtime_v1%rowtype;
  v_source_event_key text:=left(trim(coalesce(p_source_event_key,'')),220);
begin
  if v_source_event_key like 'attendance:%' then
    return public.ops2_issue_storefront_catalog_link_v1(
      p_phone,p_conversation_id,p_source_event_key,'attendance',120
    );
  end if;

  select * into v_cfg from public.ops2_papoai_bridge_runtime_v1 where id=1;
  if not found or v_cfg.identity_link_enabled is not true then
    raise exception 'papoai_identity_link_disabled';
  end if;

  return public.ops2_issue_storefront_catalog_link_v1(
    p_phone,p_conversation_id,p_source_event_key,'papoai',v_cfg.identity_link_ttl_minutes
  );
end;
$function$;

commit;
