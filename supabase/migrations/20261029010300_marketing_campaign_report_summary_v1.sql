-- Aggregate marketing campaign delivery and reply metrics in one read-only RPC.
-- Reply attribution is intentionally approximate: any inbound message within 48 hours counts.
create or replace function public.site_admin_marketing_campaign_report_summary_v1(p_campaign_id uuid)
returns table (
  total bigint,
  accepted bigint,
  sent bigint,
  delivered bigint,
  read_count bigint,
  failed bigint,
  pending bigint,
  uncertain bigint,
  skipped bigint,
  delivery_rate numeric,
  read_rate numeric,
  responses bigint,
  response_rate numeric,
  response_window_hours integer,
  response_measurement_available boolean
)
language sql
stable
security definer
set search_path = ''
as $function$
  with campaign as (
    select c.id, c.whatsapp_account_id
    from public.marketing_campaigns_v1 c
    where c.id = p_campaign_id
  ),
  dispatches as (
    select
      d.id,
      d.customer_id,
      d.status as dispatch_status,
      o.message_id
    from public.marketing_campaign_dispatches_v1 d
    left join public.whatsapp_outbox_v1 o on o.id = d.outbox_id
    where d.campaign_id = p_campaign_id
  ),
  campaign_message_ids as (
    select distinct d.message_id
    from dispatches d
    where d.message_id is not null
  ),
  latest_meta_status as (
    select distinct on (e.message_id)
      e.message_id,
      e.status
    from public.whatsapp_message_status_events_v1 e
    join campaign_message_ids ids on ids.message_id = e.message_id
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
  delivery_counts as (
    select
      count(distinct d.id) as total,
      count(distinct d.id) filter (where d.dispatch_status = 'accepted') as accepted,
      count(distinct d.message_id) filter (
        where coalesce(latest.status, m.status_current) = 'sent'
      ) as sent_status_count,
      count(distinct d.message_id) filter (
        where coalesce(latest.status, m.status_current) = 'delivered'
      ) as delivered_status_count,
      count(distinct d.message_id) filter (
        where coalesce(latest.status, m.status_current) = 'read'
      ) as read_count,
      count(distinct d.id) filter (
        where d.dispatch_status = 'failed'
           or coalesce(latest.status, m.status_current) = 'failed'
      ) as failed,
      count(distinct d.id) filter (
        where d.dispatch_status = 'skipped'
      ) as skipped,
      count(distinct d.id) filter (
        where d.dispatch_status in ('pending', 'claimed', 'retry')
      ) as pending,
      count(distinct d.id) filter (
        where d.dispatch_status = 'uncertain'
      ) as uncertain
    from dispatches d
    left join public.whatsapp_messages_v1 m on m.id = d.message_id
    left join latest_meta_status latest on latest.message_id = d.message_id
  ),
  send_times as (
    select
      d.customer_id,
      coalesce(m.sent_at, status_times.sent_at) as sent_at
    from dispatches d
    left join public.whatsapp_messages_v1 m on m.id = d.message_id
    left join lateral (
      select min(e.occurred_at) as sent_at
      from public.whatsapp_message_status_events_v1 e
      where e.message_id = d.message_id
        and e.provider = 'meta'
        and e.status in ('sent', 'delivered', 'read')
        and e.occurred_at is not null
    ) status_times on true
    where d.dispatch_status = 'accepted'
  ),
  response_counts as (
    select
      count(*) as accepted_dispatches,
      count(*) filter (
        where s.sent_at is null or s.customer_id is null
      ) as incomplete_dispatches,
      count(distinct s.customer_id) filter (
        where s.sent_at is not null and s.customer_id is not null
      ) as sent_customers,
      count(distinct s.customer_id) filter (
        where s.sent_at is not null
          and s.customer_id is not null
          and exists (
            select 1
            from public.whatsapp_messages_v1 reply
            where reply.customer_id = s.customer_id
              and reply.whatsapp_account_id = c.whatsapp_account_id
              and reply.provider = 'meta'
              and reply.direction = 'inbound'
              and reply.created_at >= s.sent_at
              and reply.created_at <= s.sent_at + interval '48 hours'
              and coalesce(reply.received_at, reply.created_at) >= s.sent_at
              and coalesce(reply.received_at, reply.created_at) <= s.sent_at + interval '48 hours'
          )
      ) as responses
    from send_times s
    cross join campaign c
  ),
  totals as (
    select
      counts.total,
      counts.accepted,
      counts.sent_status_count + counts.delivered_status_count + counts.read_count as sent,
      counts.delivered_status_count + counts.read_count as delivered,
      counts.read_count,
      counts.failed,
      counts.pending,
      counts.uncertain,
      counts.skipped
    from delivery_counts counts
  )
  select
    totals.total,
    totals.accepted,
    totals.sent,
    totals.delivered,
    totals.read_count,
    totals.failed,
    totals.pending,
    totals.uncertain,
    totals.skipped,
    case
      when totals.sent > 0
        then round(totals.delivered::numeric * 100 / totals.sent, 1)
      else 0::numeric
    end as delivery_rate,
    case
      when totals.delivered > 0
        then round(totals.read_count::numeric * 100 / totals.delivered, 1)
      else 0::numeric
    end as read_rate,
    case
      when response_counts.accepted_dispatches > 0
        and response_counts.incomplete_dispatches = 0
        and response_counts.sent_customers > 0
        then response_counts.responses
      else 0::bigint
    end as responses,
    case
      when response_counts.accepted_dispatches > 0
        and response_counts.incomplete_dispatches = 0
        and response_counts.sent_customers > 0
        then round(response_counts.responses::numeric * 100 / response_counts.sent_customers, 1)
      else 0::numeric
    end as response_rate,
    48 as response_window_hours,
    (
      response_counts.accepted_dispatches > 0
      and response_counts.incomplete_dispatches = 0
      and response_counts.sent_customers > 0
    ) as response_measurement_available
  from totals
  cross join response_counts;
$function$;

revoke all on function public.site_admin_marketing_campaign_report_summary_v1(uuid) from public, anon, authenticated;
grant execute on function public.site_admin_marketing_campaign_report_summary_v1(uuid) to service_role;
