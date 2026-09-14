-- Defense in depth: force_individual may exist only for an explicit Admin request.

create or replace function public.product_image_manual_individual_guard_v1()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_allowed boolean:=false;
begin
  if coalesce(new.force_individual,false)=false then return new; end if;

  select coalesce(p.is_active,false)
         and coalesce(p.image_ai_ignored,false)=false
         and coalesce(p.image_ai_manual_review_required,false)=true
         and p.image_ai_manual_requested_at is not null
         and nullif(btrim(p.image_ai_manual_prompt),'') is not null
    into v_allowed
    from public.products p
   where p.id=new.product_id;

  if not coalesce(v_allowed,false) then
    new.force_individual:=false;
    if new.status in ('pending','error') then
      new.status:='rejected';
      new.processed_at:=coalesce(new.processed_at,now());
    end if;
    new.error_message:=coalesce(nullif(new.error_message,''),'individual_requires_explicit_admin_request');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_product_image_manual_individual_guard_v1 on public.product_image_jobs;
create trigger trg_product_image_manual_individual_guard_v1
before insert or update of force_individual,status,product_id on public.product_image_jobs
for each row execute function public.product_image_manual_individual_guard_v1();

-- Clean any legacy residue already in the queue.
update public.product_image_jobs j
set force_individual=false,
    status=case when j.status in ('pending','error') then 'rejected' else j.status end,
    error_message=coalesce(nullif(j.error_message,''),'individual_requires_explicit_admin_request'),
    processed_at=case when j.status in ('pending','error') then coalesce(j.processed_at,now()) else j.processed_at end,
    updated_at=now()
from public.products p
where p.id=j.product_id
  and j.force_individual=true
  and not (
    p.is_active=true
    and coalesce(p.image_ai_ignored,false)=false
    and coalesce(p.image_ai_manual_review_required,false)=true
    and p.image_ai_manual_requested_at is not null
    and nullif(btrim(p.image_ai_manual_prompt),'') is not null
  );
