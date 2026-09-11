begin;

-- Marketing Render Triage V17 — explicit cancellation of pending triage requests.
-- Cancellation is a safety/control action: it never requeues a render and remains
-- available even while Marketing/triage/requeue gates are OFF or kill switches are ON.

create or replace function public.cancel_marketing_render_requeue_v1(
  p_request_id uuid,
  p_actor uuid
) returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_req public.marketing_render_triage_requests%rowtype;
  v_admin_role text;
  v_admin_active boolean;
begin
  if p_actor is null then
    return jsonb_build_object('ok',false,'error','actor_required','external_side_effect',false);
  end if;

  select role,is_active into v_admin_role,v_admin_active
  from public.admin_users
  where user_id=p_actor;

  if not found or v_admin_active is not true or v_admin_role not in ('owner','operator') then
    return jsonb_build_object('ok',false,'error','admin_not_authorized','external_side_effect',false);
  end if;

  select * into v_req
  from public.marketing_render_triage_requests
  where id=p_request_id
  for update;

  if not found then
    return jsonb_build_object('ok',false,'error','triage_request_not_found','external_side_effect',false);
  end if;

  if v_req.status='cancelled' then
    return jsonb_build_object('ok',true,'request_id',v_req.id,'status','cancelled','idempotent',true,'external_side_effect',false);
  end if;

  if v_req.status<>'pending_review' then
    return jsonb_build_object('ok',false,'error','triage_request_not_pending','status',v_req.status,'external_side_effect',false);
  end if;

  if v_admin_role<>'owner' and v_req.requested_by is distinct from p_actor then
    return jsonb_build_object('ok',false,'error','triage_cancel_forbidden','external_side_effect',false);
  end if;

  update public.marketing_render_triage_requests
  set status='cancelled',
      reviewed_by=p_actor,
      reviewed_at=now(),
      updated_at=now(),
      result_snapshot=jsonb_build_object('cancelled',true,'cancelled_at',now())
  where id=v_req.id;

  insert into public.marketing_events(entity_type,entity_id,event_type,actor_id,data,external_side_effect)
  values(
    'render_triage',v_req.id::text,'requeue_cancelled',p_actor,
    jsonb_build_object('job_id',v_req.job_id,'asset_id',v_req.asset_id,'previous_status','pending_review'),
    false
  );

  return jsonb_build_object('ok',true,'request_id',v_req.id,'status','cancelled','idempotent',false,'external_side_effect',false);
end;
$$;

revoke all on function public.cancel_marketing_render_requeue_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.cancel_marketing_render_requeue_v1(uuid,uuid) to service_role;

commit;
