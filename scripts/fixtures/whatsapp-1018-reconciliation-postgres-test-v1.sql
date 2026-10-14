\set ON_ERROR_STOP on
select set_config('request.jwt.claim.role','service_role',false);
do $test$
declare a constant uuid:='00000000-0000-4000-8000-000000000018';
 b constant uuid:='00000000-0000-4000-8000-000000000975';v jsonb;oid uuid;
begin
 if has_function_privilege('anon','public.ops2_1018_flow_outbox_pending_v1(uuid,integer)','EXECUTE')
 or has_function_privilege('authenticated','public.ops2_1018_flow_outbox_pending_v1(uuid,integer)','EXECUTE')
 then raise exception 'public reconciliation access';end if;
 select public.ops2_1018_flow_outbox_pending_v1(b,30) into v;
 if v->>'error'<>'not_1018' then raise exception '0975 access: %',v;end if;
 select public.ops2_1018_flow_outbox_pending_v1(a,101) into v;
 if v->>'error'<>'invalid_limit' then raise exception 'unbounded list: %',v;end if;
 update private.whatsapp_ana_channel_release_v1 set mode='pilot',generation=30 where whatsapp_account_id=a;
 select public.ops2_1018_flow_outbox_reserve_v1(a,'+5565999999999','1234567890',repeat('f',64),30) into v;
 if (v->>'ok')::boolean is distinct from true then raise exception 'reserve failed: %',v;end if;
 oid:=(v->>'outbox_id')::uuid;
 select public.ops2_1018_flow_outbox_finalize_v1(oid,'uncertain',null) into v;
 if (v->>'ok')::boolean is distinct from true then raise exception 'mark uncertain failed: %',v;end if;
 select public.ops2_1018_flow_outbox_pending_v1(a,30) into v;
 if not exists(select 1 from jsonb_array_elements(v->'items') item
 where item->>'outbox_id'=oid::text and item->>'state'='uncertain'
 and item->>'customer_last4'='9999') then raise exception 'queue did not include uncertain: %',v;end if;
 if v::text like '%+5565999999999%' or v::text like '%'||repeat('f',64)||'%'
 then raise exception 'queue leaks phone or token hash';end if;
 select public.ops2_1018_flow_outbox_finalize_v1(oid,'sent','wamid.reconciled123') into v;
 if (v->>'ok')::boolean is distinct from true then raise exception 'reconcile failed: %',v;end if;
 select public.ops2_1018_flow_outbox_pending_v1(a,30) into v;
 if exists(select 1 from jsonb_array_elements(v->'items') item where item->>'outbox_id'=oid::text)
 then raise exception 'reconciled item still pending';end if;
end $test$;
select 'FLOW_1018_RECONCILIATION_PASS' as test_result;
