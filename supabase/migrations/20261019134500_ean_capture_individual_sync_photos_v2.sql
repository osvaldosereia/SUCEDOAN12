-- Captura operacional EAN: sincronização por registro e foto de produto desconhecido.
alter table public.ean_capture_records_v1
 add column if not exists photo_path text,
 add column if not exists photo_captured_at timestamptz;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('ean-capture-unknown-photos','ean-capture-unknown-photos',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
 public=false,
 file_size_limit=excluded.file_size_limit,
 allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.ean_capture_sync_one_v1(p_capture_id uuid)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare v_row public.ean_capture_records_v1%rowtype;
begin
  update public.ean_capture_records_v1 e
  set matched_product_id=(
    select found.product_id
    from (
      select p.id as product_id,0 as priority
      from public.products p where p.gtin=e.ean
      union all
      select pi.product_id,1 as priority
      from public.product_identifiers pi
      where pi.identifier_value=e.ean and pi.status='confirmed'
    ) found order by found.priority,found.product_id limit 1
  ),synced_at=now(),updated_at=now()
  where e.id=p_capture_id
  returning * into v_row;
  if not found then return jsonb_build_object('ok',false,'error','leitura_nao_encontrada');end if;

  update public.ean_capture_records_v1
  set sync_status=case when v_row.matched_product_id is null then 'not_found' else 'found' end,
      updated_at=now()
  where id=v_row.id
  returning * into v_row;
  return jsonb_build_object(
    'ok',true,'row',jsonb_build_object(
       'id',v_row.id,'ean',v_row.ean,'quantity',v_row.quantity,
       'expires_on',v_row.expires_on,'sync_status',v_row.sync_status,
       'matched_product_id',v_row.matched_product_id,'photo_path',v_row.photo_path,
       'photo_captured_at',v_row.photo_captured_at,'created_at',v_row.created_at,
       'updated_at',v_row.updated_at,'synced_at',v_row.synced_at
    ),
    'summary',public.ean_capture_stats_v1()
  );
end;
$$;

revoke all on function public.ean_capture_sync_one_v1(uuid) from public,anon,authenticated;
grant execute on function public.ean_capture_sync_one_v1(uuid) to service_role;
comment on function public.ean_capture_sync_one_v1(uuid)
 is 'Sincroniza somente um registro EAN sem alterar products, estoque ou catálogo.';
