create table if not exists public.product_image_automation_settings (
  id boolean primary key default true check (id = true),
  is_enabled boolean not null default true,
  interval_minutes integer not null default 3 check (interval_minutes in (1,3,5,10,15,30,60)),
  updated_at timestamptz not null default now()
);

alter table public.product_image_automation_settings enable row level security;
revoke all on table public.product_image_automation_settings from public, anon, authenticated;
grant select, insert, update on table public.product_image_automation_settings to service_role;

insert into public.product_image_automation_settings(id,is_enabled,interval_minutes)
values(true,true,3)
on conflict (id) do nothing;

create or replace function public.admin_product_image_automation_control_v1(
  p_action text default 'status',
  p_enabled boolean default null,
  p_interval_minutes integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_action text := lower(coalesce(p_action,'status'));
  v_enabled boolean;
  v_interval integer;
  v_schedule text;
  v_jobid bigint;
  v_job_active boolean := false;
  r record;
begin
  select s.is_enabled,s.interval_minutes into v_enabled,v_interval
  from public.product_image_automation_settings s where s.id=true;

  if v_enabled is null then
    v_enabled:=true; v_interval:=3;
    insert into public.product_image_automation_settings(id,is_enabled,interval_minutes)
    values(true,v_enabled,v_interval)
    on conflict(id) do update set is_enabled=excluded.is_enabled, interval_minutes=excluded.interval_minutes, updated_at=now();
  end if;

  if v_action='configure' then
    if p_interval_minutes is not null then
      if p_interval_minutes not in (1,3,5,10,15,30,60) then raise exception 'invalid_interval'; end if;
      v_interval:=p_interval_minutes;
    end if;
    if p_enabled is not null then v_enabled:=p_enabled; end if;

    for r in select jobid from cron.job where jobname='product-image-grid18-v1' loop perform cron.unschedule(r.jobid); end loop;
    update public.product_image_automation_settings set is_enabled=v_enabled,interval_minutes=v_interval,updated_at=now() where id=true;

    if v_enabled then
      v_schedule:=case when v_interval=60 then '0 * * * *' else format('*/%s * * * *',v_interval) end;
      v_jobid:=cron.schedule('product-image-grid18-v1',v_schedule,'select public.dispatch_product_image_grid18_worker_v1();');
      v_job_active:=true;
    end if;
  elsif v_action<>'status' then
    raise exception 'unknown_action';
  end if;

  select j.jobid,j.schedule,j.active into v_jobid,v_schedule,v_job_active
  from cron.job j where j.jobname='product-image-grid18-v1' order by j.jobid desc limit 1;

  return jsonb_build_object('enabled',v_enabled,'interval_minutes',v_interval,'cron_active',coalesce(v_job_active,false),'schedule',v_schedule,'jobid',v_jobid);
end;
$function$;

revoke all on function public.admin_product_image_automation_control_v1(text,boolean,integer) from public, anon, authenticated;
grant execute on function public.admin_product_image_automation_control_v1(text,boolean,integer) to service_role;
