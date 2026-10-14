\set ON_ERROR_STOP on
select set_config('request.jwt.claim.role','service_role',false);

do $test$
declare
 account_1018 constant uuid:='00000000-0000-4000-8000-000000000018';
 account_0975 constant uuid:='00000000-0000-4000-8000-000000000975';
 customer constant text:='+5565999999999';
 v jsonb;
begin
 if has_function_privilege('anon','public.ops2_1018_flow_session_consume_v1(uuid,text,text,text,text,text)','EXECUTE')
 or has_function_privilege('authenticated','public.ops2_1018_flow_session_consume_v1(uuid,text,text,text,text,text)','EXECUTE')
 or has_function_privilege('anon','public.ops2_1018_flow_session_register_v1(uuid,text,text,text,text,bigint,integer)','EXECUTE')
 or has_function_privilege('authenticated','public.ops2_1018_flow_session_register_v1(uuid,text,text,text,text,bigint,integer)','EXECUTE')
 then raise exception 'SECURITY: public Flow RPC execution grant detected';end if;

 select public.ops2_1018_flow_session_register_v1(
 account_1018,customer,'1234567890','wamid.outbound123',repeat('a',64),1,900) into v;
 if v->>'error' <> 'pilot_not_active_or_generation_changed'
 then raise exception 'expected pilot-off rejection: %',v;end if;

 update private.whatsapp_ana_channel_release_v1 set mode='pilot',generation=5
 where whatsapp_account_id=account_1018;
 select public.ops2_1018_flow_session_register_v1(
 account_1018,customer,'1234567890','wamid.outbound123',repeat('a',64),5,900) into v;
 if (v->>'ok')::boolean is distinct from true then raise exception 'register failed: %',v;end if;
 select public.ops2_1018_flow_session_register_v1(
 account_1018,customer,'1234567890','wamid.outbound123',repeat('a',64),5,900) into v;
 if v->>'error'<>'duplicate_token' then raise exception 'duplicate token allowed: %',v;end if;

 select public.ops2_1018_flow_session_consume_v1(
 account_1018,customer,repeat('a',64),'1234567890','wamid.inbound123','offers') into v;
 if (v->>'ok')::boolean is distinct from true or (v->>'replayed')::boolean is distinct from false
 then raise exception 'consume failed: %',v;end if;
 select public.ops2_1018_flow_session_consume_v1(
 account_1018,customer,repeat('a',64),'1234567890','wamid.inbound123','offers') into v;
 if (v->>'replayed')::boolean is distinct from true then raise exception 'replay not idempotent: %',v;end if;
 select public.ops2_1018_flow_session_consume_v1(
 account_1018,customer,repeat('a',64),'1234567890','wamid.inbound456','offers') into v;
 if v->>'error'<>'session_already_consumed' then raise exception 'another WAMID replayed: %',v;end if;

 select public.ops2_1018_flow_session_register_v1(
 account_0975,customer,'1234567890','wamid.outbound999',repeat('b',64),5,900) into v;
 if v->>'error'<>'not_1018' then raise exception '0975 session wrongly accepted: %',v;end if;

 select public.ops2_1018_flow_session_register_v1(
 account_1018,customer,'1234567890','wamid.outbound222',repeat('b',64),5,900) into v;
 if (v->>'ok')::boolean is distinct from true then raise exception 'second register failed: %',v;end if;
 select public.ops2_1018_flow_session_consume_v1(
 account_1018,'+5565888888888',repeat('b',64),'1234567890','wamid.wrongperson','human') into v;
 if v->>'error'<>'session_mismatch' then raise exception 'cross-customer reply accepted: %',v;end if;
 update private.whatsapp_ana_channel_release_v1 set mode='current',generation=6
 where whatsapp_account_id=account_1018;
 select public.ops2_1018_flow_session_consume_v1(
 account_1018,customer,repeat('b',64),'1234567890','wamid.inbound222','human') into v;
 if v->>'error'<>'pilot_rolled_back_or_changed' then raise exception 'rollback unprotected: %',v;end if;
 update private.whatsapp_ana_channel_release_v1 set mode='pilot',generation=7
 where whatsapp_account_id=account_1018;
 select public.ops2_1018_flow_session_consume_v1(
 account_1018,customer,repeat('b',64),'1234567890','wamid.inbound222','human') into v;
 if v->>'error'<>'pilot_rolled_back_or_changed' then raise exception 'restage accepted old session: %',v;end if;

 select public.ops2_1018_flow_session_register_v1(
 account_1018,customer,'1234567890','wamid.outbound333',repeat('c',64),7,60) into v;
 if (v->>'ok')::boolean is distinct from true then raise exception 'expiry register failed: %',v;end if;
 update private.whatsapp_1018_flow_sessions_v1
 set issued_at=now()-interval '3 minutes',expires_at=now()-interval '2 minutes'
 where flow_token_sha256=repeat('c',64);
 select public.ops2_1018_flow_session_consume_v1(
 account_1018,customer,repeat('c',64),'1234567890','wamid.inbound333','offers') into v;
 if v->>'error'<>'session_expired_or_cancelled' then raise exception 'expired token accepted: %',v;end if;
end $test$;
select 'FLOW_1018_POSTGRES_ISOLATED_PASS' as test_result;
