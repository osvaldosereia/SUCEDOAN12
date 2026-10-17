create or replace function public.ops2_ana_admin_record_test_run_v1(
  p_draft_revision bigint,
  p_scenario_keys text[],
  p_passed_count integer,
  p_failed_count integer,
  p_safe_reasons jsonb,
  p_latency_ms integer,
  p_actor_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','private'
as $$
declare
  run_id uuid;
  d private.whatsapp_ana_admin_draft_v1%rowtype;
  expected_keys text[];
  scenario_count integer;
begin
  select * into d
  from private.whatsapp_ana_admin_draft_v1
  where singleton;

  select coalesce(array_agg(item->>'key' order by ord),'{}'::text[])
  into expected_keys
  from jsonb_array_elements(coalesce(d.configuration->'test_cases','[]'::jsonb))
       with ordinality as suite(item,ord);

  scenario_count := coalesce(cardinality(p_scenario_keys),0);

  if d.revision is null or p_draft_revision is distinct from d.revision then
    return jsonb_build_object('ok',false,'error','test_run_revision_stale');
  end if;

  if coalesce(cardinality(expected_keys),0) < 1
     or coalesce(cardinality(expected_keys),0) > 20
     or p_scenario_keys is distinct from expected_keys
     or scenario_count <> cardinality(expected_keys)
     or p_passed_count is null
     or p_failed_count is null
     or p_passed_count < 0
     or p_failed_count < 0
     or p_passed_count + p_failed_count <> scenario_count
     or coalesce(p_latency_ms,0) < 0 then
    return jsonb_build_object('ok',false,'error','test_run_input_invalid');
  end if;

  if p_safe_reasons is null
     or jsonb_typeof(p_safe_reasons) <> 'array'
     or jsonb_array_length(p_safe_reasons) <> scenario_count then
    return jsonb_build_object('ok',false,'error','test_run_privacy_input_invalid');
  end if;

  if exists(
       select 1
       from jsonb_array_elements(p_safe_reasons) as items(value)
       where jsonb_typeof(items.value) <> 'string'
          or length(items.value#>>'{}') > 80
     )
     or exists(
       select 1
       from unnest(coalesce(p_scenario_keys,'{}'::text[])) k
       where k !~ '^[a-z0-9][a-z0-9_-]{0,39}$'
     )
     or (
       select count(*) <> count(distinct k)
       from unnest(coalesce(p_scenario_keys,'{}'::text[])) k
     ) then
    return jsonb_build_object('ok',false,'error','test_run_privacy_input_invalid');
  end if;

  insert into private.whatsapp_ana_admin_test_runs_v1(
    draft_revision,scenario_keys,passed_count,failed_count,safe_reasons,latency_ms,actor_id
  ) values(
    p_draft_revision,p_scenario_keys,p_passed_count,p_failed_count,p_safe_reasons,p_latency_ms,p_actor_id
  )
  returning id into run_id;

  return jsonb_build_object(
    'ok',true,
    'id',run_id,
    'draft_revision',p_draft_revision,
    'passed_count',p_passed_count,
    'failed_count',p_failed_count
  );
end;
$$;

create or replace function public.ops2_ana_admin_publish_v1(
  p_test_run_id uuid,
  p_note text default '',
  p_actor_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','private'
as $$
declare
  d private.whatsapp_ana_admin_draft_v1%rowtype;
  t private.whatsapp_ana_admin_test_runs_v1%rowtype;
  required_keys text[] := array[]::text[];
  next_version integer;
  new_id bigint;
begin
  select * into d
  from private.whatsapp_ana_admin_draft_v1
  where singleton
  for update;

  select coalesce(array_agg(item->>'key' order by ord),array[]::text[])
    into required_keys
  from jsonb_array_elements(coalesce(d.configuration->'test_cases','[]'::jsonb))
       with ordinality as x(item,ord);

  select * into t
  from private.whatsapp_ana_admin_test_runs_v1
  where id=p_test_run_id;

  if not found
     or t.draft_revision<>d.revision
     or cardinality(required_keys)=0
     or t.failed_count<>0
     or t.passed_count<>cardinality(required_keys)
     or t.scenario_keys is distinct from required_keys then
    return jsonb_build_object('ok',false,'error','test_run_missing_stale_or_failed');
  end if;

  select coalesce(max(version),0)+1 into next_version
  from private.whatsapp_ana_admin_versions_v1;

  insert into private.whatsapp_ana_admin_versions_v1(version,configuration,actor_id,change_note)
    values(next_version,d.configuration,p_actor_id,left(coalesce(p_note,''),240))
    returning id into new_id;

  insert into private.whatsapp_ana_admin_runtime_v1(singleton,active_version_id,updated_at,updated_by)
    values(true,new_id,now(),p_actor_id)
    on conflict(singleton) do update
      set active_version_id=excluded.active_version_id,
          updated_at=excluded.updated_at,
          updated_by=excluded.updated_by;

  insert into private.whatsapp_ana_admin_events_v1(action,actor_id,version_id,draft_revision,detail)
    values('published',p_actor_id,new_id,d.revision,
      jsonb_build_object('version',next_version,'test_run_id',p_test_run_id,'note',left(coalesce(p_note,''),240)));

  return jsonb_build_object('ok',true,'version',next_version,'version_id',new_id,'draft_revision',d.revision);
end;
$$;

revoke all on function public.ops2_ana_admin_record_test_run_v1(bigint,text[],integer,integer,jsonb,integer,uuid) from public;
revoke execute on function public.ops2_ana_admin_record_test_run_v1(bigint,text[],integer,integer,jsonb,integer,uuid) from anon;
revoke execute on function public.ops2_ana_admin_record_test_run_v1(bigint,text[],integer,integer,jsonb,integer,uuid) from authenticated;
grant execute on function public.ops2_ana_admin_record_test_run_v1(bigint,text[],integer,integer,jsonb,integer,uuid) to service_role;

revoke all on function public.ops2_ana_admin_publish_v1(uuid,text,uuid) from public;
revoke execute on function public.ops2_ana_admin_publish_v1(uuid,text,uuid) from anon;
revoke execute on function public.ops2_ana_admin_publish_v1(uuid,text,uuid) from authenticated;
grant execute on function public.ops2_ana_admin_publish_v1(uuid,text,uuid) to service_role;
