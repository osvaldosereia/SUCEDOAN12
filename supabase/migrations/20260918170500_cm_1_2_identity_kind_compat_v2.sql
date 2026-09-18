-- CM-1.2 patch: normalize identity_kind to the canonical enum used by customer_channel_identities.

create or replace function public.observe_customer_channel_identity_v1(
  p_channel text,
  p_channel_account_id uuid,
  p_external_user_id text,
  p_identity_kind text default 'other',
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
  v_kind text:=coalesce(nullif(lower(btrim(coalesce(p_identity_kind,''))),''),'other');
  v_source text:=coalesce(nullif(lower(btrim(coalesce(p_source,''))),''),'system');
  v_identity public.customer_channel_identities%rowtype;
begin
  if v_channel='' then raise exception 'channel_required'; end if;
  if v_external='' then raise exception 'external_user_id_required'; end if;

  if v_channel='whatsapp' and v_kind in ('user','whatsapp_user') then v_kind:='e164'; end if;
  if v_kind not in ('e164','igsid','psid','web_subject','email','other') then
    raise exception 'invalid_identity_kind';
  end if;

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
       set identity_kind=v_kind,
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
    'identity_kind',v_identity.identity_kind,
    'verification_status',v_identity.verification_status,
    'linked',v_identity.customer_id is not null
  );
end;
$function$;

revoke all on function public.observe_customer_channel_identity_v1(text,uuid,text,text,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.observe_customer_channel_identity_v1(text,uuid,text,text,text,jsonb)
  to service_role;
