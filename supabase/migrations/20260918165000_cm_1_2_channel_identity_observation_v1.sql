-- CM-1.2: canonical WhatsApp channel account + observed identity support.
-- Does not enable outbound, AI, auto-reply or direct Meta transport.

insert into public.channel_accounts(
  channel,external_account_id,display_name,status,
  inbound_enabled,ai_enabled,auto_reply_enabled,outbound_enabled,canary_percent,
  capabilities,metadata,created_at,updated_at
)
select
  'whatsapp',
  coalesce(nullif(w.phone_number_id,''),w.slug),
  coalesce(w.display_name,w.slug,'WhatsApp'),
  case when w.is_active then 'active' else 'inactive' end,
  true,
  false,
  false,
  false,
  0,
  jsonb_build_object(
    'text',true,
    'audio',true,
    'image',true,
    'interactive',true,
    'templates',true,
    'flow',true,
    'provider_current','papoai',
    'meta_direct_ready',false
  ),
  jsonb_build_object(
    'legacy_whatsapp_account_slug',w.slug,
    'legacy_whatsapp_account_id',w.id,
    'waba_id',w.waba_id
  ),
  now(),now()
from public.whatsapp_accounts w
where w.is_active=true
on conflict(channel,external_account_id) do update set
  display_name=excluded.display_name,
  status=excluded.status,
  inbound_enabled=true,
  ai_enabled=false,
  auto_reply_enabled=false,
  outbound_enabled=false,
  canary_percent=0,
  capabilities=coalesce(public.channel_accounts.capabilities,'{}'::jsonb)||excluded.capabilities,
  metadata=coalesce(public.channel_accounts.metadata,'{}'::jsonb)||excluded.metadata,
  updated_at=now();

create or replace function public.observe_customer_channel_identity_v1(
  p_channel text,
  p_channel_account_id uuid,
  p_external_user_id text,
  p_identity_kind text default 'user',
  p_source text default 'system',
  p_evidence jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_channel text:=lower(btrim(coalesce(p_channel,'')));
  v_external text:=btrim(coalesce(p_external_user_id,''));
  v_kind text:=coalesce(nullif(lower(btrim(coalesce(p_identity_kind,''))),''),'user');
  v_source text:=coalesce(nullif(lower(btrim(coalesce(p_source,''))),''),'system');
  v_identity public.customer_channel_identities%rowtype;
begin
  if v_channel='' then raise exception 'channel_required'; end if;
  if v_external='' then raise exception 'external_user_id_required'; end if;
  if p_channel_account_id is not null and not exists(
    select 1 from public.channel_accounts where id=p_channel_account_id and channel=v_channel
  ) then
    raise exception 'channel_account_not_found';
  end if;

  select * into v_identity
  from public.customer_channel_identities i
  where i.channel=v_channel
    and i.external_user_id=v_external
    and (
      (p_channel_account_id is null and i.channel_account_id is null)
      or i.channel_account_id=p_channel_account_id
    )
  for update;

  if found then
    update public.customer_channel_identities
       set identity_kind=coalesce(nullif(v_kind,''),identity_kind),
           evidence=coalesce(evidence,'{}'::jsonb)
             || jsonb_build_object('last_observed_source',v_source,'last_observed_at',now())
             || coalesce(p_evidence,'{}'::jsonb),
           updated_at=now()
     where id=v_identity.id
     returning * into v_identity;
  else
    insert into public.customer_channel_identities(
      customer_id,channel,channel_account_id,external_user_id,identity_kind,
      verification_status,evidence,created_at,updated_at
    )
    values(
      null,v_channel,p_channel_account_id,v_external,v_kind,
      'observed',
      jsonb_build_object('first_observed_source',v_source,'first_observed_at',now())
        || coalesce(p_evidence,'{}'::jsonb),
      now(),now()
    )
    returning * into v_identity;
  end if;

  return jsonb_build_object(
    'ok',true,
    'identity_id',v_identity.id,
    'customer_id',v_identity.customer_id,
    'channel',v_identity.channel,
    'verification_status',v_identity.verification_status,
    'linked',v_identity.customer_id is not null
  );
end;
$function$;

revoke all on function public.observe_customer_channel_identity_v1(text,uuid,text,text,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.observe_customer_channel_identity_v1(text,uuid,text,text,text,jsonb)
  to service_role;
