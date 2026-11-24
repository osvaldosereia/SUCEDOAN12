BEGIN;

ALTER TABLE public.marketing_campaigns_v1
  ADD COLUMN IF NOT EXISTS template_media jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.marketing_campaign_snapshots_v1
  ADD COLUMN IF NOT EXISTS template_media_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('marketing-campaign-media-v1','marketing-campaign-media-v1',true,16777216,ARRAY['image/jpeg','image/png','video/mp4'])
ON CONFLICT(id) DO UPDATE SET public=true,file_size_limit=16777216,allowed_mime_types=ARRAY['image/jpeg','image/png','video/mp4'];

CREATE TABLE IF NOT EXISTS public.marketing_legacy_base_attestations_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attestation_key text NOT NULL UNIQUE,
  scope text NOT NULL,
  asserted_at timestamptz NOT NULL,
  cutoff_at timestamptz NOT NULL,
  total_customer_count integer NOT NULL DEFAULT 0,
  active_customer_count integer NOT NULL DEFAULT 0,
  attested_customer_count integer NOT NULL DEFAULT 0,
  excluded_explicit_optout_count integer NOT NULL DEFAULT 0,
  excluded_invalid_phone_count integer NOT NULL DEFAULT 0,
  declaration text NOT NULL,
  recorded_by text NOT NULL DEFAULT 'merchant_owner',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.marketing_legacy_base_attestations_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketing_legacy_base_attestations_v1 FROM PUBLIC,anon,authenticated,service_role;

DO $attestation$
DECLARE
  v_cutoff timestamptz:=clock_timestamp();
  v_attestation_id uuid;
  v_total integer:=0;
  v_active integer:=0;
  v_attested integer:=0;
  v_optouts integer:=0;
  v_invalid integer:=0;
  v_statement text:='O proprietário da Dona Antônia declarou que os clientes cadastrados nesta base autorizaram e solicitaram o recebimento de ofertas pelo WhatsApp. As datas individuais originais de autorização não foram registradas.';
BEGIN
  CREATE TEMP TABLE _da_marketing_legacy_eligible_v1 ON COMMIT DROP AS
  SELECT c.id AS customer_id,c.primary_whatsapp_e164 AS phone_e164
  FROM public.customers c
  WHERE c.created_at<=v_cutoff
    AND c.is_active IS TRUE
    AND public.canonical_whatsapp_e164_br_v2(c.primary_whatsapp_e164) IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM (
        SELECT o.customer_id,o.phone_e164,o.occurred_at FROM public.marketing_optout_events_v1 o
        UNION ALL
        SELECT o.customer_id,o.phone_e164,o.occurred_at FROM public.marketing_optout_events_v2 o
        UNION ALL
        SELECT e.customer_id,e.phone_e164,e.occurred_at FROM public.marketing_consent_events_v1 e WHERE e.decision='opt_out'
      ) opted_out
      WHERE opted_out.occurred_at<=v_cutoff
        AND (opted_out.customer_id=c.id
          OR public.canonical_whatsapp_e164_br_v2(opted_out.phone_e164)=public.canonical_whatsapp_e164_br_v2(c.primary_whatsapp_e164))
    );

  SELECT count(*)::integer INTO v_total FROM public.customers c WHERE c.created_at<=v_cutoff;
  SELECT count(*)::integer INTO v_active FROM public.customers c WHERE c.created_at<=v_cutoff AND c.is_active IS TRUE;
  SELECT count(*)::integer INTO v_attested FROM _da_marketing_legacy_eligible_v1;
  SELECT count(*)::integer INTO v_invalid FROM public.customers c
    WHERE c.created_at<=v_cutoff AND c.is_active IS TRUE
      AND public.canonical_whatsapp_e164_br_v2(c.primary_whatsapp_e164) IS NULL;
  SELECT count(DISTINCT c.id)::integer INTO v_optouts
  FROM public.customers c
  WHERE c.created_at<=v_cutoff AND c.is_active IS TRUE
    AND public.canonical_whatsapp_e164_br_v2(c.primary_whatsapp_e164) IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM (
        SELECT o.customer_id,o.phone_e164,o.occurred_at FROM public.marketing_optout_events_v1 o
        UNION ALL
        SELECT o.customer_id,o.phone_e164,o.occurred_at FROM public.marketing_optout_events_v2 o
        UNION ALL
        SELECT e.customer_id,e.phone_e164,e.occurred_at FROM public.marketing_consent_events_v1 e WHERE e.decision='opt_out'
      ) opted_out
      WHERE opted_out.occurred_at<=v_cutoff
        AND (opted_out.customer_id=c.id
          OR public.canonical_whatsapp_e164_br_v2(opted_out.phone_e164)=public.canonical_whatsapp_e164_br_v2(c.primary_whatsapp_e164))
    );

  INSERT INTO public.marketing_legacy_base_attestations_v1(
    attestation_key,scope,asserted_at,cutoff_at,total_customer_count,active_customer_count,
    attested_customer_count,excluded_explicit_optout_count,excluded_invalid_phone_count,
    declaration,recorded_by,metadata
  ) VALUES (
    'dona_antonia_whatsapp_marketing_base_2026-11-24','whatsapp_marketing_offers',v_cutoff,v_cutoff,
    v_total,v_active,v_attested,v_optouts,v_invalid,v_statement,'merchant_owner',
    jsonb_build_object('source','owner_conversation_confirmation','original_individual_dates','not_recorded','timezone','America/Sao_Paulo')
  ) ON CONFLICT(attestation_key) DO NOTHING;

  SELECT id INTO v_attestation_id FROM public.marketing_legacy_base_attestations_v1
  WHERE attestation_key='dona_antonia_whatsapp_marketing_base_2026-11-24';

  PERFORM set_config('app.marketing_consent_rpc','1',true);
  UPDATE public.customers c
    SET marketing_opt_in=true,marketing_consent_updated_at=v_cutoff,updated_at=v_cutoff
  FROM _da_marketing_legacy_eligible_v1 eligible
  WHERE c.id=eligible.customer_id AND c.marketing_opt_in IS DISTINCT FROM true;

  INSERT INTO public.marketing_consent_events_v1(
    customer_id,phone_e164,decision,source,source_ref,source_event_key,
    consent_text_version,consent_text_snapshot,occurred_at,recorded_by,metadata
  )
  SELECT eligible.customer_id,eligible.phone_e164,'opt_in','merchant_owner_legacy_attestation',
    v_attestation_id::text,
    'merchant_owner_attestation:'||v_attestation_id::text||':'||eligible.customer_id::text,
    'merchant_owner_legacy_attestation_v1',v_statement,v_cutoff,'merchant_owner_attestation',
    jsonb_build_object('scope','whatsapp_marketing_offers','attestation_id',v_attestation_id,
      'attested_at',v_cutoff,'original_consent_date','not_recorded','owner_asserted_existing_customer_request',true)
  FROM _da_marketing_legacy_eligible_v1 eligible
  ON CONFLICT(source_event_key) DO NOTHING;

  DROP TABLE _da_marketing_legacy_eligible_v1;
END;
$attestation$;

CREATE OR REPLACE FUNCTION public.marketing_campaign_template_media_valid_v1(p_template_components jsonb, p_template_media jsonb, p_whatsapp_account_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_header_format text;
  v_media jsonb:=coalesce(p_template_media,'{}'::jsonb);
  v_type text;
  v_url text;
  v_mime text;
begin
  if jsonb_typeof(v_media)<>'object' then return false; end if;
  if exists(select 1 from jsonb_object_keys(v_media) as fields(key_name) where fields.key_name not in ('type','media_url','mime_type','file_name','whatsapp_account_id')) then return false; end if;
  select upper(coalesce(component->>'format','')) into v_header_format
  from jsonb_array_elements(
    CASE WHEN jsonb_typeof(coalesce(p_template_components,'[]'::jsonb))='array' THEN coalesce(p_template_components,'[]'::jsonb) ELSE '[]'::jsonb END
  ) component
  where upper(coalesce(component->>'type',''))='HEADER'
  limit 1;
  if coalesce(v_header_format,'') not in ('IMAGE','VIDEO') then
    return NOT EXISTS (select 1 from jsonb_object_keys(v_media));
  end if;
  v_type:=upper(coalesce(v_media->>'type',''));
  v_url:=coalesce(v_media->>'media_url','');
  v_mime:=lower(coalesce(v_media->>'mime_type',''));
  if v_type<>v_header_format
     or v_media->>'whatsapp_account_id' is distinct from p_whatsapp_account_id::text
     or length(coalesce(v_media->>'file_name',''))<1 or length(v_media->>'file_name')>240 then return false; end if;
  if v_header_format='IMAGE' then
    return v_mime in ('image/jpeg','image/png')
      and v_url ~ ('^https://ssbesxgaijknwsjbsbcz\.supabase\.co/storage/v1/object/public/marketing-campaign-media-v1/'||p_whatsapp_account_id::text||'/[0-9a-f-]{36}\.(jpg|jpeg|png)$');
  end if;
  return v_mime='video/mp4'
    and v_url ~ ('^https://ssbesxgaijknwsjbsbcz\.supabase\.co/storage/v1/object/public/marketing-campaign-media-v1/'||p_whatsapp_account_id::text||'/[0-9a-f-]{36}\.mp4$');
end;
$function$;

CREATE OR REPLACE FUNCTION public.marketing_campaign_set_template_media_v1(p_campaign_id uuid, p_expected_revision integer, p_template_media jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_campaign public.marketing_campaigns_v1%rowtype;
  v_template public.whatsapp_templates_v1%rowtype;
  v_media jsonb:=coalesce(p_template_media,'{}'::jsonb);
begin
  select * into v_campaign from public.marketing_campaigns_v1 where id=p_campaign_id for update;
  if not found then return jsonb_build_object('ok',false,'error','campaign_not_found'); end if;
  if v_campaign.status<>'draft' then return jsonb_build_object('ok',false,'error','campaign_not_draft'); end if;
  if v_campaign.revision<>p_expected_revision then return jsonb_build_object('ok',false,'error','revision_conflict','revision',v_campaign.revision); end if;
  if jsonb_typeof(v_media)<>'object' then return jsonb_build_object('ok',false,'error','campaign_media_invalid'); end if;
  if exists(select 1 from jsonb_object_keys(v_media) as fields(key_name) where fields.key_name not in ('type','media_url','mime_type','file_name','whatsapp_account_id')) then
    return jsonb_build_object('ok',false,'error','campaign_media_invalid');
  end if;
  select * into v_template from public.whatsapp_templates_v1
    where id=v_campaign.template_id and whatsapp_account_id=v_campaign.whatsapp_account_id
      and upper(category)='MARKETING' and upper(status)='APPROVED';
  if not found then return jsonb_build_object('ok',false,'error','template_not_sendable'); end if;
  if EXISTS(select 1 from jsonb_object_keys(v_media))
     and public.marketing_campaign_template_media_valid_v1(v_template.components,v_media,v_campaign.whatsapp_account_id) is not true then
    return jsonb_build_object('ok',false,'error','campaign_media_invalid');
  end if;
  if v_campaign.template_media is not distinct from v_media then
    return jsonb_build_object('ok',true,'campaign_id',v_campaign.id,'revision',v_campaign.revision,'semantic_changed',false);
  end if;
  update public.marketing_campaigns_v1
    set template_media=v_media,revision=revision+1,updated_at=now()
    where id=v_campaign.id
    returning * into v_campaign;
  return jsonb_build_object('ok',true,'campaign_id',v_campaign.id,'revision',v_campaign.revision,'semantic_changed',true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.marketing_campaign_snapshot_capture_media_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_media jsonb;
begin
  select coalesce(c.template_media,'{}'::jsonb) into v_media
  from public.marketing_campaigns_v1 c where c.id=new.campaign_id;
  new.template_media_snapshot:=coalesce(v_media,'{}'::jsonb);
  return new;
end;
$function$;

DROP TRIGGER IF EXISTS marketing_campaign_snapshot_capture_media_v1 ON public.marketing_campaign_snapshots_v1;
CREATE TRIGGER marketing_campaign_snapshot_capture_media_v1
BEFORE INSERT ON public.marketing_campaign_snapshots_v1
FOR EACH ROW EXECUTE FUNCTION public.marketing_campaign_snapshot_capture_media_v1();


CREATE OR REPLACE FUNCTION public.marketing_has_verified_campaign_consent_v1(p_customer_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.marketing_customer_consent_current_v1 current_consent
    join public.marketing_consent_events_v1 evidence
      on evidence.customer_id=current_consent.customer_id
     and evidence.decision='opt_in'
     and evidence.source='attendance_weekly_offers_consent'
     and evidence.recorded_by='customer_whatsapp'
    join public.marketing_weekly_consent_requests_v1 consent_request
      on consent_request.id::text=evidence.source_ref
     and consent_request.customer_id=current_consent.customer_id
     and consent_request.consent_event_id=evidence.id
     and consent_request.decision='opt_in'
     and consent_request.response_message_id::text=evidence.metadata->>'response_message_id'
     and consent_request.consent_text_version=evidence.consent_text_version
     and consent_request.consent_text_snapshot=evidence.consent_text_snapshot
     and consent_request.asked_at is not null
     and evidence.occurred_at>=consent_request.asked_at
    where current_consent.customer_id=p_customer_id
      and current_consent.consent_state='opt_in'
      and current_consent.marketing_opt_in=true
      and evidence.source_event_key='weekly_consent_response:'||consent_request.response_message_id::text
      and evidence.metadata->>'scope'='weekly_offers_coupons'
      and nullif(btrim(evidence.source_ref),'') is not null
      and nullif(btrim(evidence.consent_text_snapshot),'') is not null
      and public.canonical_whatsapp_e164_br_v2(current_consent.phone_e164)
          = public.canonical_whatsapp_e164_br_v2(evidence.phone_e164)
      and not exists (
        select 1 from public.marketing_consent_events_v1 opted_out
        where opted_out.decision='opt_out'
          and opted_out.occurred_at>=evidence.occurred_at
          and (opted_out.customer_id=evidence.customer_id
            or public.canonical_whatsapp_e164_br_v2(opted_out.phone_e164)=public.canonical_whatsapp_e164_br_v2(current_consent.phone_e164))
      )
      and not exists (
        select 1 from public.marketing_optout_events_v1 opted_out
        where opted_out.occurred_at>=evidence.occurred_at
          and (opted_out.customer_id=evidence.customer_id
            or public.canonical_whatsapp_e164_br_v2(opted_out.phone_e164)=public.canonical_whatsapp_e164_br_v2(current_consent.phone_e164))
      )
      and not exists (
        select 1 from public.marketing_optout_events_v2 opted_out
        where opted_out.occurred_at>=evidence.occurred_at
          and (opted_out.customer_id=evidence.customer_id
            or public.canonical_whatsapp_e164_br_v2(opted_out.phone_e164)=public.canonical_whatsapp_e164_br_v2(current_consent.phone_e164))
      )
  ) or exists (
    select 1
    from public.marketing_customer_consent_current_v1 current_consent
    join public.marketing_consent_events_v1 evidence on evidence.customer_id=current_consent.customer_id
      and evidence.decision='opt_in'
      and evidence.source='site_checkout_checkbox'
      and evidence.recorded_by='storefront_site_checkout'
      and evidence.consent_text_version='site_whatsapp_marketing_optin_v1'
      and evidence.source_event_key like 'checkout_optin:%'
      and evidence.metadata->>'channel'='site_checkout'
      and evidence.metadata->>'customer_checked'='true'
    where current_consent.customer_id=p_customer_id
      and current_consent.consent_state='opt_in'
      and current_consent.marketing_opt_in=true
      and nullif(btrim(evidence.consent_text_snapshot),'') is not null
      and public.canonical_whatsapp_e164_br_v2(evidence.phone_e164)
        = public.canonical_whatsapp_e164_br_v2(current_consent.phone_e164)
      and not exists (
        select 1 from public.marketing_consent_events_v1 o
        where o.decision='opt_out'
          and o.occurred_at>=evidence.occurred_at
          and (o.customer_id=p_customer_id
            or public.canonical_whatsapp_e164_br_v2(o.phone_e164)=public.canonical_whatsapp_e164_br_v2(current_consent.phone_e164))
      )
      and not exists (
        select 1 from public.marketing_optout_events_v1 o
        where o.occurred_at>=evidence.occurred_at
          and (o.customer_id=p_customer_id
            or public.canonical_whatsapp_e164_br_v2(o.phone_e164)=public.canonical_whatsapp_e164_br_v2(current_consent.phone_e164))
      )
      and not exists (
        select 1 from public.marketing_optout_events_v2 o
        where o.occurred_at>=evidence.occurred_at
          and (o.customer_id=p_customer_id
            or public.canonical_whatsapp_e164_br_v2(o.phone_e164)=public.canonical_whatsapp_e164_br_v2(current_consent.phone_e164))
      )

  ) OR EXISTS (
    select 1
    from public.marketing_customer_consent_current_v1 current_consent
    join public.marketing_consent_events_v1 evidence
      on evidence.customer_id=current_consent.customer_id
     and evidence.decision='opt_in'
     and evidence.source='merchant_owner_legacy_attestation'
     and evidence.recorded_by='merchant_owner_attestation'
    join public.marketing_legacy_base_attestations_v1 attestation
      on attestation.id::text=evidence.source_ref
     and attestation.scope='whatsapp_marketing_offers'
    where current_consent.customer_id=p_customer_id
      and current_consent.consent_state='opt_in'
      and current_consent.marketing_opt_in=true
      and evidence.source_event_key='merchant_owner_attestation:'||attestation.id::text||':'||current_consent.customer_id::text
      and public.canonical_whatsapp_e164_br_v2(evidence.phone_e164)
          = public.canonical_whatsapp_e164_br_v2(current_consent.phone_e164)
      and not exists (
        select 1 from public.marketing_consent_events_v1 opted_out
        where opted_out.decision='opt_out'
          and opted_out.occurred_at>=evidence.occurred_at
          and (opted_out.customer_id=current_consent.customer_id
            or public.canonical_whatsapp_e164_br_v2(opted_out.phone_e164)=public.canonical_whatsapp_e164_br_v2(current_consent.phone_e164))
      )
      and not exists (
        select 1 from public.marketing_optout_events_v1 opted_out
        where opted_out.occurred_at>=evidence.occurred_at
          and (opted_out.customer_id=current_consent.customer_id
            or public.canonical_whatsapp_e164_br_v2(opted_out.phone_e164)=public.canonical_whatsapp_e164_br_v2(current_consent.phone_e164))
      )
      and not exists (
        select 1 from public.marketing_optout_events_v2 opted_out
        where opted_out.occurred_at>=evidence.occurred_at
          and (opted_out.customer_id=current_consent.customer_id
            or public.canonical_whatsapp_e164_br_v2(opted_out.phone_e164)=public.canonical_whatsapp_e164_br_v2(current_consent.phone_e164))
      )
  );
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
  if public.marketing_campaign_template_media_valid_v1(v_template.components,v_campaign.template_media,v_campaign.whatsapp_account_id) is not true then
    return jsonb_build_object('ok',false,'error','template_media_required');
  end if;
  v_gate:=public.marketing_campaign_execution_gate_v1(v_campaign.whatsapp_account_id);
  if coalesce((v_gate->>'ok')::boolean,false) is not true then return v_gate; end if;
  update public.marketing_campaigns_v1 set status='scheduled',manual_batch_mode=false,scheduled_for=v_when,started_at=null,paused_at=null,
    completed_at=null,failed_at=null,execution_last_error=null,updated_at=now() where id=v_campaign.id;
  return jsonb_build_object('ok',true,'campaign_id',v_campaign.id,'revision',v_campaign.revision,
    'status','scheduled','scheduled_for',v_when,'snapshot_id',v_snapshot.id,'mode',v_gate->>'mode');
end;
$function$;


CREATE OR REPLACE FUNCTION public.marketing_campaign_detail_v1(p_campaign_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_campaign public.marketing_campaigns_v1%rowtype;
  v_snapshot jsonb;
begin
  select * into v_campaign from public.marketing_campaigns_v1 c where c.id=p_campaign_id;
  if not found then return jsonb_build_object('ok',false,'error','campaign_not_found'); end if;
  select jsonb_build_object(
    'id',s.id,'campaign_revision',s.campaign_revision,'snapshot_version',s.snapshot_version,
    'found_count',s.found_count,'eligible_count',s.eligible_count,'excluded_count',s.excluded_count,'created_at',s.created_at
  ) into v_snapshot
  from public.marketing_campaign_snapshots_v1 s
  where s.campaign_id=v_campaign.id and s.campaign_revision=v_campaign.revision
  order by s.snapshot_version desc limit 1;

  return jsonb_build_object(
    'ok',true,
    'campaign',jsonb_build_object(
      'id',v_campaign.id,'name',v_campaign.name,'whatsapp_account_id',v_campaign.whatsapp_account_id,
      'template_id',v_campaign.template_id,'status',v_campaign.status,'revision',v_campaign.revision,
      'filters',v_campaign.filters,'variable_values',v_campaign.variable_values,'deep_link',v_campaign.deep_link,
      'notes',v_campaign.notes,'template_name',v_campaign.template_name_snapshot,'template_language',v_campaign.template_language_snapshot,
      'template_category',v_campaign.template_category_snapshot,'template_components',v_campaign.template_components_snapshot,'template_media',v_campaign.template_media,
      'created_at',v_campaign.created_at,'updated_at',v_campaign.updated_at
    ),
    'snapshot',v_snapshot
  );
end;
$function$;


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
      'template_media_snapshot',v_snapshot.template_media_snapshot,
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
    'template_media_snapshot',v_snapshot.template_media_snapshot,'mode',v_gate->>'mode'
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.run_marketing_campaign_worker_tick_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_locked boolean:=false;
  v_active_accounts integer:=0;
  v_secret text;
  v_tick_id uuid:=gen_random_uuid();
  v_request_id bigint;
begin
  select pg_try_advisory_xact_lock(hashtextextended('marketing-campaign-worker-v1',0)) into v_locked;
  if coalesce(v_locked,false) is not true then
    return jsonb_build_object('ok',true,'no_op',true,'reason','tick_already_running');
  end if;

  select count(*)::integer into v_active_accounts
  from public.marketing_campaign_execution_runtime_v1 e
  join public.whatsapp_channel_runtime_v1 r on r.whatsapp_account_id=e.whatsapp_account_id
  where e.mode in ('canary','live')
    and r.campaigns_enabled is true
    and r.send_enabled is true
    and r.outbound_provider='meta';

  if v_active_accounts=0 then
    return jsonb_build_object('ok',true,'no_op',true,'reason','campaigns_disabled','active_accounts',0);
  end if;

  v_secret:=public.marketing_campaign_worker_internal_key_v1();
  if nullif(btrim(coalesce(v_secret,'')),'') is null then
    return jsonb_build_object('ok',false,'error','worker_auth_unavailable');
  end if;

  select net.http_post(
    url:='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/whatsapp-marketing-worker-v1',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'x-dona-antonia-marketing-worker-key',v_secret
    ),
    body:=jsonb_build_object('limit',1,'tick_id',v_tick_id::text),
    timeout_milliseconds:=55000
  ) into v_request_id;

  return jsonb_build_object(
    'ok',true,
    'no_op',false,
    'tick_id',v_tick_id,
    'request_id',v_request_id,
    'active_accounts',v_active_accounts
  );
end;
$function$;



CREATE TABLE IF NOT EXISTS public.marketing_campaign_send_slots_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL REFERENCES public.marketing_campaign_dispatches_v1(id),
  campaign_id uuid NOT NULL REFERENCES public.marketing_campaigns_v1(id),
  whatsapp_account_id uuid NOT NULL REFERENCES public.whatsapp_accounts(id),
  attempt_no integer NOT NULL CHECK (attempt_no > 0),
  local_send_date date NOT NULL,
  reserved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  started_at timestamptz,
  completed_at timestamptz,
  result_status text CHECK (result_status IS NULL OR result_status IN ('accepted','retry','failed','uncertain')),
  provider_message_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (dispatch_id,attempt_no)
);
CREATE INDEX IF NOT EXISTS marketing_campaign_send_slots_v1_day_idx
  ON public.marketing_campaign_send_slots_v1(local_send_date,reserved_at);
CREATE INDEX IF NOT EXISTS marketing_campaign_send_slots_v1_reserved_idx
  ON public.marketing_campaign_send_slots_v1(reserved_at DESC);
ALTER TABLE public.marketing_campaign_send_slots_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketing_campaign_send_slots_v1 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.marketing_next_send_window_at_v1(p_after timestamptz)
 RETURNS timestamptz
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_local timestamp without time zone:=coalesce(p_after,now()) AT TIME ZONE 'America/Sao_Paulo';
BEGIN
  IF extract(isodow FROM v_local)=7 THEN
    v_local:=(v_local::date+1)::timestamp+time '09:00';
  ELSIF v_local::time<time '09:00' THEN
    v_local:=v_local::date::timestamp+time '09:00';
  ELSIF v_local::time>=time '18:00' THEN
    v_local:=(v_local::date+1)::timestamp+time '09:00';
  END IF;
  WHILE extract(isodow FROM v_local)=7 LOOP
    v_local:=(v_local::date+1)::timestamp+time '09:00';
  END LOOP;
  RETURN v_local AT TIME ZONE 'America/Sao_Paulo';
END;
$function$;

CREATE OR REPLACE FUNCTION public.marketing_reserve_global_send_slot_v1(p_dispatch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_dispatch public.marketing_campaign_dispatches_v1%rowtype;
  v_candidate timestamptz;
  v_last timestamptz;
  v_now timestamptz:=clock_timestamp();
  v_local_date date;
  v_daily_count integer;
  v_attempt integer;
  v_existing public.marketing_campaign_send_slots_v1%rowtype;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('marketing-global-whatsapp-campaign-send-slot-v1',0));
  SELECT * INTO v_dispatch FROM public.marketing_campaign_dispatches_v1 WHERE id=p_dispatch_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','dispatch_not_found'); END IF;
  IF v_dispatch.status<>'claimed' THEN RETURN jsonb_build_object('ok',false,'error','dispatch_not_claimed'); END IF;

  v_attempt:=v_dispatch.attempt_count+1;
  SELECT * INTO v_existing FROM public.marketing_campaign_send_slots_v1
    WHERE dispatch_id=v_dispatch.id AND attempt_no=v_attempt FOR UPDATE;
  IF FOUND AND v_existing.started_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'error','attempt_already_started','already_started',true,'attempt_no',v_attempt);
  ELSIF v_existing.id IS NOT NULL THEN
    v_candidate:=public.marketing_next_send_window_at_v1(v_now);
    SELECT max(reserved_at) INTO v_last FROM public.marketing_campaign_send_slots_v1 WHERE id<>v_existing.id;
    IF v_last IS NOT NULL THEN
      v_candidate:=greatest(v_candidate,public.marketing_next_send_window_at_v1(v_last+interval '60 minutes'));
    END IF;
    LOOP
      v_local_date:=(v_candidate AT TIME ZONE 'America/Sao_Paulo')::date;
      SELECT count(*)::integer INTO v_daily_count FROM public.marketing_campaign_send_slots_v1
        WHERE local_send_date=v_local_date AND id<>v_existing.id;
      EXIT WHEN v_daily_count<8;
      v_candidate:=public.marketing_next_send_window_at_v1(((v_local_date+1)::timestamp+time '09:00') AT TIME ZONE 'America/Sao_Paulo');
    END LOOP;
    IF v_candidate>v_now THEN
      RETURN jsonb_build_object('ok',true,'allowed',false,'error','global_send_slot_deferred','retry_at',v_candidate);
    END IF;
    v_local_date:=(v_now AT TIME ZONE 'America/Sao_Paulo')::date;
    UPDATE public.marketing_campaign_send_slots_v1
      SET reserved_at=v_now,local_send_date=v_local_date,completed_at=NULL,result_status=NULL,provider_message_id=NULL
      WHERE id=v_existing.id
      RETURNING * INTO v_existing;
    RETURN jsonb_build_object('ok',true,'allowed',true,'attempt_no',v_attempt,'reserved_at',v_existing.reserved_at,'local_send_date',v_existing.local_send_date);
  END IF;

  v_candidate:=public.marketing_next_send_window_at_v1(v_now);
  SELECT max(reserved_at) INTO v_last FROM public.marketing_campaign_send_slots_v1;
  IF v_last IS NOT NULL THEN
    v_candidate:=greatest(v_candidate,public.marketing_next_send_window_at_v1(v_last+interval '60 minutes'));
  END IF;

  LOOP
    v_local_date:=(v_candidate AT TIME ZONE 'America/Sao_Paulo')::date;
    SELECT count(*)::integer INTO v_daily_count FROM public.marketing_campaign_send_slots_v1 WHERE local_send_date=v_local_date;
    EXIT WHEN v_daily_count<8;
    v_candidate:=public.marketing_next_send_window_at_v1(((v_local_date+1)::timestamp+time '09:00') AT TIME ZONE 'America/Sao_Paulo');
  END LOOP;

  IF v_candidate>v_now THEN
    RETURN jsonb_build_object('ok',true,'allowed',false,'error','global_send_slot_deferred','retry_at',v_candidate);
  END IF;

  INSERT INTO public.marketing_campaign_send_slots_v1(
    dispatch_id,campaign_id,whatsapp_account_id,attempt_no,local_send_date,reserved_at
  ) VALUES (
    v_dispatch.id,v_dispatch.campaign_id,v_dispatch.whatsapp_account_id,v_attempt,
    (v_now AT TIME ZONE 'America/Sao_Paulo')::date,v_now
  ) RETURNING * INTO v_existing;
  RETURN jsonb_build_object('ok',true,'allowed',true,'attempt_no',v_attempt,'reserved_at',v_existing.reserved_at,'local_send_date',v_existing.local_send_date);
END;
$function$;

CREATE OR REPLACE FUNCTION public.marketing_defer_dispatch_for_send_slot_v1(p_dispatch_id uuid,p_retry_at timestamptz)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_dispatch public.marketing_campaign_dispatches_v1%rowtype;
  v_retry timestamptz:=greatest(coalesce(p_retry_at,now()+interval '1 minute'),now()+interval '10 seconds');
BEGIN
  SELECT * INTO v_dispatch FROM public.marketing_campaign_dispatches_v1 WHERE id=p_dispatch_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','dispatch_not_found'); END IF;
  IF v_dispatch.status<>'claimed' THEN RETURN jsonb_build_object('ok',false,'error','dispatch_not_claimed'); END IF;
  UPDATE public.marketing_campaign_dispatches_v1
    SET status='retry',available_at=v_retry,claimed_at=NULL,last_error='global_send_slot_deferred',updated_at=now()
    WHERE id=v_dispatch.id;
  RETURN jsonb_build_object('ok',true,'dispatch_id',v_dispatch.id,'available_at',v_retry);
END;
$function$;

CREATE OR REPLACE FUNCTION public.marketing_mark_global_send_slot_started_v1(p_dispatch_id uuid,p_attempt_no integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_slot public.marketing_campaign_send_slots_v1%rowtype;
BEGIN
  SELECT * INTO v_slot FROM public.marketing_campaign_send_slots_v1
    WHERE dispatch_id=p_dispatch_id AND attempt_no=p_attempt_no FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','send_slot_not_reserved'); END IF;
  IF v_slot.started_at IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'error','attempt_already_started'); END IF;
  UPDATE public.marketing_campaign_send_slots_v1 SET started_at=clock_timestamp() WHERE id=v_slot.id;
  RETURN jsonb_build_object('ok',true,'dispatch_id',v_slot.dispatch_id,'attempt_no',v_slot.attempt_no);
END;
$function$;

CREATE OR REPLACE FUNCTION public.marketing_mark_global_send_slot_result_v1(p_dispatch_id uuid,p_attempt_no integer,p_status text,p_provider_message_id text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_status text:=lower(coalesce(p_status,''));
  v_slot public.marketing_campaign_send_slots_v1%rowtype;
BEGIN
  IF v_status NOT IN ('accepted','retry','failed','uncertain') THEN RETURN jsonb_build_object('ok',false,'error','invalid_send_slot_status'); END IF;
  UPDATE public.marketing_campaign_send_slots_v1
    SET completed_at=coalesce(completed_at,clock_timestamp()),result_status=v_status,
        provider_message_id=coalesce(nullif(p_provider_message_id,''),provider_message_id)
    WHERE dispatch_id=p_dispatch_id AND attempt_no=p_attempt_no
    RETURNING * INTO v_slot;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','send_slot_not_found'); END IF;
  RETURN jsonb_build_object('ok',true,'dispatch_id',v_slot.dispatch_id,'attempt_no',v_slot.attempt_no,'result_status',v_slot.result_status);
END;
$function$;


CREATE OR REPLACE FUNCTION public.marketing_claim_next_dispatch_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_campaign record;
  v_gate jsonb;
  v_items jsonb:='[]'::jsonb;
BEGIN
  FOR v_campaign IN
    SELECT c.id,c.whatsapp_account_id
    FROM public.marketing_campaigns_v1 c
    JOIN public.marketing_campaign_execution_runtime_v1 e ON e.whatsapp_account_id=c.whatsapp_account_id AND e.mode IN ('canary','live')
    JOIN public.whatsapp_channel_runtime_v1 r ON r.whatsapp_account_id=c.whatsapp_account_id
      AND r.campaigns_enabled IS TRUE AND r.send_enabled IS TRUE AND r.outbound_provider='meta'
    WHERE c.status='scheduled' AND coalesce(c.scheduled_for,now())<=now()
    ORDER BY c.scheduled_for,c.created_at,c.id
    FOR UPDATE OF c SKIP LOCKED
  LOOP
    v_gate:=public.marketing_campaign_execution_gate_v1(v_campaign.whatsapp_account_id);
    IF coalesce((v_gate->>'ok')::boolean,false) IS TRUE THEN
      PERFORM public.marketing_materialize_dispatches_v1(v_campaign.id);
      UPDATE public.marketing_campaigns_v1
        SET status='running',manual_batch_mode=false,started_at=coalesce(started_at,now()),updated_at=now()
        WHERE id=v_campaign.id AND status='scheduled';
    END IF;
  END LOOP;

  WITH picked AS (
    SELECT d.id
    FROM public.marketing_campaign_dispatches_v1 d
    JOIN public.marketing_campaigns_v1 c ON c.id=d.campaign_id AND c.status='running'
    JOIN public.marketing_campaign_execution_runtime_v1 e ON e.whatsapp_account_id=d.whatsapp_account_id AND e.mode IN ('canary','live')
    JOIN public.whatsapp_channel_runtime_v1 r ON r.whatsapp_account_id=d.whatsapp_account_id
      AND r.campaigns_enabled IS TRUE AND r.send_enabled IS TRUE AND r.outbound_provider='meta'
    WHERE d.status IN ('pending','retry') AND d.available_at<=now()
      AND coalesce(c.manual_batch_mode,false) IS FALSE
    ORDER BY c.scheduled_for,d.available_at,d.created_at,d.id
    LIMIT 1
    FOR UPDATE OF d SKIP LOCKED
  ), claimed AS (
    UPDATE public.marketing_campaign_dispatches_v1 d
      SET status='claimed',claimed_at=now(),last_error=NULL,updated_at=now()
    FROM picked p WHERE d.id=p.id
    RETURNING d.id,d.campaign_id,d.snapshot_id,d.customer_id,d.whatsapp_account_id,d.phone_e164,d.attempt_count,d.outbox_id
  )
  SELECT coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) INTO v_items FROM claimed;

  RETURN jsonb_build_object('ok',true,'items',v_items,'count',jsonb_array_length(v_items));
END;
$function$;

CREATE OR REPLACE FUNCTION public.marketing_resume_campaign_v1(p_campaign_id uuid,p_scheduled_for timestamptz DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_campaign public.marketing_campaigns_v1%rowtype;
  v_snapshot public.marketing_campaign_snapshots_v1%rowtype;
  v_template public.whatsapp_templates_v1%rowtype;
  v_gate jsonb;
  v_when timestamptz:=coalesce(p_scheduled_for,now());
BEGIN
  SELECT * INTO v_campaign FROM public.marketing_campaigns_v1 WHERE id=p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','campaign_not_found'); END IF;
  IF v_campaign.status<>'paused' THEN RETURN jsonb_build_object('ok',false,'error','campaign_invalid_transition','status',v_campaign.status); END IF;
  SELECT * INTO v_snapshot FROM public.marketing_campaign_snapshots_v1
    WHERE campaign_id=v_campaign.id AND campaign_revision=v_campaign.revision ORDER BY snapshot_version DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','snapshot_stale'); END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.marketing_campaign_snapshot_recipients_v1 r
    WHERE r.snapshot_id=v_snapshot.id AND r.campaign_id=v_campaign.id
      AND r.eligible_at_snapshot IS TRUE AND public.marketing_has_verified_campaign_consent_v1(r.customer_id)
  ) THEN RETURN jsonb_build_object('ok',false,'error','no_eligible_recipients'); END IF;
  SELECT * INTO v_template FROM public.whatsapp_templates_v1
    WHERE id=v_campaign.template_id AND whatsapp_account_id=v_campaign.whatsapp_account_id
      AND upper(category)='MARKETING' AND upper(status)='APPROVED';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','template_not_sendable'); END IF;
  IF public.marketing_campaign_template_media_valid_v1(v_template.components,v_campaign.template_media,v_campaign.whatsapp_account_id) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok',false,'error','template_media_required');
  END IF;
  v_gate:=public.marketing_campaign_execution_gate_v1(v_campaign.whatsapp_account_id);
  IF coalesce((v_gate->>'ok')::boolean,false) IS NOT TRUE THEN RETURN v_gate; END IF;
  UPDATE public.marketing_campaigns_v1
    SET status='scheduled',manual_batch_mode=false,scheduled_for=v_when,paused_at=NULL,completed_at=NULL,failed_at=NULL,
        execution_last_error=NULL,updated_at=now()
    WHERE id=v_campaign.id;
  RETURN jsonb_build_object('ok',true,'campaign_id',v_campaign.id,'revision',v_campaign.revision,'status','scheduled',
    'scheduled_for',v_when,'snapshot_id',v_snapshot.id,'mode',v_gate->>'mode');
END;
$function$;

REVOKE ALL ON FUNCTION public.marketing_campaign_template_media_valid_v1(jsonb,jsonb,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.marketing_campaign_set_template_media_v1(uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.marketing_campaign_snapshot_capture_media_v1() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.marketing_next_send_window_at_v1(timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.marketing_reserve_global_send_slot_v1(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.marketing_defer_dispatch_for_send_slot_v1(uuid,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.marketing_mark_global_send_slot_started_v1(uuid,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.marketing_mark_global_send_slot_result_v1(uuid,integer,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.marketing_claim_next_dispatch_v1() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.marketing_resume_campaign_v1(uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_campaign_template_media_valid_v1(jsonb,jsonb,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.marketing_campaign_set_template_media_v1(uuid,integer,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.marketing_next_send_window_at_v1(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.marketing_reserve_global_send_slot_v1(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.marketing_defer_dispatch_for_send_slot_v1(uuid,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.marketing_mark_global_send_slot_started_v1(uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.marketing_mark_global_send_slot_result_v1(uuid,integer,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.marketing_claim_next_dispatch_v1() TO service_role;
GRANT EXECUTE ON FUNCTION public.marketing_resume_campaign_v1(uuid,timestamptz) TO service_role;

COMMIT;
