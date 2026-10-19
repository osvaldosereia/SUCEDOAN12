-- Pass the current customer's first registered name to the server-side Meta template worker.
-- The worker still revalidates activity, opt-in, phone, account, template and runtime before sending.
begin;
create or replace function public.marketing_revalidate_dispatch_v1(p_dispatch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_dispatch public.marketing_campaign_dispatches_v1%rowtype;
  v_campaign public.marketing_campaigns_v1%rowtype;
  v_snapshot public.marketing_campaign_snapshots_v1%rowtype;
  v_customer public.customers%rowtype;
  v_template public.whatsapp_templates_v1%rowtype;
  v_consent record;
  v_gate jsonb;
  v_phone text;
  v_conversation jsonb;
  v_enqueue jsonb;
  v_key text;
  v_reason text;
begin
  select * into v_dispatch from public.marketing_campaign_dispatches_v1 where id=p_dispatch_id for update;
  if not found then return jsonb_build_object('ok',false,'error','dispatch_not_found'); end if;
  if v_dispatch.status<>'claimed' then return jsonb_build_object('ok',false,'error','dispatch_not_claimed','status',v_dispatch.status); end if;

  select * into v_campaign from public.marketing_campaigns_v1 where id=v_dispatch.campaign_id;
  if not found then v_reason:='campaign_not_found';
  elsif v_campaign.status='paused' then
    update public.marketing_campaign_dispatches_v1 set status='pending',claimed_at=null,available_at=now()+interval '1 minute',last_error='campaign_paused' where id=v_dispatch.id;
    return jsonb_build_object('ok',false,'error','campaign_paused','dispatch_id',v_dispatch.id);
  elsif v_campaign.status='cancelled' then v_reason:='campaign_cancelled';
  elsif v_campaign.status<>'running' then v_reason:='campaign_not_runnable';
  end if;

  if v_reason is null then
    v_gate:=public.marketing_campaign_execution_gate_v1(v_dispatch.whatsapp_account_id);
    if coalesce((v_gate->>'ok')::boolean,false) is not true then
      update public.marketing_campaign_dispatches_v1 set status='pending',claimed_at=null,available_at=now()+interval '1 minute',last_error='campaigns_disabled' where id=v_dispatch.id;
      return v_gate||jsonb_build_object('dispatch_id',v_dispatch.id);
    end if;
  end if;

  if v_reason is null then
    select * into v_snapshot from public.marketing_campaign_snapshots_v1 where id=v_dispatch.snapshot_id;
    if not found or v_snapshot.campaign_id<>v_campaign.id or v_snapshot.campaign_revision<>v_campaign.revision then v_reason:='snapshot_stale'; end if;
  end if;

  if v_reason is null then
    select * into v_template from public.whatsapp_templates_v1
    where id=v_campaign.template_id and whatsapp_account_id=v_dispatch.whatsapp_account_id
      and upper(category)='MARKETING' and upper(status)='APPROVED';
    if not found then v_reason:='template_not_sendable'; end if;
  end if;

  if v_reason is null then
    select * into v_customer from public.customers where id=v_dispatch.customer_id;
    if not found or v_customer.is_active is not true then v_reason:='inactive_customer'; end if;
  end if;

  if v_reason is null then
    select * into v_consent from public.marketing_customer_consent_current_v1 where customer_id=v_dispatch.customer_id;
    if not found or coalesce(v_consent.consent_state,'never_consented')<>'opt_in' then
      v_reason:=case when coalesce(v_consent.consent_state,'never_consented')='opt_out' then 'opted_out' else 'no_consent' end;
    end if;
  end if;

  if v_reason is null then
    v_phone:=public.canonical_whatsapp_e164_br_v2(v_customer.primary_whatsapp_e164);
    if v_phone is null then v_reason:='invalid_phone';
    elsif v_dispatch.phone_e164 is null or v_phone<>v_dispatch.phone_e164 then v_reason:='phone_changed';
    end if;
  end if;

  if v_reason is not null then
    update public.marketing_campaign_dispatches_v1
      set status='skipped',skip_reason=v_reason,last_error=null,claimed_at=null,eligibility_checked_at=now(),updated_at=now()
      where id=v_dispatch.id;
    return jsonb_build_object('ok',false,'error','dispatch_skipped','skip_reason',v_reason,'dispatch_id',v_dispatch.id);
  end if;

  v_conversation:=public.whatsapp_resolve_conversation_v1(v_dispatch.whatsapp_account_id,v_phone,v_dispatch.customer_id,'campaign');
  if coalesce((v_conversation->>'ok')::boolean,false) is not true then
    update public.marketing_campaign_dispatches_v1 set status='retry',claimed_at=null,available_at=now()+interval '30 seconds',last_error='conversation_unavailable',updated_at=now() where id=v_dispatch.id;
    return jsonb_build_object('ok',false,'error','conversation_unavailable','dispatch_id',v_dispatch.id);
  end if;

  v_key:=format('campaign:%s:snapshot:%s:customer:%s',v_dispatch.campaign_id,v_dispatch.snapshot_id,v_dispatch.customer_id);
  v_enqueue:=public.whatsapp_enqueue_outbound_v1(
    v_key,
    v_dispatch.whatsapp_account_id,
    (v_conversation->>'conversation_id')::uuid,
    v_dispatch.customer_id,
    v_phone,
    'marketing_campaign',
    'template',
    jsonb_build_object(
      'campaign_id',v_campaign.id,
      'snapshot_id',v_snapshot.id,
      'dispatch_id',v_dispatch.id,
      'template_name',v_snapshot.template_name,
      'language_code',v_snapshot.template_language,
      'template_components',v_snapshot.template_components,
      'variable_values',v_snapshot.variable_values_snapshot,
      'deep_link',v_snapshot.deep_link_snapshot
    ),
    'automation',
    v_campaign.template_id
  );
  if coalesce((v_enqueue->>'ok')::boolean,false) is not true then
    update public.marketing_campaign_dispatches_v1 set status='retry',claimed_at=null,available_at=now()+interval '30 seconds',last_error=coalesce(v_enqueue->>'error','outbox_enqueue_failed'),updated_at=now() where id=v_dispatch.id;
    return jsonb_build_object('ok',false,'error',coalesce(v_enqueue->>'error','outbox_enqueue_failed'),'dispatch_id',v_dispatch.id);
  end if;

  update public.marketing_campaign_dispatches_v1
    set outbox_id=(v_enqueue->>'outbox_id')::uuid,eligibility_checked_at=now(),skip_reason=null,last_error=null,updated_at=now()
    where id=v_dispatch.id;

  return jsonb_build_object(
    'ok',true,'dispatch_id',v_dispatch.id,'outbox_id',(v_enqueue->>'outbox_id')::uuid,
    'campaign_id',v_campaign.id,'snapshot_id',v_snapshot.id,'whatsapp_account_id',v_dispatch.whatsapp_account_id,
    'customer_id',v_dispatch.customer_id,'customer_name',coalesce(nullif(split_part(btrim(v_customer.name),' ',1),''),'Cliente'),'to_phone_e164',v_phone,'template_id',v_campaign.template_id,
    'template_name',v_snapshot.template_name,'language_code',v_snapshot.template_language,
    'template_components',v_snapshot.template_components,'variable_values',v_snapshot.variable_values_snapshot,
    'mode',v_gate->>'mode'
  );
end;
$$;
revoke all on function public.marketing_revalidate_dispatch_v1(uuid) from public,anon,authenticated;
grant execute on function public.marketing_revalidate_dispatch_v1(uuid) to service_role;
commit;
