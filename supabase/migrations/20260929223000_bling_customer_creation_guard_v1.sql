-- Bling customer creation guard v1
-- Prevents incomplete local customers from being created as new Bling contacts.
-- Existing Bling links and safe CPF/CNPJ reconciliation remain available.

create or replace function public.bling_hub_customer_creation_guard_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_customer record;
  v_reasons text[] := array[]::text[];
begin
  if new.domain <> 'customer'
     or new.operation <> 'sync_customer'
     or new.payload->'allow_create' is distinct from 'true'::jsonb then
    return new;
  end if;

  select c.id,c.name,c.cpf_cnpj,c.primary_whatsapp_e164,c.bling_contact_id
    into v_customer
  from public.customers c
  where c.id::text = new.source_id;

  -- A contact already linked to Bling does not need creation authorization.
  if found and coalesce(v_customer.bling_contact_id,0) > 0 then
    return new;
  end if;

  if not found then
    v_reasons := array_append(v_reasons,'customer_not_found');
  else
    if nullif(btrim(coalesce(v_customer.name,'')),'') is null then
      v_reasons := array_append(v_reasons,'name_required');
    end if;
    if not public.ops2_valid_cpf_cnpj_v1(v_customer.cpf_cnpj) then
      v_reasons := array_append(v_reasons,'valid_document_required');
    end if;
    if public.canonical_whatsapp_e164_br_v2(v_customer.primary_whatsapp_e164) is null then
      v_reasons := array_append(v_reasons,'valid_phone_required');
    end if;
  end if;

  if cardinality(v_reasons) > 0 then
    new.payload := jsonb_set(coalesce(new.payload,'{}'::jsonb),'{allow_create}','false'::jsonb,true);
    new.payload := jsonb_set(
      new.payload,
      '{creation_guard}',
      jsonb_build_object(
        'blocked',true,
        'reasons',to_jsonb(v_reasons),
        'guard','bling_hub_customer_creation_guard_v1',
        'checked_at',to_jsonb(clock_timestamp())
      ),
      true
    );
  else
    new.payload := jsonb_set(
      coalesce(new.payload,'{}'::jsonb),
      '{creation_guard}',
      jsonb_build_object(
        'blocked',false,
        'reasons','[]'::jsonb,
        'guard','bling_hub_customer_creation_guard_v1',
        'checked_at',to_jsonb(clock_timestamp())
      ),
      true
    );
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_bling_hub_customer_creation_guard_v1 on public.bling_hub_jobs_v2;
create trigger trg_bling_hub_customer_creation_guard_v1
before insert or update of payload,domain,operation,source_id
on public.bling_hub_jobs_v2
for each row
execute function public.bling_hub_customer_creation_guard_v1();
