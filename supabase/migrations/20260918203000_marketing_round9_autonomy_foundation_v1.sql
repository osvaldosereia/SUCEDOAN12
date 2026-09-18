-- Marketing Admin / Organic Social — Round 9 autonomy foundation.
-- Read-only planning, tracking preview and learning. No external activation.

create or replace function public.marketing_editorial_plan_v1(p_days integer default 14)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_days integer := greatest(1,least(coalesce(p_days,14),31));
  v_tz text := 'America/Cuiaba';
  v_configured_limit integer := 0;
  v_suggestions jsonb := '[]'::jsonb;
  v_daily_load jsonb := '[]'::jsonb;
  v_unscheduled integer := 0;
  v_scheduled integer := 0;
  v_conflicts integer := 0;
begin
  select coalesce(default_timezone,'America/Cuiaba'),coalesce(max_daily_publications,0)
    into v_tz,v_configured_limit
  from public.marketing_runtime_config
  where id=1;

  with base as (
    select
      j.id,
      j.asset_id,
      j.campaign_id,
      j.channel,
      j.content_type,
      j.status,
      j.manual_confirmation_required,
      j.scheduled_for,
      j.created_at,
      a.title,
      a.media_kind,
      row_number() over (
        order by coalesce(j.scheduled_for,j.created_at),j.created_at,j.id
      ) as rn
    from public.marketing_publication_jobs j
    join public.marketing_assets a on a.id=j.asset_id
    where j.status in ('approved','scheduled','ready_manual')
      and a.status='approved'
      and (
        j.scheduled_for is null
        or j.scheduled_for < now() + make_interval(days=>v_days)
      )
  ), proposed as (
    select
      b.*,
      case
        when b.scheduled_for is not null then b.scheduled_for
        else (
          date_trunc('day',now() at time zone v_tz)
          + make_interval(days=>(((b.rn-1)/3)::integer+1))
          + case ((b.rn-1)%3)
              when 0 then interval '9 hours'
              when 1 then interval '13 hours'
              else interval '18 hours'
            end
        ) at time zone v_tz
      end as recommended_for,
      case when b.scheduled_for is null then 'spread_load' else 'already_scheduled' end as recommendation_reason
    from base b
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'job_id',id,
    'asset_id',asset_id,
    'campaign_id',campaign_id,
    'title',title,
    'channel',channel,
    'content_type',content_type,
    'status',status,
    'manual_confirmation_required',manual_confirmation_required,
    'scheduled_for',scheduled_for,
    'recommended_for',recommended_for,
    'recommendation_reason',recommendation_reason,
    'suggestion_only',true
  ) order by recommended_for,channel),'[]'::jsonb)
  into v_suggestions
  from proposed;

  select
    count(*) filter(where scheduled_for is null),
    count(*) filter(where scheduled_for is not null)
  into v_unscheduled,v_scheduled
  from public.marketing_publication_jobs j
  join public.marketing_assets a on a.id=j.asset_id
  where j.status in ('approved','scheduled','ready_manual')
    and a.status='approved';

  with s as (
    select
      channel,
      scheduled_for,
      lag(scheduled_for) over(partition by channel order by scheduled_for) as prev_at
    from public.marketing_publication_jobs
    where status='scheduled'
      and scheduled_for>=now()-interval '1 day'
      and scheduled_for<now()+make_interval(days=>v_days)
  )
  select count(*) into v_conflicts
  from s
  where prev_at is not null and scheduled_for-prev_at<interval '90 minutes';

  select coalesce(jsonb_agg(x order by x.local_day),'[]'::jsonb)
  into v_daily_load
  from (
    select
      (scheduled_for at time zone v_tz)::date as local_day,
      count(*) as scheduled_count,
      jsonb_object_agg(channel,cnt) as by_channel
    from (
      select
        scheduled_for,
        channel,
        count(*) over(
          partition by (scheduled_for at time zone v_tz)::date,channel
        ) as cnt
      from public.marketing_publication_jobs
      where status='scheduled'
        and scheduled_for>=now()
        and scheduled_for<now()+make_interval(days=>v_days)
    ) d
    group by (scheduled_for at time zone v_tz)::date
  ) x;

  return jsonb_build_object(
    'ok',true,
    'mode','preview_only',
    'timezone',v_tz,
    'days',v_days,
    'configured_daily_publication_limit',v_configured_limit,
    'summary',jsonb_build_object(
      'scheduled',v_scheduled,
      'unscheduled_approved',v_unscheduled,
      'schedule_conflicts',v_conflicts
    ),
    'daily_load',v_daily_load,
    'suggestions',v_suggestions,
    'rules',jsonb_build_object(
      'performance_claims',false,
      'slot_strategy','operational_spread_only',
      'auto_schedule',false,
      'auto_publish',false
    ),
    'external_side_effect',false
  );
end;
$$;

revoke all on function public.marketing_editorial_plan_v1(integer) from public,anon,authenticated;
grant execute on function public.marketing_editorial_plan_v1(integer) to service_role;


create or replace function public.marketing_tracking_link_v1(
  p_asset_id uuid,
  p_channel text,
  p_destination text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_asset public.marketing_assets%rowtype;
  v_channel text := lower(trim(coalesce(p_channel,'')));
  v_destination text := trim(coalesce(p_destination,''));
  v_source text;
  v_campaign text;
  v_content text;
  v_sep text;
  v_url text;
begin
  if v_channel not in (
    'instagram_feed','instagram_story','instagram_reel','instagram_carousel',
    'facebook_post','facebook_story','facebook_reel','pinterest_pin','whatsapp_status'
  ) then
    return jsonb_build_object('ok',false,'error','unsupported_channel','external_side_effect',false);
  end if;

  select * into v_asset from public.marketing_assets where id=p_asset_id;
  if not found then
    return jsonb_build_object('ok',false,'error','asset_not_found','external_side_effect',false);
  end if;

  if v_destination='' then v_destination:='https://donaantonia.com.br/comprar/'; end if;
  if v_destination !~* '^https://(www\.)?donaantonia\.com\.br(/|$)' then
    return jsonb_build_object('ok',false,'error','destination_not_allowed','external_side_effect',false);
  end if;

  v_source:=case
    when v_channel like 'instagram_%' then 'instagram'
    when v_channel like 'facebook_%' then 'facebook'
    when v_channel='pinterest_pin' then 'pinterest'
    when v_channel='whatsapp_status' then 'whatsapp'
    else 'organic'
  end;
  v_campaign:='da_'||substr(coalesce(v_asset.campaign_id::text,v_asset.id::text),1,8);
  v_content:=substr(v_asset.id::text,1,8)||'_'||
    regexp_replace(lower(coalesce(v_asset.edit_spec->>'content_role',v_asset.media_kind,'asset')),'[^a-z0-9]+','_','g');
  v_sep:=case when position('?' in v_destination)>0 then '&' else '?' end;
  v_url:=v_destination||v_sep||
    'utm_source='||v_source||
    '&utm_medium=organic_social'||
    '&utm_campaign='||v_campaign||
    '&utm_content='||v_content||
    '&da_asset='||v_asset.id::text||
    '&da_channel='||v_channel;

  return jsonb_build_object(
    'ok',true,
    'asset_id',v_asset.id,
    'campaign_id',v_asset.campaign_id,
    'channel',v_channel,
    'destination',v_destination,
    'url',v_url,
    'utm',jsonb_build_object(
      'source',v_source,
      'medium','organic_social',
      'campaign',v_campaign,
      'content',v_content
    ),
    'recording_enabled',(select attribution_recording_enabled from public.marketing_runtime_config where id=1),
    'preview_only',true,
    'external_side_effect',false
  );
end;
$$;

revoke all on function public.marketing_tracking_link_v1(uuid,text,text) from public,anon,authenticated;
grant execute on function public.marketing_tracking_link_v1(uuid,text,text) to service_role;


create or replace function public.marketing_learning_read_model_v1(
  p_from timestamptz default now()-interval '90 days',
  p_to timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_from timestamptz := coalesce(p_from,now()-interval '90 days');
  v_to timestamptz := coalesce(p_to,now());
  v_min_publications integer := 3;
  v_min_touchpoints integer := 5;
  v_publications integer := 0;
  v_touchpoints integer := 0;
  v_status text := 'insufficient_data';
  v_channels jsonb := '[]'::jsonb;
begin
  if v_to<=v_from or v_to-v_from>interval '366 days' then
    return jsonb_build_object('ok',false,'error','invalid_learning_window','external_side_effect',false);
  end if;

  select count(*) into v_publications
  from public.marketing_publication_jobs
  where published_at>=v_from and published_at<v_to and status='published';

  select count(*) into v_touchpoints
  from public.marketing_attribution_touchpoints
  where occurred_at>=v_from and occurred_at<v_to;

  if v_publications>=v_min_publications and v_touchpoints>=v_min_touchpoints then
    v_status:='observational';
  end if;

  with pub as (
    select channel,count(*)::integer publications
    from public.marketing_publication_jobs
    where published_at>=v_from and published_at<v_to and status='published'
    group by channel
  ), tp as (
    select
      channel,
      count(*) filter(where touchpoint_type='click')::integer clicks,
      count(*) filter(where touchpoint_type='conversation')::integer conversations,
      count(*) filter(where touchpoint_type='order')::integer orders,
      count(*)::integer touchpoints
    from public.marketing_attribution_touchpoints
    where occurred_at>=v_from and occurred_at<v_to
    group by channel
  ), channels as (
    select
      coalesce(pub.channel,tp.channel) channel,
      coalesce(pub.publications,0) publications,
      coalesce(tp.clicks,0) clicks,
      coalesce(tp.conversations,0) conversations,
      coalesce(tp.orders,0) orders,
      coalesce(tp.touchpoints,0) touchpoints
    from pub full join tp on tp.channel=pub.channel
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'channel',channel,
    'publications',publications,
    'clicks',clicks,
    'conversations',conversations,
    'orders',orders,
    'touchpoints',touchpoints,
    'evidence',case
      when publications>=v_min_publications and touchpoints>=v_min_touchpoints then 'observational'
      else 'insufficient'
    end,
    'auto_action',false
  ) order by channel),'[]'::jsonb)
  into v_channels
  from channels;

  return jsonb_build_object(
    'ok',true,
    'status',v_status,
    'window',jsonb_build_object('from',v_from,'to',v_to),
    'evidence',jsonb_build_object(
      'publications',v_publications,
      'touchpoints',v_touchpoints,
      'minimum_publications',v_min_publications,
      'minimum_touchpoints',v_min_touchpoints
    ),
    'channels',v_channels,
    'policy',jsonb_build_object(
      'deterministic_only',true,
      'ai_used',false,
      'ranking_enabled',false,
      'auto_optimization',false,
      'reason',case when v_status='insufficient_data' then 'insufficient_data' else 'observe_only' end
    ),
    'external_side_effect',false
  );
end;
$$;

revoke all on function public.marketing_learning_read_model_v1(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.marketing_learning_read_model_v1(timestamptz,timestamptz) to service_role;


create or replace function public.marketing_daily_plan_preview_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_runtime public.marketing_runtime_config%rowtype;
  v_products jsonb := '[]'::jsonb;
  v_editorial jsonb := '{}'::jsonb;
  v_learning jsonb := '{}'::jsonb;
  v_draft_campaigns integer := 0;
begin
  select * into v_runtime from public.marketing_runtime_config where id=1;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.score desc,x.name),'[]'::jsonb)
    into v_products
  from (
    select * from public.marketing_product_shortlist_v2(5,14)
  ) x;

  v_editorial:=public.marketing_editorial_plan_v1(7);
  v_learning:=public.marketing_learning_read_model_v1(now()-interval '90 days',now());

  select count(*) into v_draft_campaigns
  from public.marketing_campaigns
  where status='draft';

  return jsonb_build_object(
    'ok',true,
    'mode','preview_only',
    'runtime_mode',coalesce(v_runtime.execution_mode,'off'),
    'runtime_enabled',coalesce(v_runtime.enabled,false),
    'publishing_enabled',coalesce(v_runtime.publishing_enabled,false),
    'kill_switch',coalesce(v_runtime.kill_switch,true),
    'candidate_products',v_products,
    'draft_campaigns',v_draft_campaigns,
    'editorial',v_editorial,
    'learning',v_learning,
    'would_create_campaign',false,
    'would_prepare_jobs',false,
    'would_schedule',false,
    'would_publish',false,
    'automation_active',false,
    'recommended_internal_step',case
      when jsonb_array_length(v_products)=0 then 'NO_ACTION'
      when v_draft_campaigns>0 then 'REVIEW_EXISTING_DRAFTS'
      else 'REVIEW_SHORTLIST'
    end,
    'external_side_effect',false
  );
end;
$$;

revoke all on function public.marketing_daily_plan_preview_v1() from public,anon,authenticated;
grant execute on function public.marketing_daily_plan_preview_v1() to service_role;

comment on function public.marketing_editorial_plan_v1(integer)
is 'Round 9: preview-only editorial planner; never schedules or publishes.';
comment on function public.marketing_tracking_link_v1(uuid,text,text)
is 'Round 9: deterministic UTM preview for Dona Antonia destinations; no event recording.';
comment on function public.marketing_learning_read_model_v1(timestamptz,timestamptz)
is 'Round 9: deterministic learning read model with evidence thresholds; no AI or auto-optimization.';
comment on function public.marketing_daily_plan_preview_v1()
is 'Round 9: daily automation dry-run preview; creates no campaign/job/schedule/publication.';
