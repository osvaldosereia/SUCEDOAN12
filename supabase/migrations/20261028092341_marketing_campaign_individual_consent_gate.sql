-- Block campaign sends unless the current opt-in is tied to individual WhatsApp evidence.
-- Revalidate every dispatch so older snapshots cannot bypass the rule.

CREATE OR REPLACE FUNCTION public.marketing_audience_candidates_v2(p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(customer_id uuid, name text, canonical_phone text, masked_phone text, consent_state text, is_active boolean, city text, neighborhood text, order_count integer, lifetime_value numeric, last_purchase_at timestamp with time zone, phone_rank bigint, eligible boolean, exclusion_reason_list text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_filters jsonb := coalesce(p_filters,'{}'::jsonb);
  v_unsupported text;
  v_search text;
  v_city text;
  v_neighborhood text;
  v_brand text;
  v_category text;
  v_last_purchase_before timestamptz;
  v_last_purchase_after timestamptz;
  v_inactive_days integer;
  v_min_order_count integer;
  v_max_order_count integer;
  v_min_lifetime_value numeric;
  v_max_lifetime_value numeric;
begin
  if jsonb_typeof(v_filters) is distinct from 'object' then
    raise exception using errcode='22023', message='invalid_filters';
  end if;

  select k into v_unsupported
  from jsonb_object_keys(v_filters) as k
  where k <> all(array[
    'customer_ids','search','city','neighborhood','label_ids','product_ids','brand','category',
    'last_purchase_before','last_purchase_after','inactive_days','min_order_count','max_order_count',
    'min_lifetime_value','max_lifetime_value'
  ]::text[])
  limit 1;
  if v_unsupported is not null then
    raise exception using errcode='22023', message='unsupported_filter:'||v_unsupported;
  end if;

  if v_filters ? 'customer_ids' and jsonb_typeof(v_filters->'customer_ids') <> 'array' then
    raise exception using errcode='22023', message='invalid_filter_value:customer_ids';
  end if;
  if v_filters ? 'label_ids' and jsonb_typeof(v_filters->'label_ids') <> 'array' then
    raise exception using errcode='22023', message='invalid_filter_value:label_ids';
  end if;
  if v_filters ? 'product_ids' and jsonb_typeof(v_filters->'product_ids') <> 'array' then
    raise exception using errcode='22023', message='invalid_filter_value:product_ids';
  end if;

  v_search := nullif(btrim(coalesce(v_filters->>'search','')),'');
  v_city := nullif(btrim(coalesce(v_filters->>'city','')),'');
  v_neighborhood := nullif(btrim(coalesce(v_filters->>'neighborhood','')),'');
  v_brand := nullif(btrim(coalesce(v_filters->>'brand','')),'');
  v_category := nullif(btrim(coalesce(v_filters->>'category','')),'');

  begin
    if nullif(v_filters->>'last_purchase_before','') is not null then
      v_last_purchase_before := (v_filters->>'last_purchase_before')::timestamptz;
    end if;
    if nullif(v_filters->>'last_purchase_after','') is not null then
      v_last_purchase_after := (v_filters->>'last_purchase_after')::timestamptz;
    end if;
    if nullif(v_filters->>'inactive_days','') is not null then
      v_inactive_days := (v_filters->>'inactive_days')::integer;
    end if;
    if nullif(v_filters->>'min_order_count','') is not null then
      v_min_order_count := (v_filters->>'min_order_count')::integer;
    end if;
    if nullif(v_filters->>'max_order_count','') is not null then
      v_max_order_count := (v_filters->>'max_order_count')::integer;
    end if;
    if nullif(v_filters->>'min_lifetime_value','') is not null then
      v_min_lifetime_value := (v_filters->>'min_lifetime_value')::numeric;
    end if;
    if nullif(v_filters->>'max_lifetime_value','') is not null then
      v_max_lifetime_value := (v_filters->>'max_lifetime_value')::numeric;
    end if;
  exception when others then
    raise exception using errcode='22023', message='invalid_filter_value';
  end;

  if coalesce(v_inactive_days,0) < 0
     or coalesce(v_min_order_count,0) < 0
     or coalesce(v_max_order_count,0) < 0
     or coalesce(v_min_lifetime_value,0) < 0
     or coalesce(v_max_lifetime_value,0) < 0 then
    raise exception using errcode='22023', message='invalid_filter_value';
  end if;

  return query
  with purchase_orders as (
    select o.id,o.customer_id,o.total,o.confirmed_at,o.delivered_at,o.created_at
    from public.orders o
    where o.customer_id is not null
      and o.cancelled_at is null
      and o.returned_at is null
      and (
        o.confirmed_at is not null
        or lower(coalesce(o.status,'')) in ('confirmed','processing','ready','delivered')
      )
  ),
  purchase_stats as (
    select po.customer_id,
           count(*)::integer as order_count,
           coalesce(sum(coalesce(po.total,0)),0)::numeric as lifetime_value,
           max(coalesce(po.delivered_at,po.confirmed_at,po.created_at)) as last_purchase_at
    from purchase_orders po
    group by po.customer_id
  ),
  base as (
    select c.id as customer_id,
           c.name,
           c.is_active,
           c.updated_at,
           c.marketing_consent_updated_at,
           public.canonical_whatsapp_e164_br_v2(c.primary_whatsapp_e164) as canonical_phone,
           coalesce(consent.consent_state,'never_consented') as consent_state,
           public.marketing_has_verified_campaign_consent_v1(c.id) as individual_evidence_verified,
           coalesce(ps.order_count,0) as order_count,
           coalesce(ps.lifetime_value,0)::numeric as lifetime_value,
           ps.last_purchase_at,
           addr.city,
           addr.neighborhood
    from public.customers c
    left join public.marketing_customer_consent_current_v1 consent on consent.customer_id=c.id
    left join purchase_stats ps on ps.customer_id=c.id
    left join lateral (
      select a.city,a.neighborhood
      from public.customer_addresses a
      where a.customer_id=c.id
        and coalesce(a.is_active,true) is true
      order by coalesce(a.is_default,false) desc,
               a.last_confirmed_at desc nulls last,
               a.updated_at desc nulls last,
               a.id
      limit 1
    ) addr on true
    where
      (
        not (v_filters ? 'customer_ids')
        or exists (
          select 1 from jsonb_array_elements_text(v_filters->'customer_ids') x(value)
          where x.value=c.id::text
        )
      )
      and (
        v_search is null
        or c.name ilike '%'||v_search||'%'
        or coalesce(c.primary_whatsapp_e164,'') ilike '%'||v_search||'%'
      )
      and (v_city is null or lower(coalesce(addr.city,''))=lower(v_city))
      and (v_neighborhood is null or lower(coalesce(addr.neighborhood,''))=lower(v_neighborhood))
      and (
        not (v_filters ? 'label_ids')
        or exists (
          select 1
          from public.conversations cv
          join public.attendance_conversation_labels_v1 cl on cl.conversation_id=cv.id
          join public.attendance_labels_v1 l on l.id=cl.label_id and coalesce(l.is_active,true) is true
          where cv.customer_id=c.id
            and exists (
              select 1 from jsonb_array_elements_text(v_filters->'label_ids') lx(value)
              where lx.value=l.id::text
            )
        )
      )
      and (
        not (v_filters ? 'product_ids') and v_brand is null and v_category is null
        or exists (
          select 1
          from purchase_orders po2
          join public.order_items oi on oi.order_id=po2.id
          join public.products p on p.id=oi.product_id
          where po2.customer_id=c.id
            and (
              not (v_filters ? 'product_ids')
              or exists (
                select 1 from jsonb_array_elements_text(v_filters->'product_ids') px(value)
                where px.value=p.id::text
              )
            )
            and (v_brand is null or lower(coalesce(p.brand,''))=lower(v_brand))
            and (
              v_category is null
              or lower(coalesce(nullif(p.customer_category,''),nullif(p.category,''),nullif(p.whatsapp_category,''),''))=lower(v_category)
            )
        )
      )
      and (v_last_purchase_before is null or ps.last_purchase_at < v_last_purchase_before)
      and (v_last_purchase_after is null or ps.last_purchase_at >= v_last_purchase_after)
      and (
        v_inactive_days is null
        or (ps.last_purchase_at is not null and ps.last_purchase_at <= now()-make_interval(days=>v_inactive_days))
      )
      and (v_min_order_count is null or coalesce(ps.order_count,0) >= v_min_order_count)
      and (v_max_order_count is null or coalesce(ps.order_count,0) <= v_max_order_count)
      and (v_min_lifetime_value is null or coalesce(ps.lifetime_value,0) >= v_min_lifetime_value)
      and (v_max_lifetime_value is null or coalesce(ps.lifetime_value,0) <= v_max_lifetime_value)
  ),
  ranked as (
    select b.*,
           row_number() over (
             partition by b.canonical_phone
             order by
               case when b.consent_state='opt_in' then 0 else 1 end,
               case when coalesce(b.is_active,false) then 0 else 1 end,
               b.marketing_consent_updated_at desc nulls last,
               b.updated_at desc nulls last,
               b.customer_id
           ) as phone_rank
    from base b
  ),
  evaluated as (
    select r.*,
           case
             when r.canonical_phone is null then null
             else left(r.canonical_phone,5)||'*****'||right(r.canonical_phone,4)
           end as masked_phone,
           array_remove(array[
             case
               when r.consent_state='opt_out' then 'opted_out'
               when r.consent_state<>'opt_in' then 'no_consent'
               else null
             end,
             case when r.consent_state='opt_in' and r.individual_evidence_verified is not true then 'consent_evidence_unverified' else null end,
             case when coalesce(r.is_active,false) is not true then 'inactive_customer' else null end,
             case when r.canonical_phone is null then 'invalid_phone' else null end,
             case when r.canonical_phone is not null and r.phone_rank>1 then 'duplicate_phone' else null end
           ]::text[],null) as exclusion_reason_list
    from ranked r
  )
  select e.customer_id,
         e.name,
         e.canonical_phone,
         e.masked_phone,
         e.consent_state,
         e.is_active,
         e.city,
         e.neighborhood,
         e.order_count,
         e.lifetime_value,
         e.last_purchase_at,
         e.phone_rank,
         coalesce(cardinality(e.exclusion_reason_list),0)=0 as eligible,
         e.exclusion_reason_list
  from evaluated e;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketing_schedule_campaign_v1(p_campaign_id uuid, p_expected_revision integer, p_scheduled_for timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_campaign public.marketing_campaigns_v1%rowtype;
  v_snapshot public.marketing_campaign_snapshots_v1%rowtype;
  v_template public.whatsapp_templates_v1%rowtype;
  v_gate jsonb;
  v_when timestamptz:=coalesce(p_scheduled_for,now());
begin
  select * into v_campaign from public.marketing_campaigns_v1 where id=p_campaign_id for update;
  if not found then return jsonb_build_object('ok',false,'error','campaign_not_found'); end if;
  if v_campaign.revision<>p_expected_revision then return jsonb_build_object('ok',false,'error','revision_conflict','revision',v_campaign.revision); end if;
  if v_campaign.manual_batch_mode is true then return jsonb_build_object('ok',false,'error','manual_campaign_requires_explicit_batch'); end if;
  if v_campaign.status<>'approved' then return jsonb_build_object('ok',false,'error','campaign_invalid_transition','status',v_campaign.status); end if;
  select * into v_snapshot from public.marketing_campaign_snapshots_v1
    where campaign_id=v_campaign.id and campaign_revision=v_campaign.revision order by snapshot_version desc limit 1;
  if not found then return jsonb_build_object('ok',false,'error','snapshot_stale'); end if;
  if not exists (
    select 1
    from public.marketing_campaign_snapshot_recipients_v1 r
    where r.snapshot_id=v_snapshot.id
      and r.campaign_id=v_campaign.id
      and r.eligible_at_snapshot is true
      and public.marketing_has_verified_campaign_consent_v1(r.customer_id)
  ) then
    return jsonb_build_object('ok',false,'error','no_eligible_recipients');
  end if;
  select * into v_template from public.whatsapp_templates_v1
    where id=v_campaign.template_id and whatsapp_account_id=v_campaign.whatsapp_account_id
      and upper(category)='MARKETING' and upper(status)='APPROVED';
  if not found then return jsonb_build_object('ok',false,'error','template_not_sendable'); end if;
  v_gate:=public.marketing_campaign_execution_gate_v1(v_campaign.whatsapp_account_id);
  if coalesce((v_gate->>'ok')::boolean,false) is not true then return v_gate; end if;
  update public.marketing_campaigns_v1 set status='scheduled',scheduled_for=v_when,started_at=null,paused_at=null,
    completed_at=null,failed_at=null,execution_last_error=null,updated_at=now() where id=v_campaign.id;
  return jsonb_build_object('ok',true,'campaign_id',v_campaign.id,'revision',v_campaign.revision,
    'status','scheduled','scheduled_for',v_when,'snapshot_id',v_snapshot.id,'mode',v_gate->>'mode');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketing_begin_manual_campaign_batch_v1(p_campaign_id uuid, p_expected_revision integer, p_idempotency_key text, p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_campaign public.marketing_campaigns_v1%rowtype;
  v_snapshot public.marketing_campaign_snapshots_v1%rowtype;
  v_template public.whatsapp_templates_v1%rowtype;
  v_gate jsonb;
  v_batch public.marketing_campaign_manual_batches_v1%rowtype;
  v_limit integer:=least(greatest(coalesce(p_limit,10),1),10);
  v_count integer:=0;
begin
  if nullif(btrim(coalesce(p_idempotency_key,'')),'') is null or length(p_idempotency_key)>180 then
    return jsonb_build_object('ok',false,'error','invalid_idempotency_key');
  end if;
  select * into v_campaign from public.marketing_campaigns_v1 where id=p_campaign_id for update;
  if not found then return jsonb_build_object('ok',false,'error','campaign_not_found'); end if;
  select * into v_batch from public.marketing_campaign_manual_batches_v1
    where campaign_id=v_campaign.id and idempotency_key=p_idempotency_key;
  if found then
    return jsonb_build_object('ok',true,'batch_id',v_batch.id,'campaign_id',v_campaign.id,
      'status',v_batch.status,'claimed_count',v_batch.claimed_count,'worker_started_at',v_batch.worker_started_at,'replayed',true);
  end if;
  if v_campaign.revision<>p_expected_revision then return jsonb_build_object('ok',false,'error','revision_conflict','revision',v_campaign.revision); end if;
  if v_campaign.status not in ('approved','paused') then return jsonb_build_object('ok',false,'error','campaign_invalid_transition','status',v_campaign.status); end if;
  select * into v_snapshot from public.marketing_campaign_snapshots_v1
    where campaign_id=v_campaign.id and campaign_revision=v_campaign.revision
    order by snapshot_version desc limit 1;
  if not found then return jsonb_build_object('ok',false,'error','snapshot_stale'); end if;
  if not exists (
    select 1
    from public.marketing_campaign_snapshot_recipients_v1 r
    where r.snapshot_id=v_snapshot.id
      and r.campaign_id=v_campaign.id
      and r.eligible_at_snapshot is true
      and public.marketing_has_verified_campaign_consent_v1(r.customer_id)
  ) then
    return jsonb_build_object('ok',false,'error','no_eligible_recipients');
  end if;
  select * into v_template from public.whatsapp_templates_v1
    where id=v_campaign.template_id and whatsapp_account_id=v_campaign.whatsapp_account_id
      and upper(category)='MARKETING' and upper(status)='APPROVED';
  if not found then return jsonb_build_object('ok',false,'error','template_not_sendable'); end if;
  v_gate:=public.marketing_campaign_execution_gate_v1(v_campaign.whatsapp_account_id);
  if coalesce((v_gate->>'ok')::boolean,false) is not true then return v_gate; end if;

  update public.marketing_campaigns_v1
    set manual_batch_mode=true,status='scheduled',scheduled_for=now(),updated_at=now()
    where id=v_campaign.id;
  perform public.marketing_materialize_dispatches_v1(v_campaign.id);
  insert into public.marketing_campaign_manual_batches_v1(campaign_id,idempotency_key,requested_limit)
    values(v_campaign.id,p_idempotency_key,v_limit) returning * into v_batch;
  update public.marketing_campaigns_v1
    set manual_batch_mode=true,status='running',started_at=coalesce(started_at,now()),paused_at=null,
        completed_at=null,failed_at=null,execution_last_error=null,updated_at=now()
    where id=v_campaign.id;

  with picked as (
    select d.id
    from public.marketing_campaign_dispatches_v1 d
    where d.campaign_id=v_campaign.id and d.status in ('pending','retry') and d.available_at<=now()
    order by d.available_at,d.created_at,d.id
    for update skip locked
    limit v_limit
  ), claimed as (
    update public.marketing_campaign_dispatches_v1 d
    set status='claimed',claimed_at=now(),last_error=null,manual_batch_id=v_batch.id,updated_at=now()
    from picked p where d.id=p.id returning d.id
  ) select count(*)::integer into v_count from claimed;
  update public.marketing_campaign_manual_batches_v1
    set claimed_count=v_count,status=case when v_count=0 then 'no_work' else 'processing' end,
        completed_at=case when v_count=0 then now() else null end
    where id=v_batch.id returning * into v_batch;
  if v_count=0 then
    if exists(select 1 from public.marketing_campaign_dispatches_v1 d where d.campaign_id=v_campaign.id and d.status in ('pending','retry','claimed')) then
      update public.marketing_campaigns_v1 set status='paused',paused_at=now(),updated_at=now() where id=v_campaign.id;
    else
      update public.marketing_campaigns_v1 set status='completed',completed_at=now(),updated_at=now() where id=v_campaign.id;
    end if;
  end if;
  return jsonb_build_object('ok',true,'batch_id',v_batch.id,'campaign_id',v_campaign.id,
    'status',v_batch.status,'claimed_count',v_count,'worker_started_at',v_batch.worker_started_at,'replayed',false,'mode',v_gate->>'mode');
exception when unique_violation then
  return jsonb_build_object('ok',false,'error','manual_batch_already_active');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketing_revalidate_dispatch_v1(p_dispatch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    elsif public.marketing_has_verified_campaign_consent_v1(v_dispatch.customer_id) is not true then
      v_reason:='consent_evidence_unverified';
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
$function$
;
