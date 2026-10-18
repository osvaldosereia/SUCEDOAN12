-- Pilot reversivel ANA 1018. Este arquivo NAO ativa o piloto.
-- Configuracao global continua valendo para 0975.
begin;

create table if not exists private.whatsapp_ana_channel_release_v1 (
  whatsapp_account_id uuid primary key references public.whatsapp_accounts(id),
  baseline_version_id bigint not null references private.whatsapp_ana_admin_versions_v1(id),
  pilot_version_id bigint,
  mode text not null default 'current' check(mode in ('current','pilot')),
  generation bigint not null default 1 check(generation > 0),
  changed_at timestamptz not null default now(),
  constraint pilot_required_when_active check(mode <> 'pilot' or pilot_version_id is not null)
);

create table if not exists private.whatsapp_ana_channel_pilot_versions_v1 (
  id bigserial primary key,
  whatsapp_account_id uuid not null references public.whatsapp_accounts(id),
  version bigint not null,
  configuration jsonb not null,
  created_at timestamptz not null default now(),
  unique (whatsapp_account_id,version),
  unique (whatsapp_account_id,id)
);
alter table private.whatsapp_ana_channel_release_v1
  add constraint whatsapp_ana_release_pilot_same_account_fk
  foreign key (whatsapp_account_id,pilot_version_id)
  references private.whatsapp_ana_channel_pilot_versions_v1(whatsapp_account_id,id);

create table if not exists private.whatsapp_ana_channel_release_events_v1 (
  id bigint generated always as identity primary key,
  whatsapp_account_id uuid not null references public.whatsapp_accounts(id),
  action text not null check(action in ('stage','activate','rollback')),
  generation bigint not null,
  pilot_version_id bigint,
  created_at timestamptz not null default now()
);

revoke all on private.whatsapp_ana_channel_release_v1 from public,anon,authenticated;
revoke all on private.whatsapp_ana_channel_pilot_versions_v1 from public,anon,authenticated;
revoke all on private.whatsapp_ana_channel_release_events_v1 from public,anon,authenticated;
grant select,insert,update on private.whatsapp_ana_channel_release_v1 to service_role;
grant select,insert on private.whatsapp_ana_channel_pilot_versions_v1 to service_role;
grant usage,select on sequence private.whatsapp_ana_channel_pilot_versions_v1_id_seq to service_role;
grant select,insert on private.whatsapp_ana_channel_release_events_v1 to service_role;
grant usage,select on sequence private.whatsapp_ana_channel_release_events_v1_id_seq to service_role;

-- Congelar o baseline atual do 1018 no momento de aplicar a migration.
insert into private.whatsapp_ana_channel_release_v1 (whatsapp_account_id,baseline_version_id)
select a.id,r.active_version_id
from public.whatsapp_accounts a
cross join private.whatsapp_ana_admin_runtime_v1 r
where a.slug='dona-antonia-1018' and a.phone_e164='+5565984491018' and r.singleton is true
on conflict (whatsapp_account_id) do nothing;

create or replace function public.ops2_ana_channel_active_config_v1(p_whatsapp_account_id uuid)
returns jsonb
language plpgsql security definer set search_path=pg_catalog,private,public
as $body$
declare
  v_account public.whatsapp_accounts%rowtype;
  v_release private.whatsapp_ana_channel_release_v1%rowtype;
  v_version private.whatsapp_ana_admin_versions_v1%rowtype;
  v_pilot private.whatsapp_ana_channel_pilot_versions_v1%rowtype;
  v_global jsonb;
begin
  select * into v_account from public.whatsapp_accounts where id=p_whatsapp_account_id;
  if not found then return jsonb_build_object('ok',false,'error','account_not_found'); end if;
  if v_account.slug <> 'dona-antonia-1018' or v_account.phone_e164 <> '+5565984491018' then
    v_global := public.ops2_ana_active_config_v1();
    if coalesce((v_global->>'ok')::boolean,false) is not true then
      return jsonb_build_object('ok',false,'error','global_configuration_unavailable');
    end if;
    return v_global || jsonb_build_object('release_mode','current','release_generation',0);
  end if;
  select * into v_release from private.whatsapp_ana_channel_release_v1
    where whatsapp_account_id=p_whatsapp_account_id;
  if not found then return jsonb_build_object('ok',false,'error','channel_release_missing'); end if;
  if v_release.mode='pilot' then
    select * into v_pilot from private.whatsapp_ana_channel_pilot_versions_v1
      where id=v_release.pilot_version_id and whatsapp_account_id=v_release.whatsapp_account_id;
    if not found then return jsonb_build_object('ok',false,'error','pilot_configuration_missing'); end if;
    return jsonb_build_object('ok',true,'version',v_pilot.version,'version_id',v_pilot.id,
      'configuration',v_pilot.configuration,'release_mode','pilot','release_generation',v_release.generation);
  end if;
  select * into v_version from private.whatsapp_ana_admin_versions_v1 where id=v_release.baseline_version_id;
  if not found then return jsonb_build_object('ok',false,'error','baseline_configuration_missing'); end if;
  return jsonb_build_object('ok',true,'version',v_version.version,'version_id',v_version.id,
    'configuration',v_version.configuration,'release_mode','current','release_generation',v_release.generation);
end;
$body$;

-- Somente service_role pode preparar, ativar ou reverter o piloto 1018.
-- Generations fornecem controle de concorrencia (compare-and-swap).
create or replace function public.ops2_ana_channel_pilot_control_v1(
  p_whatsapp_account_id uuid, p_action text, p_expected_generation bigint, p_configuration jsonb default null
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,private,public
as $body$
declare
  v_release private.whatsapp_ana_channel_release_v1%rowtype;
  v_version_id bigint;
  v_next bigint;
begin
  if not exists(select 1 from public.whatsapp_accounts
                where id=p_whatsapp_account_id and slug='dona-antonia-1018'
                  and phone_e164='+5565984491018')
  then return jsonb_build_object('ok',false,'error','pilot_only_1018'); end if;
  select * into v_release from private.whatsapp_ana_channel_release_v1
    where whatsapp_account_id=p_whatsapp_account_id for update;
  if not found then return jsonb_build_object('ok',false,'error','release_not_initialized'); end if;
  if p_expected_generation is null or p_expected_generation <> v_release.generation then
    return jsonb_build_object('ok',false,'error','generation_conflict','generation',v_release.generation);
  end if;
  if p_action='stage' then
    if v_release.mode <> 'current' then return jsonb_build_object('ok',false,'error','rollback_before_restaging'); end if;
    if p_configuration is null or jsonb_typeof(p_configuration)<>'object'
       or jsonb_typeof(p_configuration->'behavior')<>'object'
       or jsonb_typeof(p_configuration->'knowledge')<>'array'
       or jsonb_typeof(p_configuration->'triggers')<>'array'
       or jsonb_typeof(p_configuration->'test_cases')<>'array'
       or pg_column_size(p_configuration)>80000
    then return jsonb_build_object('ok',false,'error','pilot_configuration_invalid'); end if;
    select coalesce(max(version),0)+1 into v_next
      from private.whatsapp_ana_channel_pilot_versions_v1 where whatsapp_account_id=p_whatsapp_account_id;
    insert into private.whatsapp_ana_channel_pilot_versions_v1(whatsapp_account_id,version,configuration)
      values(p_whatsapp_account_id,v_next,p_configuration) returning id into v_version_id;
    update private.whatsapp_ana_channel_release_v1
      set pilot_version_id=v_version_id,generation=generation+1,changed_at=now()
      where whatsapp_account_id=p_whatsapp_account_id returning * into v_release;
  elsif p_action='activate' then
    if v_release.mode <> 'current' or v_release.pilot_version_id is null then
      return jsonb_build_object('ok',false,'error','pilot_not_staged'); end if;
    update private.whatsapp_ana_channel_release_v1
      set mode='pilot',generation=generation+1,changed_at=now()
      where whatsapp_account_id=p_whatsapp_account_id returning * into v_release;
  elsif p_action='rollback' then
    if v_release.mode <> 'pilot' then return jsonb_build_object('ok',false,'error','pilot_not_active'); end if;
    update private.whatsapp_ana_channel_release_v1
      set mode='current',generation=generation+1,changed_at=now()
      where whatsapp_account_id=p_whatsapp_account_id returning * into v_release;
  else
    return jsonb_build_object('ok',false,'error','action_not_supported');
  end if;
  insert into private.whatsapp_ana_channel_release_events_v1(whatsapp_account_id,action,generation,pilot_version_id)
    values(p_whatsapp_account_id,p_action,v_release.generation,v_release.pilot_version_id);
  return jsonb_build_object('ok',true,'mode',v_release.mode,'generation',v_release.generation,
    'baseline_version_id',v_release.baseline_version_id,'pilot_version_id',v_release.pilot_version_id);
end;
$body$;

-- Verificacao atomica do release antes de criar a outbox.
-- Os envios ja iniciados na Meta ainda precisam de reconciliacao por WAMID.
create or replace function public.ops2_ana_channel_begin_live_send_v1(
  p_job_id uuid, p_text text, p_release_mode text, p_release_generation bigint
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,private,public
as $body$
declare
  v_account uuid;
  v_release private.whatsapp_ana_channel_release_v1%rowtype;
begin
  select whatsapp_account_id into v_account from public.whatsapp_ana_jobs_v1 where id=p_job_id;
  if not found then return jsonb_build_object('ok',false,'error','job_not_found'); end if;
  select * into v_release from private.whatsapp_ana_channel_release_v1
    where whatsapp_account_id=v_account for share;
  if found then
    if v_release.mode is distinct from p_release_mode or v_release.generation is distinct from p_release_generation then
      return jsonb_build_object('ok',false,'error','channel_release_changed');
    end if;
  elsif p_release_mode is distinct from 'current' or p_release_generation is distinct from 0 then
    return jsonb_build_object('ok',false,'error','channel_release_invalid');
  end if;
  return public.ops2_ana_begin_live_send_v1(p_job_id,p_text);
end;
$body$;

revoke all on function public.ops2_ana_channel_active_config_v1(uuid) from public,anon,authenticated;
revoke all on function public.ops2_ana_channel_pilot_control_v1(uuid,text,bigint,jsonb) from public,anon,authenticated;
revoke all on function public.ops2_ana_channel_begin_live_send_v1(uuid,text,text,bigint) from public,anon,authenticated;
grant execute on function public.ops2_ana_channel_active_config_v1(uuid) to service_role;
grant execute on function public.ops2_ana_channel_pilot_control_v1(uuid,text,bigint,jsonb) to service_role;
grant execute on function public.ops2_ana_channel_begin_live_send_v1(uuid,text,text,bigint) to service_role;

commit;
