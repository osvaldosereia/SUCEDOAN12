-- CM-1.2 Identity Resolver v1
-- Deterministic, provider-agnostic and fail-closed. It never links or merges customers by itself.

create table if not exists public.customer_identity_resolution_evaluations (
  id uuid primary key default gen_random_uuid(),
  decision text not null check (decision in ('matched','unmatched','conflict')),
  customer_id uuid references public.customers(id) on delete set null,
  confidence numeric(5,4) not null default 0 check (confidence between 0 and 1),
  confidence_scope text not null default 'identity_resolution_v1',
  source text not null default 'system',
  channel text,
  channel_account_id uuid references public.channel_accounts(id) on delete set null,
  input_fingerprint text not null check (input_fingerprint ~ '^[a-f0-9]{64}$'),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists customer_identity_resolution_customer_idx
  on public.customer_identity_resolution_evaluations(customer_id,created_at desc);
create index if not exists customer_identity_resolution_decision_idx
  on public.customer_identity_resolution_evaluations(decision,created_at desc);
create index if not exists customer_identity_resolution_fingerprint_idx
  on public.customer_identity_resolution_evaluations(input_fingerprint,created_at desc);

alter table public.customer_identity_resolution_evaluations enable row level security;
revoke all on table public.customer_identity_resolution_evaluations from public,anon,authenticated;
grant select,insert,update,delete on table public.customer_identity_resolution_evaluations to service_role;

create or replace function public.resolve_customer_identity_v1(
  p_phone text default null,
  p_document text default null,
  p_bling_contact_id bigint default null,
  p_channel text default null,
  p_channel_account_id uuid default null,
  p_external_user_id text default null,
  p_source text default 'system',
  p_persist boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_phone text:=public.canonical_phone_br(p_phone);
  v_variants text[]:=public.phone_variants_br(p_phone);
  v_document text:=nullif(regexp_replace(coalesce(p_document,''),'[^0-9]','','g'),'');
  v_channel text:=nullif(lower(btrim(coalesce(p_channel,''))),'');
  v_external text:=nullif(btrim(coalesce(p_external_user_id,'')),'');
  v_source text:=coalesce(nullif(lower(btrim(coalesce(p_source,''))),''),'system');
  v_doc_customer uuid;
  v_bling_customer uuid;
  v_channel_customer uuid;
  v_channel_verified boolean:=false;
  v_phone_customers uuid[];
  v_candidates uuid[];
  v_candidate uuid;
  v_candidate_count integer:=0;
  v_signal_count integer:=0;
  v_confidence numeric(5,4):=0;
  v_decision text:='unmatched';
  v_evidence jsonb:='{}'::jsonb;
  v_fingerprint text;
begin
  if v_document is not null and length(v_document) not in (11,14) then
    raise exception 'invalid_document';
  end if;

  if v_document is not null then
    select c.id into v_doc_customer
    from public.customers c
    where regexp_replace(coalesce(c.cpf_cnpj,''),'[^0-9]','','g')=v_document
    limit 1;
  end if;

  if p_bling_contact_id is not null then
    select c.id into v_bling_customer
    from public.customers c
    where c.bling_contact_id=p_bling_contact_id
    limit 1;
  end if;

  if v_channel is not null and v_external is not null then
    select i.customer_id,(i.verification_status='verified')
      into v_channel_customer,v_channel_verified
    from public.customer_channel_identities i
    where i.channel=v_channel
      and i.external_user_id=v_external
      and ((p_channel_account_id is null and i.channel_account_id is null) or i.channel_account_id=p_channel_account_id)
      and i.verification_status<>'revoked'
    order by case when i.verification_status='verified' then 0 else 1 end,i.updated_at desc
    limit 1;
  end if;

  if v_phone is not null and coalesce(array_length(v_variants,1),0)>0 then
    select array_agg(distinct x.customer_id order by x.customer_id)
      into v_phone_customers
    from (
      select c.id customer_id
      from public.customers c
      where public.normalize_phone_digits(c.primary_whatsapp_e164)=any(v_variants)
      union
      select cp.customer_id
      from public.customer_phones cp
      where public.normalize_phone_digits(cp.phone_e164)=any(v_variants)
    ) x;
  end if;

  select array_agg(distinct x order by x)
    into v_candidates
  from unnest(
    array_remove(array[v_doc_customer,v_bling_customer,v_channel_customer],null)
    || coalesce(v_phone_customers,'{}'::uuid[])
  ) x;

  v_candidate_count:=coalesce(array_length(v_candidates,1),0);

  if v_candidate_count=1 then
    v_candidate:=v_candidates[1];
    v_decision:='matched';

    if v_doc_customer=v_candidate then
      v_signal_count:=v_signal_count+1;
      v_confidence:=greatest(v_confidence,0.9900);
    end if;
    if v_bling_customer=v_candidate then
      v_signal_count:=v_signal_count+1;
      v_confidence:=greatest(v_confidence,0.9900);
    end if;
    if v_channel_customer=v_candidate then
      v_signal_count:=v_signal_count+1;
      v_confidence:=greatest(v_confidence,case when v_channel_verified then 1.0000 else 0.9000 end);
    end if;
    if v_phone_customers is not null and v_candidate=any(v_phone_customers) then
      v_signal_count:=v_signal_count+1;
      v_confidence:=greatest(v_confidence,0.9200);
    end if;
    if v_signal_count>=2 then v_confidence:=least(1.0000,v_confidence+0.0100); end if;
  elsif v_candidate_count>1 then
    v_decision:='conflict';
    v_confidence:=0;
  end if;

  v_evidence:=jsonb_build_object(
    'document_supplied',v_document is not null,
    'document_match',v_doc_customer is not null,
    'bling_supplied',p_bling_contact_id is not null,
    'bling_match',v_bling_customer is not null,
    'phone_supplied',v_phone is not null,
    'phone_match_count',coalesce(array_length(v_phone_customers,1),0),
    'channel_supplied',v_channel is not null and v_external is not null,
    'channel_match',v_channel_customer is not null,
    'channel_verified',v_channel_verified,
    'candidate_count',v_candidate_count,
    'signal_count',v_signal_count,
    'candidate_ids',coalesce(to_jsonb(v_candidates),'[]'::jsonb)
  );

  v_fingerprint:=encode(
    extensions.digest(
      concat_ws('|',
        coalesce(v_phone,''),
        coalesce(v_document,''),
        coalesce(p_bling_contact_id::text,''),
        coalesce(v_channel,''),
        coalesce(p_channel_account_id::text,''),
        coalesce(v_external,'')
      ),
      'sha256'
    ),
    'hex'
  );

  if p_persist then
    insert into public.customer_identity_resolution_evaluations(
      decision,customer_id,confidence,source,channel,channel_account_id,input_fingerprint,evidence
    )
    values(
      v_decision,case when v_decision='matched' then v_candidate else null end,
      v_confidence,v_source,v_channel,p_channel_account_id,v_fingerprint,v_evidence
    );
  end if;

  return jsonb_build_object(
    'ok',true,
    'decision',v_decision,
    'customer_id',case when v_decision='matched' then v_candidate else null end,
    'confidence',v_confidence,
    'confidence_scope','identity_resolution_v1',
    'evidence',v_evidence
  );
end;
$function$;

revoke all on function public.resolve_customer_identity_v1(text,text,bigint,text,uuid,text,text,boolean)
  from public,anon,authenticated;
grant execute on function public.resolve_customer_identity_v1(text,text,bigint,text,uuid,text,text,boolean)
  to service_role;

create or replace function public.identity_resolution_readiness_v1()
returns jsonb
language sql
security definer
set search_path=''
as $function$
  select jsonb_build_object(
    'resolver_version','v1',
    'customers',(select count(*) from public.customers),
    'phone_identities',(select count(*) from public.customer_phones),
    'channel_identities',(select count(*) from public.customer_channel_identities),
    'linked_channel_identities',(select count(*) from public.customer_channel_identities where customer_id is not null),
    'verified_channel_identities',(select count(*) from public.customer_channel_identities where verification_status='verified'),
    'evaluations',(select count(*) from public.customer_identity_resolution_evaluations),
    'conflicts',(select count(*) from public.customer_identity_resolution_evaluations where decision='conflict'),
    'mode','observe_only'
  )
$function$;

revoke all on function public.identity_resolution_readiness_v1() from public,anon,authenticated;
grant execute on function public.identity_resolution_readiness_v1() to service_role;
