-- CM-1.2 v2: explicit match method and human-review state.

alter table public.customer_identity_resolution_evaluations
  add column if not exists match_method text,
  add column if not exists matched_at timestamptz,
  add column if not exists review_status text not null default 'not_required',
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid,
  add column if not exists review_notes text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='customer_identity_resolution_review_status_check'
      and conrelid='public.customer_identity_resolution_evaluations'::regclass
  ) then
    alter table public.customer_identity_resolution_evaluations
      add constraint customer_identity_resolution_review_status_check
      check (review_status in ('not_required','pending','approved','rejected'));
  end if;
end $$;

create index if not exists customer_identity_resolution_review_idx
  on public.customer_identity_resolution_evaluations(review_status,created_at desc);

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
  v_match_method text:='no_match';
  v_review_status text:='not_required';
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
      v_match_method:='document_exact';
    end if;
    if v_bling_customer=v_candidate then
      v_signal_count:=v_signal_count+1;
      v_confidence:=greatest(v_confidence,0.9900);
      v_match_method:=case when v_signal_count>1 then 'combined_strong' else 'bling_contact_id' end;
    end if;
    if v_channel_customer=v_candidate then
      v_signal_count:=v_signal_count+1;
      v_confidence:=greatest(v_confidence,case when v_channel_verified then 1.0000 else 0.9000 end);
      v_match_method:=case
        when v_channel_verified then 'channel_verified'
        when v_signal_count>1 then 'combined_channel'
        else 'channel_observed'
      end;
    end if;
    if v_phone_customers is not null and v_candidate=any(v_phone_customers) then
      v_signal_count:=v_signal_count+1;
      v_confidence:=greatest(v_confidence,0.9200);
      v_match_method:=case when v_signal_count>1 then 'combined_phone' else 'phone_unique' end;
    end if;
    if v_signal_count>=2 then v_confidence:=least(1.0000,v_confidence+0.0100); end if;
  elsif v_candidate_count>1 then
    v_decision:='conflict';
    v_confidence:=0;
    v_match_method:='conflicting_strong_signals';
    v_review_status:='pending';
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
      decision,customer_id,confidence,confidence_scope,source,channel,channel_account_id,
      input_fingerprint,evidence,match_method,matched_at,review_status
    )
    values(
      v_decision,case when v_decision='matched' then v_candidate else null end,
      v_confidence,'identity_resolution_v1',v_source,v_channel,p_channel_account_id,
      v_fingerprint,v_evidence,v_match_method,
      case when v_decision='matched' then now() else null end,
      v_review_status
    );
  end if;

  return jsonb_build_object(
    'ok',true,
    'decision',v_decision,
    'customer_id',case when v_decision='matched' then v_candidate else null end,
    'confidence',v_confidence,
    'confidence_scope','identity_resolution_v1',
    'match_method',v_match_method,
    'review_status',v_review_status,
    'evidence',v_evidence
  );
end;
$function$;

revoke all on function public.resolve_customer_identity_v1(text,text,bigint,text,uuid,text,text,boolean)
  from public,anon,authenticated;
grant execute on function public.resolve_customer_identity_v1(text,text,bigint,text,uuid,text,text,boolean)
  to service_role;
