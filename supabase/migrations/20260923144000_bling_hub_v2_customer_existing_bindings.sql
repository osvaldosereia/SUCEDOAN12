-- Register existing canonical customer → Bling bindings without any external write.
-- Customers without both bling_contact_id and document remain review_required.
with existing_links as (
  insert into public.bling_hub_entity_links_v2(
    source_system,entity_type,source_id,bling_id,identity_kind,identity_value,status,last_verified_at,metadata,updated_at
  )
  select
    'canonical_ssbes','customer',c.id::text,c.bling_contact_id,
    case when nullif(regexp_replace(coalesce(c.cpf_cnpj,''),'[^0-9]','','g'),'') is not null then 'cpf_cnpj' else 'existing_bling_contact_id' end,
    coalesce(nullif(regexp_replace(coalesce(c.cpf_cnpj,''),'[^0-9]','','g'),''),c.bling_contact_id::text),
    'matched',now(),
    jsonb_build_object('method','existing_bling_contact_id','readonly',true,'name',coalesce(c.name,'')),
    now()
  from public.customers c
  where c.bling_contact_id is not null
  on conflict(source_system,entity_type,source_id) do update set
    bling_id=excluded.bling_id,identity_kind=excluded.identity_kind,identity_value=excluded.identity_value,
    status='matched',last_verified_at=now(),metadata=excluded.metadata,updated_at=now()
  returning source_id
),
needs_review as (
  insert into public.bling_hub_entity_links_v2(
    source_system,entity_type,source_id,bling_id,identity_kind,identity_value,status,last_verified_at,metadata,updated_at
  )
  select
    'canonical_ssbes','customer',c.id::text,null,null,null,'review_required',now(),
    jsonb_build_object('reason','missing_document_and_bling_id','readonly',true,'name',coalesce(c.name,'')),
    now()
  from public.customers c
  where c.bling_contact_id is null
    and nullif(regexp_replace(coalesce(c.cpf_cnpj,''),'[^0-9]','','g'),'') is null
  on conflict(source_system,entity_type,source_id) do update set
    bling_id=null,status='review_required',last_verified_at=now(),metadata=excluded.metadata,updated_at=now()
  returning source_id
)
insert into public.bling_hub_audit_v2(event_type,severity,domain,details)
select 'customer_existing_bindings_registered','info','customer',
       jsonb_build_object(
         'matched',(select count(*) from existing_links),
         'review_required',(select count(*) from needs_review),
         'external_write',false,
         'make_used',false
       );
