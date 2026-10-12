-- Auto-sync Meta Utility template approval, without owner opening Marketing.
-- Remote sync operation only checks templates and creates missing versioned templates idempotently.
-- After both are APPROVED, this job stops itself. It also times out after 10 days.
create or replace function public.ops4_meta_postorder_approval_tick_v1()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_approved integer;
  v_dispatch jsonb;
  v_job text:='donaantonia-meta-postorder-v3-approval';
begin
  select count(distinct t.name)::integer into v_approved
  from public.whatsapp_templates_v1 t
  join public.whatsapp_accounts a on a.id=t.whatsapp_account_id
  where (a.slug='dona-antonia-0975' and t.name='pedidoorganizadosite0975v3'
         or a.slug='dona-antonia-1018' and t.name='pedidoorganizadosite1018v3')
    and t.status='APPROVED' and t.language='pt_BR';
  if v_approved=2 or now()>=timestamptz '2026-10-22 00:00:00+00' then
    if exists (select 1 from cron.job j where j.jobname=v_job and j.active) then
      perform cron.unschedule(v_job);
    end if;
    return jsonb_build_object('ok',true,'complete',v_approved=2,'approved_channels',v_approved,'stopped',true);
  end if;
  v_dispatch:=public.ops4_dispatch_meta_postorder_v1();
  return jsonb_build_object('ok',true,'approved_channels',v_approved,'dispatch',v_dispatch);
end;$$;
revoke all on function public.ops4_meta_postorder_approval_tick_v1() from public,anon,authenticated;
grant execute on function public.ops4_meta_postorder_approval_tick_v1() to service_role;

select cron.schedule(
  'donaantonia-meta-postorder-v3-approval',
  '10 * * * *',
  'select public.ops4_meta_postorder_approval_tick_v1();'
);