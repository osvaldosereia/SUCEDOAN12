begin;

create or replace function public.marketing_metrics_read_model_v1(
  p_from timestamptz default now() - interval '30 days',
  p_to timestamptz default now()
) returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_from timestamptz:=coalesce(p_from,now()-interval '30 days');
  v_to timestamptz:=coalesce(p_to,now());
  v_payload jsonb;
begin
  if v_to<=v_from or v_to-v_from>interval '366 days' then
    return jsonb_build_object('ok',false,'error','invalid_metrics_window','external_side_effect',false);
  end if;

  select jsonb_build_object(
    'ok',true,
    'window',jsonb_build_object('from',v_from,'to',v_to),
    'assets',jsonb_build_object(
      'total',(select count(*) from public.marketing_assets a where a.created_at>=v_from and a.created_at<v_to),
      'approved',(select count(*) from public.marketing_assets a where a.reviewed_at>=v_from and a.reviewed_at<v_to and a.status='approved'),
      'by_mode',coalesce((select jsonb_object_agg(generation_mode,cnt) from (select generation_mode,count(*) cnt from public.marketing_assets where created_at>=v_from and created_at<v_to group by generation_mode) x),'{}'::jsonb),
      'estimated_cost_cents',coalesce((select sum(estimated_cost_cents) from public.marketing_assets where created_at>=v_from and created_at<v_to),0),
      'actual_cost_cents',coalesce((select sum(actual_cost_cents) from public.marketing_assets where created_at>=v_from and created_at<v_to),0)
    ),
    'publication_jobs',jsonb_build_object(
      'total',(select count(*) from public.marketing_publication_jobs j where j.created_at>=v_from and j.created_at<v_to),
      'published',(select count(*) from public.marketing_publication_jobs j where j.published_at>=v_from and j.published_at<v_to),
      'scheduled',(select count(*) from public.marketing_publication_jobs j where j.status='scheduled' and j.scheduled_for>=v_from and j.scheduled_for<v_to),
      'review_required',(select count(*) from public.marketing_publication_jobs j where j.status='review_required' and j.updated_at>=v_from and j.updated_at<v_to),
      'by_channel',coalesce((select jsonb_object_agg(channel,cnt) from (select channel,count(*) cnt from public.marketing_publication_jobs where created_at>=v_from and created_at<v_to group by channel) x),'{}'::jsonb),
      'by_status',coalesce((select jsonb_object_agg(status,cnt) from (select status,count(*) cnt from public.marketing_publication_jobs where created_at>=v_from and created_at<v_to group by status) x),'{}'::jsonb)
    ),
    'events',jsonb_build_object(
      'total',(select count(*) from public.marketing_events e where e.created_at>=v_from and e.created_at<v_to),
      'external_side_effects',(select count(*) from public.marketing_events e where e.created_at>=v_from and e.created_at<v_to and e.external_side_effect=true)
    ),
    'attribution',jsonb_build_object(
      'status','foundation_only',
      'note','Pedido/conversa atribuídos só entram após contrato determinístico de evidência; nenhum número é inferido.'
    ),
    'external_side_effect',false
  ) into v_payload;
  return v_payload;
end;
$$;

revoke all on function public.marketing_metrics_read_model_v1(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.marketing_metrics_read_model_v1(timestamptz,timestamptz) to service_role;

comment on function public.marketing_metrics_read_model_v1(timestamptz,timestamptz) is 'Marketing read model only; no provider call, publication or inferred attribution.';

commit;
