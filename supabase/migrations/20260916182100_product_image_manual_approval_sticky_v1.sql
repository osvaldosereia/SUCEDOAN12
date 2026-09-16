-- Preserve explicit Admin approval of a generated image.
-- The Sunburst safety trigger must block automatic publication while validation is
-- disabled, but it must not undo a candidate that an Admin has explicitly resolved.

create or replace function public.product_image_force_manual_approval_v1()
returns trigger
language plpgsql
set search_path = 'public'
as $$
begin
  -- Explicit manual approval is a persistent resolved state. Keep it intact on the
  -- approval update itself and on later maintenance updates that touch image fields.
  if new.image_ai_status = 'completed'
     and new.image_ai_manual_review_required is not true
     and new.image_ai_manual_resolved_at is not null
     and nullif(btrim(coalesce(new.image_ai_url, '')), '') is not null
     and new.image_url is not distinct from new.image_ai_url then
    return new;
  end if;

  if new.image_ai_model = 'gpt-image-2.5-sunburst'
     and new.image_ai_status = 'completed'
     and coalesce(new.image_ai_validation->>'validator_disabled','false') = 'true' then
    new.image_url := old.image_url;
    new.image_original_url := old.image_original_url;
    new.image_ai_status := 'needs_reprocess';
    new.image_ai_manual_review_required := true;
    new.image_ai_manual_review_reason := 'generated_pending_manual_approval';
    new.image_ai_manual_requested_at := now();
    new.image_ai_manual_resolved_at := null;
  end if;
  return new;
end;
$$;

-- Repair approvals already made by the Admin that were reverted by the old trigger.
-- The timestamp equality identifies the approval write; later automatic maintenance
-- changed updated_at but did not change the Admin/processed timestamps.
update public.products p
set image_url = p.image_ai_url,
    image_ai_status = 'completed',
    image_ai_error = null,
    image_ai_manual_review_required = false,
    image_ai_manual_review_reason = null,
    image_ai_manual_prompt = null,
    image_ai_manual_requested_at = null,
    image_ai_manual_requested_by = null,
    image_ai_manual_resolved_at = coalesce(p.image_ai_admin_updated_at, p.image_ai_processed_at, now()),
    image_ai_processed_at = coalesce(p.image_ai_processed_at, p.image_ai_admin_updated_at, now()),
    image_ai_ignored = false,
    updated_at = now()
where p.image_ai_admin_note = 'Aprovada em massa pelo Admin'
  and p.image_ai_status = 'needs_reprocess'
  and p.image_ai_manual_review_required = true
  and p.image_ai_manual_review_reason = 'generated_pending_manual_approval'
  and p.image_ai_model = 'gpt-image-2.5-sunburst'
  and coalesce(p.image_ai_validation->>'validator_disabled','false') = 'true'
  and nullif(btrim(coalesce(p.image_ai_url, '')), '') is not null
  and p.image_ai_admin_updated_at is not null
  and p.image_ai_processed_at is not null
  and abs(extract(epoch from (p.image_ai_admin_updated_at - p.image_ai_processed_at))) < 1;
