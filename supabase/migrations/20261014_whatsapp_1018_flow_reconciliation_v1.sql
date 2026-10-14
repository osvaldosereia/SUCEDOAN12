-- 1018-only read-only reconciliation queue. Does not send, retry, or mutate orders.
begin;
create or replace function public.ops2_1018_flow_outbox_pending_v1(p_account uuid,p_limit integer default 30)
returns jsonb language plpgsql security definer set search_path=pg_catalog,private,public as $$
declare v_items jsonb;
begin
 if auth.role() is distinct from 'service_role'
 then return jsonb_build_object('ok',false,'error','forbidden');end if;
 if not exists(select 1 from public.whatsapp_accounts
 where id=p_account and slug='dona-antonia-1018' and phone_e164='+5565984491018')
 then return jsonb_build_object('ok',false,'error','not_1018');end if;
 if p_limit is null or p_limit<1 or p_limit>100
 then return jsonb_build_object('ok',false,'error','invalid_limit');end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at), '[]'::jsonb)
 into v_items from (
  select id as outbox_id, state,flow_id,release_generation,
  right(customer_phone_e164,4) as customer_last4,
  created_at,expires_at,
  (now()>=expires_at) as expired,
  (state='reserved' and created_at<now()-interval '2 minutes') as requires_review
  from private.whatsapp_1018_flow_outbox_v1
  where whatsapp_account_id=p_account and state in ('reserved','uncertain')
  order by created_at asc limit p_limit
 ) q;
 return jsonb_build_object('ok',true,'items',v_items);
end;$$;
revoke all on function public.ops2_1018_flow_outbox_pending_v1(uuid,integer) from public,anon,authenticated;
grant execute on function public.ops2_1018_flow_outbox_pending_v1(uuid,integer) to service_role;
commit;
