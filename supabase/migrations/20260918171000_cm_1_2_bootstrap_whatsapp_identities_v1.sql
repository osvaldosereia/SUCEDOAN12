-- CM-1.2: project canonical primary WhatsApp phones into the omnichannel identity graph.
-- This projection does not claim provider verification; status remains observed.

with wa as (
  select id
  from public.channel_accounts
  where channel='whatsapp' and status='active'
  order by updated_at desc
  limit 1
),
source_rows as (
  select
    c.id as customer_id,
    wa.id as channel_account_id,
    c.primary_whatsapp_e164 as external_user_id,
    cp.verified_at
  from public.customers c
  join public.customer_phones cp
    on cp.customer_id=c.id
   and cp.is_primary=true
   and public.normalize_phone_digits(cp.phone_e164)=public.normalize_phone_digits(c.primary_whatsapp_e164)
  cross join wa
  where c.primary_whatsapp_e164 is not null
)
insert into public.customer_channel_identities(
  customer_id,channel,channel_account_id,external_user_id,identity_kind,
  verification_status,verified_at,evidence,linked_at,created_at,updated_at
)
select
  s.customer_id,
  'whatsapp',
  s.channel_account_id,
  s.external_user_id,
  'e164',
  'observed',
  null,
  jsonb_build_object(
    'source','customer_primary_whatsapp_projection',
    'phone_record_verified_at',s.verified_at,
    'projected_at',now()
  ),
  now(),now(),now()
from source_rows s
on conflict(channel,channel_account_id,external_user_id) do update set
  customer_id=case
    when public.customer_channel_identities.customer_id is null then excluded.customer_id
    when public.customer_channel_identities.customer_id=excluded.customer_id then excluded.customer_id
    else public.customer_channel_identities.customer_id
  end,
  identity_kind='e164',
  evidence=coalesce(public.customer_channel_identities.evidence,'{}'::jsonb)||excluded.evidence,
  linked_at=coalesce(public.customer_channel_identities.linked_at,excluded.linked_at),
  updated_at=now();
