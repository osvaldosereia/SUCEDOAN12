begin;

create table if not exists public.inventory_fast_scan_events_v3 (
  event_id uuid primary key,
  ean text not null,
  product_id uuid references public.products(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  device_label text,
  source text,
  scanned_at timestamptz not null,
  received_at timestamptz not null default now(),
  status text not null default 'received' check (status in ('received','applied','unknown_queued','stale')),
  balance_quantity integer,
  is_new_window boolean,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists inventory_fast_scan_events_v3_recent_idx on public.inventory_fast_scan_events_v3(scanned_at desc);
create index if not exists inventory_fast_scan_events_v3_ean_idx on public.inventory_fast_scan_events_v3(ean,scanned_at desc);
alter table public.inventory_fast_scan_events_v3 enable row level security;
revoke all on table public.inventory_fast_scan_events_v3 from public,anon,authenticated;
grant select,insert,update on table public.inventory_fast_scan_events_v3 to service_role;

create or replace function public.apply_inventory_fast_scan_events_v3(
  p_user_id uuid,
  p_device_label text,
  p_events jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_raw jsonb;
  v_event_id uuid;
  v_ean text;
  v_product_id uuid;
  v_source text;
  v_scan_time timestamptz;
  v_inserted integer;
  v_product public.products%rowtype;
  v_state public.inventory_fast_balance_state_v2%rowtype;
  v_quantity integer;
  v_new_window boolean;
  v_previous_stock numeric;
  v_status text;
  v_applied integer:=0;
  v_unknown integer:=0;
  v_duplicates integer:=0;
  v_stale integer:=0;
  v_results jsonb:='[]'::jsonb;
begin
  if jsonb_typeof(p_events)<>'array' then raise exception 'events_must_be_array'; end if;
  if jsonb_array_length(p_events)>100 then raise exception 'too_many_events'; end if;

  for v_raw in
    select value from jsonb_array_elements(p_events)
    order by coalesce(nullif(value->>'scanned_at','')::timestamptz,clock_timestamp()), value->>'event_id'
  loop
    begin v_event_id:=(v_raw->>'event_id')::uuid; exception when others then continue; end;
    v_ean:=regexp_replace(coalesce(v_raw->>'ean',''),'\D','','g');
    if length(v_ean)<5 or length(v_ean)>32 then continue; end if;
    begin v_product_id:=nullif(v_raw->>'product_id','')::uuid; exception when others then v_product_id:=null; end;
    v_source:=left(coalesce(nullif(v_raw->>'source',''),'unknown'),60);
    begin v_scan_time:=coalesce(nullif(v_raw->>'scanned_at','')::timestamptz,clock_timestamp()); exception when others then v_scan_time:=clock_timestamp(); end;
    if v_scan_time>clock_timestamp()+interval '5 minutes' then v_scan_time:=clock_timestamp(); end if;

    insert into public.inventory_fast_scan_events_v3(event_id,ean,product_id,user_id,device_label,source,scanned_at,status)
    values(v_event_id,v_ean,v_product_id,p_user_id,nullif(left(coalesce(p_device_label,''),120),''),v_source,v_scan_time,'received')
    on conflict(event_id) do nothing;
    get diagnostics v_inserted=row_count;
    if v_inserted=0 then v_duplicates:=v_duplicates+1; continue; end if;

    if v_product_id is null then
      insert into public.unresolved_product_eans(ean,status,scan_count,first_seen_at,last_seen_at,first_seen_by,last_seen_by,source,metadata,updated_at)
      values(v_ean,'pending',1,v_scan_time,v_scan_time,p_user_id,p_user_id,'inventory_fast_balance_v3',jsonb_build_object('device_label',p_device_label),clock_timestamp())
      on conflict(ean) do update set
        scan_count=public.unresolved_product_eans.scan_count+1,
        last_seen_at=greatest(public.unresolved_product_eans.last_seen_at,excluded.last_seen_at),
        last_seen_by=p_user_id,
        status=case when public.unresolved_product_eans.status='resolved' then 'resolved' else 'pending' end,
        metadata=coalesce(public.unresolved_product_eans.metadata,'{}'::jsonb)||excluded.metadata,
        updated_at=clock_timestamp();
      update public.inventory_fast_scan_events_v3 set status='unknown_queued' where event_id=v_event_id;
      v_unknown:=v_unknown+1;
      v_results:=v_results||jsonb_build_array(jsonb_build_object('event_id',v_event_id,'ean',v_ean,'kind','unknown'));
      continue;
    end if;

    select * into v_product from public.products where id=v_product_id for update;
    if not found then
      update public.inventory_fast_scan_events_v3 set status='stale',metadata=jsonb_build_object('reason','product_missing') where event_id=v_event_id;
      v_stale:=v_stale+1; continue;
    end if;
    v_previous_stock:=v_product.stock;
    select * into v_state from public.inventory_fast_balance_state_v2 where product_id=v_product_id for update;
    v_new_window:=false;

    if not found then
      v_quantity:=1;v_new_window:=true;
      insert into public.inventory_fast_balance_state_v2(product_id,ean,quantity,window_started_at,last_scanned_at,expires_at,first_scanned_by,last_scanned_by,last_device_label,updated_at)
      values(v_product_id,v_ean,1,v_scan_time,v_scan_time,v_scan_time+interval '30 minutes',p_user_id,p_user_id,nullif(left(coalesce(p_device_label,''),120),''),clock_timestamp());
    elsif v_scan_time < v_state.window_started_at then
      update public.inventory_fast_scan_events_v3 set status='stale',metadata=jsonb_build_object('reason','older_than_current_window','current_window_started_at',v_state.window_started_at) where event_id=v_event_id;
      v_stale:=v_stale+1;
      v_results:=v_results||jsonb_build_array(jsonb_build_object('event_id',v_event_id,'ean',v_ean,'kind','stale'));
      continue;
    elsif v_scan_time <= v_state.last_scanned_at + interval '30 minutes' then
      v_quantity:=v_state.quantity+1;
      update public.inventory_fast_balance_state_v2 set
        quantity=v_quantity,
        last_scanned_at=greatest(last_scanned_at,v_scan_time),
        expires_at=greatest(last_scanned_at,v_scan_time)+interval '30 minutes',
        last_scanned_by=p_user_id,last_device_label=nullif(left(coalesce(p_device_label,''),120),''),updated_at=clock_timestamp()
      where product_id=v_product_id;
    else
      v_quantity:=1;v_new_window:=true;
      update public.inventory_fast_balance_state_v2 set
        ean=v_ean,quantity=1,window_started_at=v_scan_time,last_scanned_at=v_scan_time,expires_at=v_scan_time+interval '30 minutes',
        first_scanned_by=p_user_id,last_scanned_by=p_user_id,last_device_label=nullif(left(coalesce(p_device_label,''),120),''),legacy_checkpoint_id=null,updated_at=clock_timestamp()
      where product_id=v_product_id;
    end if;

    update public.products set
      stock=v_quantity,
      physically_verified=true,
      physically_verified_at=greatest(coalesce(physically_verified_at,'epoch'::timestamptz),v_scan_time),
      physically_verified_by=p_user_id,
      last_counted_at=greatest(coalesce(last_counted_at,'epoch'::timestamptz),v_scan_time),
      updated_at=clock_timestamp(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('last_inventory_mode','fast_balance_v3','fast_balance_quantity',v_quantity,'fast_balance_last_scan_at',greatest(coalesce(v_state.last_scanned_at,v_scan_time),v_scan_time))
    where id=v_product_id;

    insert into public.inventory_fast_balance_events_v2(product_id,ean,user_id,device_label,event_kind,is_new_window,previous_stock,balance_quantity,scanned_at,metadata)
    values(v_product_id,v_ean,p_user_id,nullif(left(coalesce(p_device_label,''),120),''),'scan',v_new_window,v_previous_stock,v_quantity,v_scan_time,jsonb_build_object('client_event_id',v_event_id,'source','capture_queue_v3'));

    update public.inventory_fast_scan_events_v3 set status='applied',balance_quantity=v_quantity,is_new_window=v_new_window where event_id=v_event_id;
    v_applied:=v_applied+1;
    v_results:=v_results||jsonb_build_array(jsonb_build_object('event_id',v_event_id,'ean',v_ean,'kind','counted','product_id',v_product_id,'quantity',v_quantity,'new_window',v_new_window,'scanned_at',v_scan_time));
  end loop;

  return jsonb_build_object('applied',v_applied,'unknown',v_unknown,'duplicates',v_duplicates,'stale',v_stale,'results',v_results);
end;
$$;

revoke all on function public.apply_inventory_fast_scan_events_v3(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.apply_inventory_fast_scan_events_v3(uuid,text,jsonb) to service_role;

commit;