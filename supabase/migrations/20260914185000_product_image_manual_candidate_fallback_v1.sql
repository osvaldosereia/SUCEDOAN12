-- Manual-review rows must expose a selectable candidate whenever the Admin
-- is already showing a trusted source/current image. This keeps the UI and
-- the approval backend consistent without touching the live catalog image
-- until the admin explicitly approves it.

create or replace function public.product_image_manual_candidate_fallback_v1()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  candidate text;
begin
  if new.image_ai_manual_review_required is distinct from true then
    return new;
  end if;

  if coalesce(new.image_ai_status, '') = 'processing' then
    return new;
  end if;

  if nullif(btrim(coalesce(new.image_ai_url, '')), '') is not null then
    return new;
  end if;

  candidate := coalesce(
    nullif(btrim(coalesce(new.image_source_url, '')), ''),
    nullif(btrim(coalesce(new.image_url, '')), '')
  );

  if candidate is null then
    return new;
  end if;

  if candidate !~* '^https://(raw\.githubusercontent\.com|ssbesxgaijknwsjbsbcz\.supabase\.co|donaantonia\.com\.br|www\.donaantonia\.com\.br)/' then
    return new;
  end if;

  new.image_ai_url := candidate;
  if position('Candidata manual: imagem de referência/atual' in coalesce(new.image_ai_admin_note, '')) = 0 then
    new.image_ai_admin_note := concat_ws(
      ' · ',
      nullif(btrim(coalesce(new.image_ai_admin_note, '')), ''),
      'Candidata manual: imagem de referência/atual'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists product_image_manual_candidate_fallback_v1 on public.products;
create trigger product_image_manual_candidate_fallback_v1
before insert or update of image_ai_manual_review_required, image_ai_status, image_ai_url, image_source_url, image_url
on public.products
for each row
execute function public.product_image_manual_candidate_fallback_v1();

-- Repair existing review rows that are visible in the Admin but were not
-- selectable because image_ai_url was empty. Processing rows stay protected.
update public.products
set
  image_ai_url = coalesce(
    nullif(btrim(coalesce(image_source_url, '')), ''),
    nullif(btrim(coalesce(image_url, '')), '')
  ),
  image_ai_admin_note = case
    when position('Candidata manual: imagem de referência/atual' in coalesce(image_ai_admin_note, '')) > 0
      then image_ai_admin_note
    else concat_ws(
      ' · ',
      nullif(btrim(coalesce(image_ai_admin_note, '')), ''),
      'Candidata manual: imagem de referência/atual'
    )
  end
where image_ai_manual_review_required is true
  and coalesce(image_ai_status, '') <> 'processing'
  and nullif(btrim(coalesce(image_ai_url, '')), '') is null
  and coalesce(
    nullif(btrim(coalesce(image_source_url, '')), ''),
    nullif(btrim(coalesce(image_url, '')), '')
  ) ~* '^https://(raw\.githubusercontent\.com|ssbesxgaijknwsjbsbcz\.supabase\.co|donaantonia\.com\.br|www\.donaantonia\.com\.br)/';
