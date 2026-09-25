-- Dona Antônia Operations 2.0
-- Atualiza o shadow mirror diretamente a partir de virtual_stock.updated já autenticado.
-- Não altera products.stock, não escreve no Bling e não exige cron/worker.

create or replace function public.ops2_apply_virtual_stock_webhook_shadow_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled boolean := false;
  v_complex boolean := false;
  v_bling_id bigint;
  v_product_id uuid;
  v_link_count integer := 0;
  v_physical numeric;
  v_virtual numeric;
  v_deposits jsonb := '{}'::jsonb;
  v_apply jsonb;
begin
  if new.signature_verified is not true
     or new.resource <> 'virtual_stock'
     or new.action <> 'updated'
     or new.status not in ('held','received') then
    return new;
  end if;

  select coalesce(
    (jsonb_extract_path_text(r.metadata,'ops2_stock_mirror_events_enabled'))::boolean,
    false
  )
    into v_enabled
    from public.bling_hub_runtime_v2 r
   where r.id=1;

  if v_enabled is not true then
    return new;
  end if;

  v_complex := coalesce((new.payload->'data'->>'vinculoComplexo')::boolean,false);
  if v_complex then
    update public.bling_webhook_inbox_v2
       set result=jsonb_build_object(
             'classification','virtual_stock_complex_requires_api',
             'shadow_only',true,
             'local_product_stock_mutation',false,
             'external_write',false
           ),
           updated_at=now()
     where event_id=new.event_id;
    return new;
  end if;

  begin
    v_bling_id := nullif(new.provider_entity_id,'')::bigint;
  exception when others then
    v_bling_id := null;
  end;

  if coalesce(v_bling_id,0)<=0 then
    update public.bling_webhook_inbox_v2
       set status='review_required',
           last_error='virtual_stock_provider_id_missing',
           result=jsonb_build_object(
             'classification','virtual_stock_provider_id_missing',
             'shadow_only',true,
             'local_product_stock_mutation',false,
             'external_write',false
           ),
           processed_at=now(),
           updated_at=now()
     where event_id=new.event_id;
    return new;
  end if;

  select count(*),min(l.source_id::uuid)
    into v_link_count,v_product_id
    from public.bling_hub_entity_links_v2 l
   where l.source_system='vitrine_qx'
     and l.entity_type='product'
     and l.status='matched'
     and l.bling_id=v_bling_id;

  if v_link_count<>1 or v_product_id is null then
    update public.bling_webhook_inbox_v2
       set status='review_required',
           last_error='virtual_stock_product_not_safely_linked',
           result=jsonb_build_object(
             'classification','virtual_stock_product_not_safely_linked',
             'bling_product_id',v_bling_id,
             'match_count',v_link_count,
             'shadow_only',true,
             'local_product_stock_mutation',false,
             'external_write',false
           ),
           processed_at=now(),
           updated_at=now()
     where event_id=new.event_id;
    return new;
  end if;

  begin
    v_physical := (new.payload->'data'->>'saldoFisicoTotal')::numeric;
    v_virtual := (new.payload->'data'->>'saldoVirtualTotal')::numeric;
  exception when others then
    v_physical := null;
    v_virtual := null;
  end;

  if v_physical is null or v_virtual is null then
    update public.bling_webhook_inbox_v2
       set status='review_required',
           last_error='virtual_stock_totals_invalid',
           result=jsonb_build_object(
             'classification','virtual_stock_totals_invalid',
             'bling_product_id',v_bling_id,
             'product_id',v_product_id,
             'shadow_only',true,
             'local_product_stock_mutation',false,
             'external_write',false
           ),
           processed_at=now(),
           updated_at=now()
     where event_id=new.event_id;
    return new;
  end if;

  select coalesce(
           jsonb_object_agg(
             d.item->>'id',
             jsonb_build_object(
               'physical',coalesce((d.item->>'saldoFisico')::numeric,0),
               'virtual',coalesce((d.item->>'saldoVirtual')::numeric,0)
             )
           ),
           '{}'::jsonb
         )
    into v_deposits
    from jsonb_array_elements(coalesce(new.payload->'data'->'depositos','[]'::jsonb)) as d(item)
   where nullif(d.item->>'id','') is not null;

  select public.apply_bling_stock_mirror_event_v2(
    v_product_id,
    v_bling_id,
    v_physical,
    v_virtual,
    v_deposits,
    coalesce(new.event_at,new.received_at,now()),
    new.event_id,
    'virtual_stock',
    true
  )
    into v_apply;

  update public.bling_webhook_inbox_v2
     set status='processed',
         result=jsonb_build_object(
           'classification',
             case when coalesce((v_apply->>'applied')::boolean,false)
               then 'stock_mirror_applied'
               else 'stock_mirror_stale_ignored'
             end,
           'mirror',v_apply,
           'shadow_only',true,
           'local_product_stock_mutation',false,
           'external_write',false,
           'processing_path','db_trigger'
         ),
         last_error=null,
         processed_at=now(),
         updated_at=now()
   where event_id=new.event_id;

  insert into public.bling_hub_audit_v2(
    event_type,severity,domain,source_system,source_id,details
  )
  values(
    'virtual_stock_shadow_applied',
    'info',
    'stock',
    'bling_webhook',
    new.event_id,
    jsonb_build_object(
      'bling_product_id',v_bling_id,
      'product_id',v_product_id,
      'physical_total',v_physical,
      'virtual_total',v_virtual,
      'stale_ignored',coalesce((v_apply->>'stale_ignored')::boolean,false),
      'shadow_only',true,
      'local_product_stock_mutation',false,
      'external_write',false
    )
  );

  return new;
end
$$;

drop trigger if exists trg_ops2_virtual_stock_shadow_v1
  on public.bling_webhook_inbox_v2;

create trigger trg_ops2_virtual_stock_shadow_v1
after insert on public.bling_webhook_inbox_v2
for each row
execute function public.ops2_apply_virtual_stock_webhook_shadow_v1();

comment on function public.ops2_apply_virtual_stock_webhook_shadow_v1() is
'Operations 2.0: aplica virtual_stock.updated assinado ao shadow mirror quando ops2_stock_mirror_events_enabled=true. Nunca altera products.stock.';

revoke all on function public.ops2_apply_virtual_stock_webhook_shadow_v1() from public,anon,authenticated;
