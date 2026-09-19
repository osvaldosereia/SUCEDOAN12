-- Round 12: evidence-only channel metrics foundation.
-- Collectors remain OFF. This migration does not call external providers.

create table if not exists public.marketing_channel_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('meta','pinterest')),
  channel text not null,
  external_content_ref text not null,
  captured_at timestamptz not null,
  evidence_key text not null unique,
  metrics jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint marketing_channel_metric_snapshots_metrics_object check (jsonb_typeof(metrics)='object'),
  constraint marketing_channel_metric_snapshots_evidence_object check (jsonb_typeof(evidence)='object')
);

alter table public.marketing_channel_metric_snapshots enable row level security;
revoke all on public.marketing_channel_metric_snapshots from anon, authenticated;
grant select, insert on public.marketing_channel_metric_snapshots to service_role;

create index if not exists marketing_channel_metric_snapshots_captured_idx
  on public.marketing_channel_metric_snapshots(captured_at desc);
create index if not exists marketing_channel_metric_snapshots_channel_idx
  on public.marketing_channel_metric_snapshots(channel,captured_at desc);

create or replace function public.marketing_channel_metrics_read_model_v1(
  p_from timestamptz default now()-interval '30 days',
  p_to timestamptz default now()
) returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  v_from timestamptz:=coalesce(p_from,now()-interval '30 days');
  v_to timestamptz:=coalesce(p_to,now());
begin
  if v_to<=v_from or v_to-v_from>interval '366 days' then
    return jsonb_build_object('ok',false,'error','invalid_metrics_window','external_side_effect',false);
  end if;
  return jsonb_build_object(
    'ok',true,
    'status',case when exists(select 1 from public.marketing_channel_metric_snapshots where captured_at>=v_from and captured_at<v_to) then 'evidence_available' else 'insufficient_data' end,
    'window',jsonb_build_object('from',v_from,'to',v_to),
    'snapshots',(select count(*) from public.marketing_channel_metric_snapshots where captured_at>=v_from and captured_at<v_to),
    'by_channel',coalesce((select jsonb_object_agg(channel,payload) from (
      select channel,jsonb_build_object(
        'snapshots',count(*),
        'reach',coalesce(sum(case when metrics ? 'reach' then (metrics->>'reach')::bigint else 0 end),0),
        'impressions',coalesce(sum(case when metrics ? 'impressions' then (metrics->>'impressions')::bigint else 0 end),0),
        'views',coalesce(sum(case when metrics ? 'views' then (metrics->>'views')::bigint else 0 end),0),
        'engagement',coalesce(sum(case when metrics ? 'engagement' then (metrics->>'engagement')::bigint else 0 end),0),
        'saves',coalesce(sum(case when metrics ? 'saves' then (metrics->>'saves')::bigint else 0 end),0),
        'shares',coalesce(sum(case when metrics ? 'shares' then (metrics->>'shares')::bigint else 0 end),0)
      ) payload
      from public.marketing_channel_metric_snapshots
      where captured_at>=v_from and captured_at<v_to
      group by channel
    ) q),'{}'::jsonb),
    'collection',jsonb_build_object('enabled',false,'automatic',false,'providers',jsonb_build_array('meta','pinterest')),
    'external_side_effect',false
  );
end; $$;

revoke all on function public.marketing_channel_metrics_read_model_v1(timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.marketing_channel_metrics_read_model_v1(timestamptz,timestamptz) to service_role;
