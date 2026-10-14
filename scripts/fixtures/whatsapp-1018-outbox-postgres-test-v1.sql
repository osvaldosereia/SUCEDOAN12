\set ON_ERROR_STOP on
select set_config('request.jwt.claim.role','service_role',false);
do $test$
declare a constant uuid:='00000000-0000-4000-8000-000000000018'; b constant uuid:='00000000-0000-4000-8000-000000000975';
 v jsonb; oid uuid; customer constant text:='+5565999999999';
begin
 if has_function_privilege('anon','public.ops2_1018_flow_outbox_reserve_v1(uuid,text,text,text,bigint)','EXECUTE')
 or has_function_privilege('authenticated','public.ops2_1018_flow_outbox_finalize_v1(uuid,text,text)','EXECUTE')
 then raise exception 'public execution not revoked';end if;
 update private.whatsapp_ana_channel_release_v1 set mode='current',generation=10 where whatsapp_account_id=a;
 select public.ops2_1018_flow_outbox_reserve_v1(a,customer,'1234567890',repeat('d',64),10) into v;
 if v->>'error'<>'pilot_inactive' then raise exception 'inactive pilot allowed: %',v;end if;
 update private.whatsapp_ana_channel_release_v1 set mode='pilot',generation=11 where whatsapp_account_id=a;
 select public.ops2_1018_flow_outbox_reserve_v1(b,customer,'1234567890',repeat('d',64),11) into v;
 if v->>'error'<>'not_1018' then raise exception '0975 accepted: %',v;end if;
 select public.ops2_1018_flow_outbox_reserve_v1(a,customer,'1234567890',repeat('d',64),11) into v;
 if (v->>'ok')::boolean is distinct from true then raise exception 'reserve failed: %',v;end if;
 oid:=(v->>'outbox_id')::uuid;
 select public.ops2_1018_flow_outbox_finalize_v1(oid,'sent','wamid.outbox123') into v;
 if (v->>'ok')::boolean is distinct from true or v->>'session_id' is null
 then raise exception 'finalize failed: %',v;end if;
 select public.ops2_1018_flow_outbox_finalize_v1(oid,'sent','wamid.outbox123') into v;
 if (v->>'replayed')::boolean is distinct from true then raise exception 'not idempotent: %',v;end if;
 select public.ops2_1018_flow_outbox_finalize_v1(oid,'sent','wamid.different') into v;
 if v->>'error'<>'already_finalized' then raise exception 'changed WAMID: %',v;end if;
 select public.ops2_1018_flow_outbox_reserve_v1(a,customer,'1234567890',repeat('e',64),11) into v;
 if (v->>'ok')::boolean is distinct from true then raise exception 'reserve2 failed: %',v;end if;
 oid:=(v->>'outbox_id')::uuid;
 update private.whatsapp_ana_channel_release_v1 set mode='current',generation=12 where whatsapp_account_id=a;
 select public.ops2_1018_flow_outbox_finalize_v1(oid,'sent','wamid.rollback123') into v;
 if v->>'error'<>'pilot_changed_or_expired' then raise exception 'rollback bypassed: %',v;end if;
 select public.ops2_1018_flow_outbox_finalize_v1(oid,'uncertain',null) into v;
 if (v->>'ok')::boolean is distinct from true then raise exception 'uncertain failed: %',v;end if;
end $test$;
select 'FLOW_1018_OUTBOX_POSTGRES_PASS' as test_result;
