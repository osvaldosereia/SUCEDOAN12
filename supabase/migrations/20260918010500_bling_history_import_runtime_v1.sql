begin;

-- Etapa 8 — credenciais server-to-server, staging idempotente e execução rastreável.
-- Segredos nunca são expostos ao navegador. Toda promoção continua separada e OFF.

do $$
begin
  if not exists(select 1 from vault.secrets where name='dona_antonia_bling_history_import_key_v1') then
    perform vault.create_secret(
      encode(gen_random_bytes(32),'hex'),
      'dona_antonia_bling_history_import_key_v1',
      'Chave interna da Edge Function de importacao historica do Bling',
      null
    );
  end if;
end
$$;

create or replace function public.get_bling_history_import_key_v1()
returns text
language sql
stable
security definer
set search_path=''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name='dona_antonia_bling_history_import_key_v1'
  order by updated_at desc
  limit 1
$$;

create or replace function public.get_bling_api_credentials_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'client_id',max(decrypted_secret) filter(where name='bling_api_client_id_v1'),
    'client_secret',max(decrypted_secret) filter(where name='bling_api_client_secret_v1'),
    'refresh_token',max(decrypted_secret) filter(where name='bling_api_refresh_token_v1')
  )
  from vault.decrypted_secrets
  where name in ('bling_api_client_id_v1','bling_api_client_secret_v1','bling_api_refresh_token_v1')
$$;

create or replace function public.set_bling_api_refresh_token_v1(p_refresh_token text)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
begin
  if nullif(trim(coalesce(p_refresh_token,'')),'') is null then
    raise exception 'refresh_token_required';
  end if;

  select id into v_id
  from vault.secrets
  where name='bling_api_refresh_token_v1'
  order by updated_at desc
  limit 1;

  if v_id is null then
    perform vault.create_secret(
      trim(p_refresh_token),
      'bling_api_refresh_token_v1',
      'Refresh token Bling API V3 rotacionado automaticamente pelo importador historico',
      null
    );
  else
    perform vault.update_secret(
      v_id,
      trim(p_refresh_token),
      'bling_api_refresh_token_v1',
      'Refresh token Bling API V3 rotacionado automaticamente pelo importador historico',
      null
    );
  end if;
  return true;
end
$$;

create or replace function public.begin_bling_history_import_run_v1(
  p_start_date date,
  p_end_date date,
  p_page integer default 1,
  p_page_size integer default 10
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  r public.bling_history_import_runtime%rowtype;
  v_id uuid;
  v_size integer;
begin
  select * into r from public.bling_history_import_runtime where id=1;
  if not found or r.enabled is not true then raise exception 'bling_history_import_disabled'; end if;
  if r.fetch_enabled is not true then raise exception 'bling_history_fetch_disabled'; end if;
  if p_start_date is null or p_end_date is null then raise exception 'date_range_required'; end if;
  if p_end_date<p_start_date then raise exception 'invalid_date_range'; end if;
  if p_end_date-p_start_date>366 then raise exception 'date_range_too_large'; end if;

  v_size:=greatest(1,least(coalesce(p_page_size,10),least(r.max_orders_per_run,100)));

  insert into public.bling_history_import_runs(
    mode,status,requested_start_date,requested_end_date,page,page_size,started_at
  )
  values(
    'fetch','running',p_start_date,p_end_date,greatest(1,coalesce(p_page,1)),v_size,now()
  )
  returning id into v_id;

  return v_id;
end
$$;

create or replace function public.stage_bling_history_order_v1(
  p_run_id uuid,
  p_order jsonb,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_bling_order_id bigint;
  v_status_id bigint;
  v_status_name text;
  v_item jsonb;
  v_index integer:=0;
  v_line_total numeric;
  v_result jsonb;
begin
  if p_run_id is not null and not exists(
    select 1 from public.bling_history_import_runs where id=p_run_id and status='running'
  ) then
    raise exception 'import_run_not_running';
  end if;

  begin
    v_bling_order_id:=(p_order->>'bling_order_id')::bigint;
  exception when others then
    raise exception 'invalid_bling_order_id';
  end;
  if v_bling_order_id is null or v_bling_order_id<=0 then raise exception 'invalid_bling_order_id'; end if;

  begin v_status_id:=nullif(p_order->>'status_id','')::bigint; exception when others then v_status_id:=null; end;
  v_status_name:=nullif(trim(coalesce(p_order->>'status_name','')),'');

  insert into public.bling_history_staging_orders(
    bling_order_id,import_run_id,bling_contact_id,order_number,store_order_number,order_date,
    status_id,status_name,total,subtotal,discount,other_expenses,customer_name,customer_document,
    customer_phone,delivery_address,raw,last_seen_at,updated_at
  )
  values(
    v_bling_order_id,
    p_run_id,
    nullif(p_order->>'bling_contact_id','')::bigint,
    nullif(trim(coalesce(p_order->>'order_number','')),''),
    nullif(trim(coalesce(p_order->>'store_order_number','')),''),
    nullif(p_order->>'order_date','')::date,
    v_status_id,
    v_status_name,
    coalesce(nullif(p_order->>'total','')::numeric,0),
    coalesce(nullif(p_order->>'subtotal','')::numeric,0),
    coalesce(nullif(p_order->>'discount','')::numeric,0),
    coalesce(nullif(p_order->>'other_expenses','')::numeric,0),
    nullif(trim(coalesce(p_order->>'customer_name','')),''),
    nullif(trim(coalesce(p_order->>'customer_document','')),''),
    nullif(trim(coalesce(p_order->>'customer_phone','')),''),
    coalesce(p_order->'delivery_address','{}'::jsonb),
    coalesce(p_order->'raw','{}'::jsonb),
    now(),
    now()
  )
  on conflict(bling_order_id) do update set
    import_run_id=coalesce(excluded.import_run_id,public.bling_history_staging_orders.import_run_id),
    bling_contact_id=excluded.bling_contact_id,
    order_number=excluded.order_number,
    store_order_number=excluded.store_order_number,
    order_date=excluded.order_date,
    status_id=excluded.status_id,
    status_name=excluded.status_name,
    total=excluded.total,
    subtotal=excluded.subtotal,
    discount=excluded.discount,
    other_expenses=excluded.other_expenses,
    customer_name=excluded.customer_name,
    customer_document=excluded.customer_document,
    customer_phone=excluded.customer_phone,
    delivery_address=excluded.delivery_address,
    raw=excluded.raw,
    reconciliation_status=case
      when public.bling_history_staging_orders.reconciliation_status='promoted' then 'promoted'
      else 'pending'
    end,
    reconciliation_notes=case
      when public.bling_history_staging_orders.reconciliation_status='promoted' then public.bling_history_staging_orders.reconciliation_notes
      else '{}'::text[]
    end,
    last_seen_at=now(),
    updated_at=now()
  returning id into v_id;

  if v_status_id is not null then
    insert into public.bling_history_status_policy(bling_status_id,status_name,approved)
    values(v_status_id,v_status_name,false)
    on conflict(bling_status_id) do update set
      status_name=coalesce(excluded.status_name,public.bling_history_status_policy.status_name),
      updated_at=now();
  end if;

  if not exists(
    select 1 from public.bling_history_staging_orders
    where id=v_id and reconciliation_status='promoted'
  ) then
    delete from public.bling_history_staging_items where staging_order_id=v_id;

    if jsonb_typeof(coalesce(p_items,'[]'::jsonb))='array' then
      for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb))
      loop
        v_line_total:=coalesce(
          nullif(v_item->>'line_total','')::numeric,
          coalesce(nullif(v_item->>'quantity','')::numeric,0)*coalesce(nullif(v_item->>'unit_price','')::numeric,0)
        );

        insert into public.bling_history_staging_items(
          staging_order_id,item_index,bling_product_id,sku,gtin,name,quantity,unit_price,line_total,raw
        )
        values(
          v_id,
          v_index,
          nullif(v_item->>'bling_product_id','')::bigint,
          nullif(trim(coalesce(v_item->>'sku','')),''),
          nullif(trim(coalesce(v_item->>'gtin','')),''),
          coalesce(nullif(trim(coalesce(v_item->>'name','')),''),'Produto'),
          coalesce(nullif(v_item->>'quantity','')::numeric,0),
          coalesce(nullif(v_item->>'unit_price','')::numeric,0),
          v_line_total,
          coalesce(v_item->'raw','{}'::jsonb)
        );
        v_index:=v_index+1;
      end loop;
    end if;

    v_result:=public.reconcile_bling_history_order_v1(v_id);
  else
    v_result:=jsonb_build_object('status','already_promoted');
  end if;

  update public.bling_history_import_runs
     set fetched_count=fetched_count+1,
         staged_count=staged_count+1,
         matched_count=matched_count+case when v_result->>'status'='ready' then 1 else 0 end,
         review_count=review_count+case when v_result->>'status'='review' then 1 else 0 end,
         duplicate_count=duplicate_count+case when v_result->>'status'='duplicate_local' then 1 else 0 end,
         updated_at=now()
   where id=p_run_id;

  return jsonb_build_object(
    'staging_order_id',v_id,
    'bling_order_id',v_bling_order_id,
    'items',v_index,
    'reconciliation',v_result
  );
end
$$;

create or replace function public.finish_bling_history_import_run_v1(
  p_run_id uuid,
  p_status text,
  p_summary jsonb default '{}'::jsonb,
  p_cursor jsonb default '{}'::jsonb,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  r public.bling_history_import_runs%rowtype;
begin
  if p_status not in ('done','partial','error','cancelled') then raise exception 'invalid_run_status'; end if;

  update public.bling_history_import_runs
     set status=p_status,
         summary=coalesce(p_summary,'{}'::jsonb),
         cursor=coalesce(p_cursor,'{}'::jsonb),
         last_error=nullif(trim(coalesce(p_error,'')),''),
         finished_at=now(),
         updated_at=now()
   where id=p_run_id
   returning * into r;

  if not found then raise exception 'import_run_not_found'; end if;

  return jsonb_build_object(
    'id',r.id,
    'status',r.status,
    'fetched_count',r.fetched_count,
    'staged_count',r.staged_count,
    'matched_count',r.matched_count,
    'review_count',r.review_count,
    'duplicate_count',r.duplicate_count,
    'summary',r.summary,
    'cursor',r.cursor
  );
end
$$;

revoke all on function public.get_bling_history_import_key_v1() from public,anon,authenticated;
revoke all on function public.get_bling_api_credentials_v1() from public,anon,authenticated;
revoke all on function public.set_bling_api_refresh_token_v1(text) from public,anon,authenticated;
revoke all on function public.begin_bling_history_import_run_v1(date,date,integer,integer) from public,anon,authenticated;
revoke all on function public.stage_bling_history_order_v1(uuid,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.finish_bling_history_import_run_v1(uuid,text,jsonb,jsonb,text) from public,anon,authenticated;

grant execute on function public.get_bling_history_import_key_v1() to service_role;
grant execute on function public.get_bling_api_credentials_v1() to service_role;
grant execute on function public.set_bling_api_refresh_token_v1(text) to service_role;
grant execute on function public.begin_bling_history_import_run_v1(date,date,integer,integer) to service_role;
grant execute on function public.stage_bling_history_order_v1(uuid,jsonb,jsonb) to service_role;
grant execute on function public.finish_bling_history_import_run_v1(uuid,text,jsonb,jsonb,text) to service_role;

commit;
