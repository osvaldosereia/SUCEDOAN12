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
  delivery_summary as (
    select
      d.campaign_id,
      count(distinct d.id) filter (where d.status = 'accepted') as accepted_count,
      count(distinct m.id) filter (where m.status_current = 'sent') as sent_count,
      count(distinct m.id) filter (where m.status_current = 'delivered') as delivered_count,
      count(distinct m.id) filter (where m.status_current = 'read') as read_count,
      count(distinct d.id) filter (where d.status = 'failed' or m.status_current = 'failed') as failed_count,
      count(distinct d.id) filter (where d.status = 'skipped') as skipped_count,
      count(distinct d.id) filter (where d.status in ('pending', 'claimed', 'retry')) as pending_count,
      count(distinct d.id) filter (where d.status = 'uncertain') as uncertain_count
    from public.marketing_campaign_dispatches_v1 d
    left join public.whatsapp_outbox_v1 o on o.id = d.outbox_id
    left join public.whatsapp_messages_v1 m on m.id = o.message_id
    where d.campaign_id = any(coalesce(p_campaign_ids, array[]::uuid[]))
    group by d.campaign_id
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
