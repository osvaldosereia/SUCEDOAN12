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
