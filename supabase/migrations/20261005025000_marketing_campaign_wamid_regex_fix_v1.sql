begin;

-- Fase F canary regression: WAMIDs reais começam por "wamid.".
-- A migration original usou duas barras no regex SQL e passou a exigir
-- uma barra invertida literal antes de qualquer caractere.
create or replace function public.marketing_finish_dispatch_v1(
  p_dispatch_id uuid,
  p_status text,
  p_provider_message_id text default null,
  p_last_error text default null,
  p_retry_after_seconds integer default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_dispatch public.marketing_campaign_dispatches_v1%rowtype;
  v_status text:=lower(btrim(coalesce(p_status,'')));
  v_attempt integer;
  v_retry_seconds integer;
  v_final text;
  v_has_fail boolean;
begin
  select * into v_dispatch from public.marketing_campaign_dispatches_v1 where id=p_dispatch_id for update;
  if not found then return jsonb_build_object('ok',false,'error','dispatch_not_found'); end if;
  if v_dispatch.status='accepted' and v_status='accepted' and v_dispatch.provider_message_id=p_provider_message_id then
    return jsonb_build_object('ok',true,'duplicate',true,'dispatch_id',v_dispatch.id,'status','accepted','provider_message_id',v_dispatch.provider_message_id);
  end if;
  if v_dispatch.status<>'claimed' then return jsonb_build_object('ok',false,'error','dispatch_not_claimed','status',v_dispatch.status); end if;
  if v_status not in ('accepted','retry','uncertain','failed','skipped') then return jsonb_build_object('ok',false,'error','invalid_dispatch_status'); end if;

  if v_status='skipped' then
    update public.marketing_campaign_dispatches_v1
      set status='skipped',skip_reason=coalesce(nullif(btrim(coalesce(p_last_error,'')),''),'worker_skipped'),claimed_at=null,updated_at=now()
      where id=v_dispatch.id returning * into v_dispatch;
  else
    v_attempt:=v_dispatch.attempt_count+1;
    if v_status='accepted' then
      if nullif(btrim(coalesce(p_provider_message_id,'')),'') is null or p_provider_message_id !~ '^wamid\.' then
        return jsonb_build_object('ok',false,'error','provider_message_id_required');
      end if;
      update public.marketing_campaign_dispatches_v1
        set status='accepted',attempt_count=v_attempt,provider_message_id=p_provider_message_id,last_error=null,claimed_at=null,updated_at=now()
        where id=v_dispatch.id returning * into v_dispatch;
      if v_dispatch.outbox_id is not null then
        update public.whatsapp_outbox_v1 set status='sent',attempt_count=v_attempt,provider_message_id=p_provider_message_id,last_error=null,sent_at=now(),updated_at=now()
        where id=v_dispatch.outbox_id;
      end if;
    elsif v_status='retry' and v_attempt<3 then
      v_retry_seconds:=least(greatest(coalesce(p_retry_after_seconds,30),1),3600);
      update public.marketing_campaign_dispatches_v1
        set status='retry',attempt_count=v_attempt,available_at=now()+make_interval(secs=>v_retry_seconds),claimed_at=null,last_error=nullif(btrim(coalesce(p_last_error,'')),''),updated_at=now()
        where id=v_dispatch.id returning * into v_dispatch;
      if v_dispatch.outbox_id is not null then
        update public.whatsapp_outbox_v1 set status='queued',attempt_count=v_attempt,available_at=v_dispatch.available_at,claimed_at=null,last_error=v_dispatch.last_error,updated_at=now()
        where id=v_dispatch.outbox_id;
      end if;
    else
      v_final:=case when v_status='uncertain' then 'uncertain' else 'failed' end;
      update public.marketing_campaign_dispatches_v1
        set status=v_final,attempt_count=v_attempt,claimed_at=null,last_error=nullif(btrim(coalesce(p_last_error,'')),''),updated_at=now()
        where id=v_dispatch.id returning * into v_dispatch;
      if v_dispatch.outbox_id is not null then
        update public.whatsapp_outbox_v1 set status='failed',attempt_count=v_attempt,last_error=coalesce(v_dispatch.last_error,v_final),updated_at=now()
        where id=v_dispatch.outbox_id;
      end if;
    end if;
  end if;

  if v_dispatch.status in ('accepted','skipped','uncertain','failed')
     and not exists(select 1 from public.marketing_campaign_dispatches_v1 d where d.campaign_id=v_dispatch.campaign_id and d.status in ('pending','claimed','retry')) then
    select exists(select 1 from public.marketing_campaign_dispatches_v1 d where d.campaign_id=v_dispatch.campaign_id and d.status in ('uncertain','failed')) into v_has_fail;
    update public.marketing_campaigns_v1
      set status=case when v_has_fail then 'failed' else 'completed' end,
          completed_at=case when v_has_fail then completed_at else now() end,
          failed_at=case when v_has_fail then now() else failed_at end,
          execution_last_error=case when v_has_fail then 'dispatch_failure' else null end,
          updated_at=now()
      where id=v_dispatch.campaign_id and status in ('running','scheduled','paused');
  end if;

  return jsonb_build_object('ok',true,'dispatch_id',v_dispatch.id,'status',v_dispatch.status,'attempt_count',v_dispatch.attempt_count,
    'provider_message_id',v_dispatch.provider_message_id,'available_at',v_dispatch.available_at);
end;
$$;
revoke all on function public.marketing_finish_dispatch_v1(uuid,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.marketing_finish_dispatch_v1(uuid,text,text,text,integer) to service_role;

commit;
