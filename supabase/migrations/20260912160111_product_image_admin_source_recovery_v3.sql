create or replace function public.promote_current_product_image_source_on_retry_v1()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if new.image_ai_status='pending'
     and old.image_ai_status='source_rejected'
     and new.image_source_url is null
     and new.image_url is not null
     and (
       new.image_url like 'https://raw.githubusercontent.com/osvaldosereia/SUCEDOAN12/%'
       or new.image_url like 'https://ssbesxgaijknwsjbsbcz.supabase.co/%'
       or new.image_url like 'https://donaantonia.com.br/%'
       or new.image_url like 'https://www.donaantonia.com.br/%'
     ) then
    new.image_source_url:=new.image_url;
    new.image_source_origin:='admin_retry_current_image_auto';
    new.image_source_verified_at:=null;
    new.image_source_sha256:=null;
    new.image_source_width:=null;
    new.image_source_height:=null;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_promote_current_product_image_source_on_retry_v1 on public.products;
create trigger trg_promote_current_product_image_source_on_retry_v1
before update of image_ai_status on public.products
for each row execute function public.promote_current_product_image_source_on_retry_v1();
