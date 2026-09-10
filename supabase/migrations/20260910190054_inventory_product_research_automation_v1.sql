do $$
declare
  v_secret text;
begin
  if not exists(select 1 from vault.decrypted_secrets where name='inventory_product_research_webhook_key_v1') then
    perform vault.create_secret(encode(gen_random_bytes(32),'hex'),'inventory_product_research_webhook_key_v1');
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='inventory_product_research_webhook_key_v1' order by created_at desc limit 1;
  insert into public.system_secrets(key_name,key_hash,is_active,rotated_at)
  values('inventory_product_research_webhook_v1',encode(digest(v_secret,'sha256'),'hex'),true,now())
  on conflict(key_name) do update set key_hash=excluded.key_hash,is_active=true,rotated_at=now();
end $$;

create or replace function public.claim_unresolved_product_eans_v1(p_limit integer default 5)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_result jsonb;
begin
  with picked as (
    select q.id
    from public.unresolved_product_eans q
    where q.research_attempts < 5
      and (
        q.status in ('pending','error')
        or (q.status='researching' and q.last_research_at < now() - interval '30 minutes')
      )
      and (q.last_research_at is null or q.last_research_at < now() - interval '10 minutes')
    order by q.first_seen_at asc
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,5),10))
  ), claimed as (
    update public.unresolved_product_eans q
       set status='researching',
           research_attempts=q.research_attempts+1,
           last_research_at=now(),
           updated_at=now()
      from picked p
     where q.id=p.id
     returning q.id,q.ean,q.scan_count,q.research_attempts,q.first_seen_at,q.last_seen_at
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'ean',ean,'scan_count',scan_count,'research_attempts',research_attempts,
    'first_seen_at',first_seen_at,'last_seen_at',last_seen_at
  ) order by first_seen_at),'[]'::jsonb)
    into v_result
    from claimed;
  return v_result;
end;
$$;

create or replace function public.dispatch_inventory_product_research_v1()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_secret text;
  v_pending bigint:=0;
  v_request bigint;
begin
  select count(*) into v_pending
  from public.unresolved_product_eans
  where research_attempts < 5
    and (
      status in ('pending','error')
      or (status='researching' and last_research_at < now() - interval '30 minutes')
    );
  if v_pending=0 then
    return jsonb_build_object('dispatched',false,'reason','queue_empty');
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='inventory_product_research_webhook_key_v1'
  order by created_at desc limit 1;
  if v_secret is null then
    return jsonb_build_object('dispatched',false,'reason','worker_secret_missing');
  end if;

  v_request:=net.http_post(
    url:='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/inventory-product-research-v1',
    headers:=jsonb_build_object('Content-Type','application/json','x-da-product-research-key',v_secret),
    body:=jsonb_build_object('event','drain','limit',5),
    timeout_milliseconds:=120000
  );
  return jsonb_build_object('dispatched',true,'request_id',v_request,'pending',v_pending);
exception when others then
  return jsonb_build_object('dispatched',false,'reason','dispatch_failed');
end;
$$;

revoke execute on function public.claim_unresolved_product_eans_v1(integer) from public,anon,authenticated;
revoke execute on function public.dispatch_inventory_product_research_v1() from public,anon,authenticated;
grant execute on function public.claim_unresolved_product_eans_v1(integer) to service_role;
grant execute on function public.dispatch_inventory_product_research_v1() to service_role;

do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname='inventory-product-research-v1' limit 1;
  if v_job is not null then perform cron.unschedule(v_job); end if;
  perform cron.schedule('inventory-product-research-v1','*/10 * * * *','select public.dispatch_inventory_product_research_v1();');
end $$;
