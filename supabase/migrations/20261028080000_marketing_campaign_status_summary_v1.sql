create or replace function public.site_admin_marketing_campaign_status_summary_v1(p_campaign_ids uuid[])
returns table (
  campaign_id uuid,
  accepted_count bigint,
  sent_count bigint,
  delivered_count bigint,
  read_count bigint,
  failed_count bigint,
  skipped_count bigint,
  pending_count bigint,
  uncertain_count bigint,
  snapshot_available boolean,
  snapshot_id uuid,
  snapshot_campaign_revision integer,
  snapshot_version integer,
  snapshot_template_name text,
  snapshot_template_language text,
  snapshot_template_category text,
  snapshot_found_count bigint,
  snapshot_eligible_count bigint,
  snapshot_excluded_count bigint,
  excluded_opted_out_count bigint,
  excluded_no_consent_count bigint,
  excluded_inactive_customer_count bigint,
  excluded_invalid_phone_count bigint,
  excluded_duplicate_phone_count bigint,
  snapshot_created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  with requested as (
    select distinct unnest(coalesce(p_campaign_ids, array[]::uuid[])) as campaign_id
  ),
  campaign_messages as (
    select
      d.campaign_id,
      d.id as dispatch_id,
      d.status as dispatch_status,
      o.message_id
    from public.marketing_campaign_dispatches_v1 d
    left join public.whatsapp_outbox_v1 o on o.id = d.outbox_id
    where d.campaign_id = any(coalesce(p_campaign_ids, array[]::uuid[]))
  ),
  latest_meta_status as (
    select distinct on (e.message_id)
      e.message_id,
      e.status
    from public.whatsapp_message_status_events_v1 e
    join (
      select distinct message_id
      from campaign_messages
      where message_id is not null
    ) campaign_message_ids on campaign_message_ids.message_id = e.message_id
    where e.provider = 'meta'
    order by
      e.message_id,
      e.occurred_at desc nulls last,
      case e.status
        when 'read' then 60
        when 'delivered' then 50
        when 'sent' then 40
        when 'failed' then 35
        when 'accepted' then 30
        when 'sending' then 20
        when 'queued' then 10
        else 0
      end desc,
      e.received_at desc nulls last,
      e.id desc
  ),
  delivery_summary as (
    select
      campaign_messages.campaign_id,
      count(distinct campaign_messages.dispatch_id) filter (where campaign_messages.dispatch_status = 'accepted') as accepted_count,
      count(distinct campaign_messages.message_id) filter (where coalesce(latest_meta_status.status, messages.status_current) = 'sent') as sent_count,
      count(distinct campaign_messages.message_id) filter (where coalesce(latest_meta_status.status, messages.status_current) = 'delivered') as delivered_count,
      count(distinct campaign_messages.message_id) filter (where coalesce(latest_meta_status.status, messages.status_current) = 'read') as read_count,
      count(distinct campaign_messages.dispatch_id) filter (
        where campaign_messages.dispatch_status = 'failed'
          or coalesce(latest_meta_status.status, messages.status_current) = 'failed'
      ) as failed_count,
      count(distinct campaign_messages.dispatch_id) filter (where campaign_messages.dispatch_status = 'skipped') as skipped_count,
      count(distinct campaign_messages.dispatch_id) filter (where campaign_messages.dispatch_status in ('pending', 'claimed', 'retry')) as pending_count,
      count(distinct campaign_messages.dispatch_id) filter (where campaign_messages.dispatch_status = 'uncertain') as uncertain_count
    from campaign_messages
    left join public.whatsapp_messages_v1 messages on messages.id = campaign_messages.message_id
    left join latest_meta_status on latest_meta_status.message_id = campaign_messages.message_id
    group by campaign_messages.campaign_id
  ),
  latest_snapshots as (
    select distinct on (s.campaign_id)
      s.campaign_id,
      s.id,
      s.campaign_revision,
      s.snapshot_version,
      s.template_name,
      s.template_language,
      s.template_category,
      s.found_count,
      s.eligible_count,
      s.excluded_count,
      s.created_at
    from public.marketing_campaign_snapshots_v1 s
    where s.campaign_id = any(coalesce(p_campaign_ids, array[]::uuid[]))
    order by s.campaign_id, s.created_at desc, s.snapshot_version desc, s.id desc
  ),
  exclusion_summary as (
    select
      s.campaign_id,
      s.id as snapshot_id,
      count(distinct r.id) filter (where 'opted_out' = any(coalesce(r.exclusion_reasons, array[]::text[]))) as opted_out_count,
      count(distinct r.id) filter (where 'no_consent' = any(coalesce(r.exclusion_reasons, array[]::text[]))) as no_consent_count,
      count(distinct r.id) filter (where 'inactive_customer' = any(coalesce(r.exclusion_reasons, array[]::text[]))) as inactive_customer_count,
      count(distinct r.id) filter (where 'invalid_phone' = any(coalesce(r.exclusion_reasons, array[]::text[]))) as invalid_phone_count,
      count(distinct r.id) filter (where 'duplicate_phone' = any(coalesce(r.exclusion_reasons, array[]::text[]))) as duplicate_phone_count
    from latest_snapshots s
    left join public.marketing_campaign_snapshot_recipients_v1 r on r.snapshot_id = s.id
    group by s.campaign_id, s.id
  )
  select
    requested.campaign_id,
    coalesce(delivery_summary.accepted_count, 0)::bigint,
    coalesce(delivery_summary.sent_count, 0)::bigint,
    coalesce(delivery_summary.delivered_count, 0)::bigint,
    coalesce(delivery_summary.read_count, 0)::bigint,
    coalesce(delivery_summary.failed_count, 0)::bigint,
    coalesce(delivery_summary.skipped_count, 0)::bigint,
    coalesce(delivery_summary.pending_count, 0)::bigint,
    coalesce(delivery_summary.uncertain_count, 0)::bigint,
    latest_snapshots.id is not null,
    latest_snapshots.id,
    latest_snapshots.campaign_revision,
    latest_snapshots.snapshot_version,
    latest_snapshots.template_name,
    latest_snapshots.template_language,
    latest_snapshots.template_category,
    coalesce(latest_snapshots.found_count, 0)::bigint,
    coalesce(latest_snapshots.eligible_count, 0)::bigint,
    coalesce(latest_snapshots.excluded_count, 0)::bigint,
    coalesce(exclusion_summary.opted_out_count, 0)::bigint,
    coalesce(exclusion_summary.no_consent_count, 0)::bigint,
    coalesce(exclusion_summary.inactive_customer_count, 0)::bigint,
    coalesce(exclusion_summary.invalid_phone_count, 0)::bigint,
    coalesce(exclusion_summary.duplicate_phone_count, 0)::bigint,
    latest_snapshots.created_at
  from requested
  left join delivery_summary on delivery_summary.campaign_id = requested.campaign_id
  left join latest_snapshots on latest_snapshots.campaign_id = requested.campaign_id
  left join exclusion_summary on exclusion_summary.campaign_id = latest_snapshots.campaign_id
    and exclusion_summary.snapshot_id = latest_snapshots.id
  order by requested.campaign_id;
$function$;

revoke all on function public.site_admin_marketing_campaign_status_summary_v1(uuid[]) from public, anon, authenticated;
grant execute on function public.site_admin_marketing_campaign_status_summary_v1(uuid[]) to service_role;
