-- Adds a gated D+28 dispatch queue. Runtime remains OFF and no cron job is installed.
begin;

create table if not exists public.marketing_repurchase_runtime_v1 (
  id boolean primary key default true check(id),
  enabled boolean not null default false,
  activated_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.marketing_repurchase_runtime_v1
  add column if not exists activated_at timestamptz;
alter table public.marketing_repurchase_runtime_v1
  alter column activated_at drop default,
  alter column activated_at drop not null;

create or replace function private.marketing_repurchase_runtime_activation_v1()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if tg_op='INSERT' then
    if new.enabled is true then
      new.activated_at:=clock_timestamp();
    else
      new.activated_at:=null;
    end if;
  elsif new.enabled is true then
    if old.enabled is distinct from true then
      new.activated_at:=clock_timestamp();
    else
      new.activated_at:=old.activated_at;
    end if;
  else
    new.activated_at:=null;
  end if;
  new.updated_at:=clock_timestamp();
  return new;
end
$$;
revoke all on function private.marketing_repurchase_runtime_activation_v1() from public,anon,authenticated;
drop trigger if exists marketing_repurchase_runtime_activation_v1 on public.marketing_repurchase_runtime_v1;
create trigger marketing_repurchase_runtime_activation_v1
before insert or update on public.marketing_repurchase_runtime_v1
for each row execute function private.marketing_repurchase_runtime_activation_v1();
alter table public.marketing_repurchase_runtime_v1
  drop constraint if exists marketing_repurchase_runtime_activation_consistency_v1;
alter table public.marketing_repurchase_runtime_v1
  add constraint marketing_repurchase_runtime_activation_consistency_v1
  check ((enabled is true and activated_at is not null) or (enabled is false and activated_at is null));

insert into public.marketing_repurchase_runtime_v1(id,enabled)
values(true,false) on conflict(id) do update set enabled=false;
alter table public.marketing_repurchase_runtime_v1 enable row level security;
revoke all on public.marketing_repurchase_runtime_v1 from public,anon,authenticated;
grant all on public.marketing_repurchase_runtime_v1 to service_role;

create table if not exists private.marketing_repurchase_dispatches_v1 (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  whatsapp_account_id uuid not null references public.whatsapp_accounts(id),
  to_phone_e164 text not null,
  template_name text not null,
  language_code text not null default 'pt_BR',
  status text not null default 'claimed'
    check(status in ('claimed','accepted','failed','uncertain','suppressed')),
  attempt_count integer not null default 1 check(attempt_count between 0 and 1),
  provider_message_id text,
  last_error text,
  claimed_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists marketing_repurchase_dispatch_status_v1_idx
  on private.marketing_repurchase_dispatches_v1(status,created_at);
create index if not exists marketing_repurchase_dispatch_customer_v1_idx
  on private.marketing_repurchase_dispatches_v1(customer_id);
create index if not exists marketing_repurchase_dispatch_account_v1_idx
  on private.marketing_repurchase_dispatches_v1(whatsapp_account_id);
alter table private.marketing_repurchase_dispatches_v1 enable row level security;
revoke all on private.marketing_repurchase_dispatches_v1 from public,anon,authenticated;
grant select,insert,update on private.marketing_repurchase_dispatches_v1 to service_role;

create or replace function public.marketing_repurchase_claim_due_v1(p_limit integer default 10)
returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_rows jsonb;
begin
  if not exists(select 1 from public.marketing_repurchase_runtime_v1 where id=true and enabled=true) then
    return jsonb_build_object('ok',true,'items','[]'::jsonb,'reason','repurchase_runtime_disabled');
  end if;

  with candidates as (
    select s.customer_id,s.last_purchase_order_id order_id,s.phone_e164,
      s.template_name,a.id whatsapp_account_id
    from public.marketing_repurchase_state_v1 s
    join public.orders o on o.id=s.last_purchase_order_id and o.customer_id=s.customer_id
      and o.cancelled_at is null and coalesce(o.status,'') not in ('cancelled','returned')
      and o.returned_at is null
    join public.whatsapp_accounts a on a.id=o.whatsapp_account_id
      and a.is_active is true and a.phone_e164=s.send_channel_e164
    join public.whatsapp_channel_runtime_v1 r on r.whatsapp_account_id=a.id
      and r.campaigns_enabled is true and r.send_enabled is true and r.outbound_provider='meta'
    join public.whatsapp_templates_v1 t on t.whatsapp_account_id=a.id
      and t.name=s.template_name and t.language='pt_BR'
      and t.status='APPROVED' and t.category='MARKETING'
    join public.customers c on c.id=s.customer_id and c.is_active is true
      and c.marketing_opt_in is true
    join public.marketing_customer_consent_current_v1 consent
      on consent.customer_id=s.customer_id and consent.consent_state='opt_in'
      and consent.marketing_opt_in is true and consent.phone_e164=s.phone_e164
    join public.marketing_repurchase_runtime_v1 mr on mr.id=true and mr.enabled is true
    where s.status in ('scheduled','ready')
      and s.due_at<=now()
      and s.due_at>=mr.activated_at
      and s.due_at>=now()-interval '24 hours'
      and s.marketing_opt_in is true
      and s.last_purchase_order_id is not null
      and s.last_sent_order_id is distinct from s.last_purchase_order_id
      and s.phone_e164 ~ '^\+?55[0-9]{10,11}$'
      and o.cancelled_at is null and o.returned_at is null
      and coalesce(o.status,'') not in ('cancelled','returned')
      and not exists(select 1 from private.marketing_repurchase_dispatches_v1 d where d.order_id=o.id)
    order by s.due_at,s.updated_at
    limit greatest(1,least(coalesce(p_limit,10),25))
    for update of s skip locked
  ), inserted as (
    insert into private.marketing_repurchase_dispatches_v1
      (order_id,customer_id,whatsapp_account_id,to_phone_e164,template_name)
    select order_id,customer_id,whatsapp_account_id,phone_e164,template_name from candidates
    on conflict(order_id) do nothing
    returning *
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,'order_id',i.order_id,'customer_id',i.customer_id,
    'whatsapp_account_id',i.whatsapp_account_id,'template_name',i.template_name
  )),'[]'::jsonb) into v_rows from inserted i;

  return jsonb_build_object('ok',true,'items',v_rows);
end
$$;

create or replace function public.marketing_repurchase_validate_dispatch_v1(p_dispatch_id uuid)
returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_row jsonb;
begin
  select jsonb_build_object(
    'id',d.id,'order_id',d.order_id,'customer_id',d.customer_id,
    'whatsapp_account_id',d.whatsapp_account_id,
    'phone_number_id',a.phone_number_id,'to_phone_e164',d.to_phone_e164,
    'template_name',d.template_name,'language_code',d.language_code,
    'customer_name',coalesce(nullif(split_part(btrim(c.name),' ',1),''),'cliente'),
    'template_components',t.components,
    'basket_name',coalesce(nullif(s.metadata->>'last_basket_name',''),'cesta básica'),
    'product_categories',coalesce(s.metadata->'last_product_categories','[]'::jsonb)
  ) into v_row
  from private.marketing_repurchase_dispatches_v1 d
  join public.marketing_repurchase_state_v1 s
    on s.customer_id=d.customer_id and s.last_purchase_order_id=d.order_id
  join public.customers c on c.id=d.customer_id and c.is_active is true
    and c.marketing_opt_in is true and c.primary_whatsapp_e164=d.to_phone_e164
  join public.marketing_customer_consent_current_v1 consent
    on consent.customer_id=c.id and consent.consent_state='opt_in'
    and consent.marketing_opt_in is true and consent.phone_e164=d.to_phone_e164
  join public.orders o on o.id=d.order_id and o.customer_id=d.customer_id
    and o.whatsapp_account_id=d.whatsapp_account_id
    and o.cancelled_at is null and o.returned_at is null
    and coalesce(o.status,'') not in ('cancelled','returned')
  join public.whatsapp_accounts a on a.id=d.whatsapp_account_id
    and a.is_active is true and a.phone_number_id ~ '^[0-9]{5,30}$'
    and a.phone_e164=s.send_channel_e164
  join public.whatsapp_channel_runtime_v1 r on r.whatsapp_account_id=a.id
    and r.campaigns_enabled is true and r.send_enabled is true and r.outbound_provider='meta'
  join public.whatsapp_templates_v1 t on t.whatsapp_account_id=a.id
    and t.name=d.template_name and t.language=d.language_code
    and t.status='APPROVED' and t.category='MARKETING'
  join public.marketing_repurchase_runtime_v1 mr on mr.id=true and mr.enabled is true
  where d.id=p_dispatch_id and d.status='claimed'
    and s.due_at<=now() and s.marketing_opt_in is true
    and s.due_at>=mr.activated_at and s.due_at>=now()-interval '24 hours'
    and s.last_sent_order_id is distinct from d.order_id;

  if v_row is null then
    update private.marketing_repurchase_dispatches_v1
       set status='suppressed',last_error='eligibility_changed',
           finished_at=clock_timestamp(),updated_at=clock_timestamp()
     where id=p_dispatch_id and status='claimed';
    return jsonb_build_object('ok',false,'error','dispatch_not_eligible');
  end if;
  return jsonb_build_object('ok',true,'item',v_row);
end
$$;

create or replace function public.marketing_repurchase_finish_dispatch_v1(
  p_dispatch_id uuid,p_status text,p_provider_message_id text default null,p_error text default null
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_customer_id uuid;
  v_order_id uuid;
  v_marked jsonb;
begin
  if p_status not in ('accepted','failed','uncertain','suppressed') then
    return jsonb_build_object('ok',false,'error','invalid_status');
  end if;
  update private.marketing_repurchase_dispatches_v1
    set status=p_status,
        provider_message_id=case when p_status='accepted' then nullif(btrim(coalesce(p_provider_message_id,'')),'') else null end,
        last_error=case when p_status='accepted' then null else left(coalesce(p_error,'dispatch_failed'),160) end,
        finished_at=now(),updated_at=now()
    where id=p_dispatch_id and status='claimed'
    returning customer_id,order_id into v_customer_id,v_order_id;
  if not found then return jsonb_build_object('ok',false,'error','dispatch_not_claimed'); end if;

  if p_status='accepted' then
    v_marked:=public.marketing_repurchase_mark_sent_v1(v_customer_id,v_order_id,now());
    return jsonb_build_object('ok',true,'status','accepted','state_update',v_marked);
  end if;
  return jsonb_build_object('ok',true,'status',p_status);
end
$$;

revoke all on function public.marketing_repurchase_claim_due_v1(integer) from public,anon,authenticated;
revoke all on function public.marketing_repurchase_validate_dispatch_v1(uuid) from public,anon,authenticated;
revoke all on function public.marketing_repurchase_finish_dispatch_v1(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.marketing_repurchase_claim_due_v1(integer) to service_role;
grant execute on function public.marketing_repurchase_validate_dispatch_v1(uuid) to service_role;
grant execute on function public.marketing_repurchase_finish_dispatch_v1(uuid,text,text,text) to service_role;

create or replace function public.run_marketing_repurchase_worker_tick_v1()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_locked boolean:=false;
  v_active integer:=0;
  v_secret text;
  v_request_id bigint;
begin
  select pg_try_advisory_xact_lock(hashtextextended('marketing-repurchase-worker-v1',0)) into v_locked;
  if coalesce(v_locked,false) is not true then
    return jsonb_build_object('ok',true,'no_op',true,'reason','tick_already_running');
  end if;

  select count(*)::integer into v_active
  from public.marketing_repurchase_state_v1 s
  join public.orders o on o.id=s.last_purchase_order_id and o.customer_id=s.customer_id
    and o.cancelled_at is null and o.returned_at is null
    and coalesce(o.status,'') not in ('cancelled','returned')
  join public.whatsapp_accounts a on a.id=o.whatsapp_account_id and a.is_active is true and a.phone_e164=s.send_channel_e164
  join public.whatsapp_channel_runtime_v1 r on r.whatsapp_account_id=a.id
    and r.campaigns_enabled is true and r.send_enabled is true and r.outbound_provider='meta'
  join public.whatsapp_templates_v1 t on t.whatsapp_account_id=a.id and t.name=s.template_name
    and t.language='pt_BR' and t.status='APPROVED' and t.category='MARKETING'
  join public.marketing_customer_consent_current_v1 consent
    on consent.customer_id=s.customer_id and consent.consent_state='opt_in'
    and consent.marketing_opt_in is true and consent.phone_e164=s.phone_e164
  join public.marketing_repurchase_runtime_v1 mr on mr.id=true and mr.enabled is true
  where s.status in ('scheduled','ready') and s.due_at<=now()
    and s.due_at>=mr.activated_at and s.due_at>=now()-interval '24 hours'
    and s.marketing_opt_in is true and s.last_purchase_order_id is not null
    and s.last_sent_order_id is distinct from s.last_purchase_order_id
    and not exists(select 1 from private.marketing_repurchase_dispatches_v1 d where d.order_id=o.id);
  if v_active=0 then
    return jsonb_build_object('ok',true,'no_op',true,'reason','no_eligible_repurchase');
  end if;

  v_secret:=public.marketing_campaign_worker_internal_key_v1();
  if nullif(btrim(coalesce(v_secret,'')),'') is null then
    return jsonb_build_object('ok',false,'error','worker_auth_unavailable');
  end if;
  select net.http_post(
    url:='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/whatsapp-repurchase-worker-v1',
    headers:=jsonb_build_object('Content-Type','application/json','x-dona-antonia-marketing-worker-key',v_secret),
    body:=jsonb_build_object('limit',10),
    timeout_milliseconds:=55000
  ) into v_request_id;
  return jsonb_build_object('ok',true,'no_op',false,'request_id',v_request_id,'eligible',v_active);
end
$$;
revoke all on function public.run_marketing_repurchase_worker_tick_v1() from public,anon,authenticated;
grant execute on function public.run_marketing_repurchase_worker_tick_v1() to service_role;

create or replace function public.marketing_journeys_health_status_v1()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_campaign_job jsonb:='{}'::jsonb;
  v_repurchase_job jsonb:='{}'::jsonb;
  v_post_sale_job jsonb:='{}'::jsonb;
  v_template_status jsonb:='{}'::jsonb;
  v_post_sale_template_status jsonb:='{}'::jsonb;
  v_state_counts jsonb:='[]'::jsonb;
  v_repurchase_enabled boolean:=false;
  v_post_sale_enabled boolean:=false;
  v_post_sale_configured boolean:=false;
  v_repurchase_worker boolean:=false;
  v_post_sale_worker boolean:=false;
begin
  v_repurchase_worker:=to_regprocedure('public.run_marketing_repurchase_worker_tick_v1()') is not null;
  v_post_sale_worker:=to_regprocedure('public.run_marketing_post_sale_worker_tick_v1()') is not null;
  v_post_sale_configured:=to_regclass('public.marketing_post_sale_runtime_v1') is not null;

  select coalesce(jsonb_build_object(
    'name',j.jobname,'active',j.active,'schedule',j.schedule,
    'last_run_at',r.start_time,'last_run_status',r.status,'last_run_message',r.return_message
  ),'{}'::jsonb) into v_campaign_job
  from cron.job j
  left join lateral (
    select d.start_time,d.status,d.return_message
    from cron.job_run_details d where d.jobid=j.jobid
    order by d.start_time desc limit 1
  ) r on true
  where j.jobname='marketing-campaign-worker-v1'
  order by j.jobid desc limit 1;

  select coalesce(jsonb_build_object(
    'name',j.jobname,'active',j.active,'schedule',j.schedule,
    'last_run_at',r.start_time,'last_run_status',r.status,'last_run_message',r.return_message
  ),'{}'::jsonb) into v_repurchase_job
  from cron.job j
  left join lateral (
    select d.start_time,d.status,d.return_message
    from cron.job_run_details d where d.jobid=j.jobid
    order by d.start_time desc limit 1
  ) r on true
  where j.jobname='marketing-repurchase-worker-v1'
  order by j.jobid desc limit 1;

  select coalesce(jsonb_build_object(
    'name',j.jobname,'active',j.active,'schedule',j.schedule,
    'last_run_at',r.start_time,'last_run_status',r.status,'last_run_message',r.return_message
  ),'{}'::jsonb) into v_post_sale_job
  from cron.job j
  left join lateral (
    select d.start_time,d.status,d.return_message
    from cron.job_run_details d where d.jobid=j.jobid
    order by d.start_time desc limit 1
  ) r on true
  where j.jobname='marketing-post-sale-worker-v1'
  order by j.jobid desc limit 1;

  select coalesce(enabled,false) into v_repurchase_enabled
  from public.marketing_repurchase_runtime_v1 where id=true;

  if v_post_sale_configured then
    execute 'select coalesce(enabled,false) from public.marketing_post_sale_runtime_v1 where id is true'
      into v_post_sale_enabled;
  end if;

  select jsonb_build_object(
    'required',2,
    'found',count(t.id)::integer,
    'approved',count(t.id) filter(where upper(t.status)='APPROVED')::integer,
    'items',coalesce(jsonb_agg(jsonb_build_object('channel',a.slug,'name',t.name,'status',t.status)
      order by a.slug,t.name) filter(where t.name is not null),'[]'::jsonb)
  ) into v_template_status
  from public.whatsapp_accounts a
  left join public.whatsapp_templates_v1 t on t.whatsapp_account_id=a.id
    and t.name in ('recompradonaantonia28dias0975v1','recompradonaantonia28dias1018v1')
    and t.language='pt_BR' and upper(t.category)='MARKETING'
  where a.slug in ('dona-antonia-0975','dona-antonia-1018');

  select jsonb_build_object(
    'required',2,
    'found',count(t.id)::integer,
    'approved',count(t.id) filter(where upper(t.status)='APPROVED')::integer,
    'items',coalesce(jsonb_agg(jsonb_build_object('channel',a.slug,'name',t.name,'status',t.status)
      order by a.slug,t.name) filter(where t.name is not null),'[]'::jsonb)
  ) into v_post_sale_template_status
  from public.whatsapp_accounts a
  left join public.whatsapp_templates_v1 t on t.whatsapp_account_id=a.id
    and t.name='carrossel_cestas_basicas_5_tipos_d20'
    and t.language='pt_BR' and upper(t.category)='MARKETING'
  where a.slug in ('dona-antonia-0975','dona-antonia-1018');

  select coalesce(jsonb_agg(jsonb_build_object(
    'status',status,'count',n,'earliest_due',earliest_due,'overdue_more_than_24h',overdue
  ) order by status),'[]'::jsonb) into v_state_counts
  from (
    select status,count(*)::integer n,min(due_at) earliest_due,
      count(*) filter(where due_at<now()-interval '24 hours')::integer overdue
    from public.marketing_repurchase_state_v1 group by status
  ) s;

  return jsonb_build_object(
    'checked_at',now(),
    'campaign_worker',jsonb_build_object(
      'configured',v_campaign_job<>'{}'::jsonb,'cron',v_campaign_job,
      'description','Worker genérico de campanhas; não representa envio automático D+20 ou D+28.'
    ),
    'post_sale_20d',jsonb_build_object(
      'delay_days',20,'configured',v_post_sale_configured,'runtime_enabled',coalesce(v_post_sale_enabled,false),
      'db_tick_installed',v_post_sale_worker,'edge_worker_status','not_verified','cron',v_post_sale_job,
      'template_status',case
        when coalesce((v_post_sale_template_status->>'approved')::integer,0)>=2 then 'APPROVED'
        when coalesce((v_post_sale_template_status->>'found')::integer,0)=0 then 'NOT_CONFIGURED'
        else coalesce(v_post_sale_template_status->>'approved','0')||'/2 APROVADOS' end,
      'templates',v_post_sale_template_status
    ),
    'repurchase_28d',jsonb_build_object(
      'delay_days',28,'configured',true,'runtime_enabled',coalesce(v_repurchase_enabled,false),
      'db_tick_installed',v_repurchase_worker,'edge_worker_status','not_verified','cron',v_repurchase_job,
      'templates',v_template_status,'state_counts',v_state_counts
    )
  );
end
$$;
revoke all on function public.marketing_journeys_health_status_v1() from public,anon,authenticated;
grant execute on function public.marketing_journeys_health_status_v1() to service_role;

-- Cron is intentionally omitted until both D+28 templates are approved and a reviewed activation is performed.
commit;
