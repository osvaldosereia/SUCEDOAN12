-- Recupera consentimentos reais do WhatsApp sobrepostos por atestados posteriores.
-- Requer prova individual, telefone original igual ao atual e nenhum opt-out posterior.
create or replace function public.marketing_has_verified_campaign_consent_v1(p_customer_id uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $function$
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
        where opted_out.customer_id=evidence.customer_id
          and opted_out.decision='opt_out'
          and opted_out.occurred_at>=evidence.occurred_at
      )
  );
$function$;
