\set ON_ERROR_STOP on
select set_config('request.jwt.claim.role','service_role',false);
do $test$
declare
 a1018 constant uuid:='00000000-0000-4000-8000-000000000018';
 a0975 constant uuid:='00000000-0000-4000-8000-000000000975';
 config constant jsonb:='{"behavior":{},"knowledge":[],"triggers":[],"test_cases":[]}'::jsonb;
 v jsonb;
begin
 if has_function_privilege('anon','public.ops2_ana_channel_pilot_control_v1(uuid,text,bigint,jsonb)','EXECUTE')
 or has_function_privilege('authenticated','public.ops2_ana_channel_pilot_control_v1(uuid,text,bigint,jsonb)','EXECUTE')
 then raise exception 'SECURITY: public can control 1018 pilot';end if;
 select public.ops2_ana_channel_active_config_v1(a1018) into v;
 if v->>'release_mode'<>'current' or (v->>'release_generation')::bigint<>1
 then raise exception 'baseline 1018 missing: %',v;end if;
 select public.ops2_ana_channel_active_config_v1(a0975) into v;
 if v->>'release_mode'<>'current' or (v->>'release_generation')::bigint<>0
 then raise exception '0975 isolation broken: %',v;end if;

 select public.ops2_ana_channel_pilot_control_v1(a0975,'stage',0,config) into v;
 if v->>'error'<>'pilot_only_1018' then raise exception '0975 control permitted: %',v;end if;
 select public.ops2_ana_channel_pilot_control_v1(a1018,'stage',1,config) into v;
 if (v->>'ok')::boolean is distinct from true or (v->>'generation')::bigint<>2
 then raise exception '1018 stage failed: %',v;end if;
 select public.ops2_ana_channel_pilot_control_v1(a1018,'activate',1,null) into v;
 if v->>'error'<>'generation_conflict' then raise exception 'stale activation accepted: %',v;end if;
 select public.ops2_ana_channel_pilot_control_v1(a1018,'activate',2,null) into v;
 if v->>'mode'<>'pilot' or (v->>'generation')::bigint<>3
 then raise exception 'pilot activation failed: %',v;end if;
 select public.ops2_ana_channel_active_config_v1(a1018) into v;
 if v->>'release_mode'<>'pilot' or (v->>'release_generation')::bigint<>3
 then raise exception 'pilot config lookup incorrect: %',v;end if;
 select public.ops2_ana_channel_pilot_control_v1(a1018,'rollback',3,null) into v;
 if v->>'mode'<>'current' or (v->>'generation')::bigint<>4
 then raise exception 'pilot rollback failed: %',v;end if;
 select public.ops2_ana_channel_active_config_v1(a1018) into v;
 if v->>'release_mode'<>'current' or (v->>'release_generation')::bigint<>4
 then raise exception 'rollback config not restored: %',v;end if;
 select public.ops2_ana_channel_active_config_v1(a0975) into v;
 if v->>'release_mode'<>'current' or (v->>'release_generation')::bigint<>0
 then raise exception '0975 changed after pilot: %',v;end if;
end $test$;
select 'PILOT_1018_POSTGRES_ISOLATED_PASS' as test_result;
