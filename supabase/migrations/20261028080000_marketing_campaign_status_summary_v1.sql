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
  uncertain_count bigint
)
language sql
stable
security definer
set search_path = ''
as $function$
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
  group by d.campaign_id;
$function$;

revoke all on function public.site_admin_marketing_campaign_status_summary_v1(uuid[]) from public, anon, authenticated;
grant execute on function public.site_admin_marketing_campaign_status_summary_v1(uuid[]) to service_role;
