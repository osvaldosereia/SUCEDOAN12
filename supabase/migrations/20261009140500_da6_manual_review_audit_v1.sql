-- DA6: revisão manual de contagens fotográficas, com trilha auditável.
-- Nenhuma instrução grava estoque canônico ou chama o Bling.
create table if not exists public.inventory_label_review_events (
 id uuid primary key default gen_random_uuid(),
 photo_id uuid not null references public.inventory_label_photos(id),
 count_id uuid not null references public.inventory_label_counts(id),
 actor_id uuid not null references auth.users(id),
 decision text not null check(decision in ('approve','reject','correct')),
 old_quantity smallint,
 new_quantity smallint,
 old_status text,
 new_status text not null check(new_status in ('approved','rejected')),
 note text not null default '',
 created_at timestamptz not null default now(),
 constraint inventory_label_review_events_old_quantity_check check(old_quantity between 0 and 99),
 constraint inventory_label_review_events_new_quantity_check check(new_quantity between 0 and 99)
);
alter table public.inventory_label_review_events enable row level security;
revoke all on public.inventory_label_review_events from public,anon,authenticated;
grant select,insert on public.inventory_label_review_events to service_role;
create index if not exists inventory_label_review_events_photo_date_idx
 on public.inventory_label_review_events(photo_id,created_at desc);

create or replace function public.inventory_label_review_count_v1(
 p_photo_id uuid,p_slot smallint,p_decision text,p_quantity smallint,
 p_actor_id uuid,p_note text default ''
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_photo record;v_count public.inventory_label_counts%rowtype;
 v_product uuid;v_serial text;v_qty smallint;v_status text;
begin
 if auth.role() is distinct from 'service_role' then
   raise exception 'service_role_only' using errcode='42501';
 end if;
 if p_photo_id is null or p_actor_id is null or p_slot is null or p_slot not between 1 and 6
   or p_decision not in ('approve','reject','correct') then
   raise exception 'invalid_review_request' using errcode='22023';
 end if;
 if length(coalesce(p_note,''))>500 then
   raise exception 'note_too_long' using errcode='22023';
 end if;
 if p_decision='correct' and (p_quantity is null or p_quantity not between 0 and 99 or length(btrim(coalesce(p_note,'')))<5) then
   raise exception 'correction_requires_quantity_and_reason' using errcode='22023';
 end if;
 if p_decision<>'correct' and p_quantity is not null then
   raise exception 'quantity_only_allowed_for_correction' using errcode='22023';
 end if;
 if not exists(select 1 from public.admin_users where user_id=p_actor_id and is_active=true and role<>'viewer') then
   raise exception 'admin_forbidden' using errcode='42501';
 end if;
 select id,batch_id,created_by,status,parsed
 into v_photo
 from public.inventory_label_photos where id=p_photo_id for update;
 if not found or v_photo.created_by is distinct from p_actor_id then
   raise exception 'photo_not_owned' using errcode='42501';
 end if;
 if v_photo.status not in ('complete','needs_review') then
   raise exception 'photo_not_decoded' using errcode='22023';
 end if;
 if coalesce(v_photo.parsed->>'product_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}
   or coalesce(v_photo.parsed->>'label_serial','') !~ '^[0-9A-F]{10,20}$' then
   raise exception 'photo_identity_not_verified' using errcode='22023';
 end if;
 v_product:=(v_photo.parsed->>'product_id')::uuid;
 v_serial:=v_photo.parsed->>'label_serial';
 select * into v_count from public.inventory_label_counts
  where label_serial=v_serial and balance_slot=p_slot for update;
 if found and (v_count.photo_id<>p_photo_id or v_count.product_id<>v_product) then
   raise exception 'slot_belongs_to_another_photo' using errcode='23505';
 end if;
 if found and v_count.status<>'pending_review' then
   if (p_decision='approve' and v_count.status='approved' and p_quantity is null)
     or (p_decision='reject' and v_count.status='rejected' and p_quantity is null) then
      return jsonb_build_object('ok',true,'unchanged',true,'count_id',v_count.id,'status',v_count.status);
   end if;
   raise exception 'review_already_final' using errcode='23505';
 end if;
 if not found then
   if p_decision<>'correct' then
     raise exception 'marking_needs_manual_quantity' using errcode='22023';
   end if;
   -- Não permitir criar balanço em slot inativo: apenas erros OMR registrados.
   if not exists(
     select 1 from jsonb_array_elements(
       case when jsonb_typeof(v_photo.parsed->'errors')='array'
         then v_photo.parsed->'errors' else '[]'::jsonb end
     ) as issue(value) where issue.value->>'slot'=p_slot::text
   ) then
     raise exception 'slot_has_no_unresolved_mark' using errcode='22023';
   end if;
   insert into public.inventory_label_counts
     (photo_id,batch_id,product_id,label_serial,balance_slot,quantity,confidence,status,reviewed_at,reviewed_by)
   values(p_photo_id,v_photo.batch_id,v_product,v_serial,p_slot,p_quantity,0,'approved',now(),p_actor_id)
   returning * into v_count;
   v_qty:=null;v_status:=null;
 else
   if p_decision='approve' and p_quantity is not null and p_quantity<>v_count.quantity then
     raise exception 'approve_cannot_change_quantity' using errcode='22023';
   end if;
   v_qty:=v_count.quantity;v_status:=v_count.status;
   update public.inventory_label_counts set
     quantity=case when p_decision='correct' then p_quantity else quantity end,
     status=case when p_decision='reject' then 'rejected' else 'approved' end,
     reviewed_at=now(),reviewed_by=p_actor_id
   where id=v_count.id returning * into v_count;
 end if;
 insert into public.inventory_label_review_events
   (photo_id,count_id,actor_id,decision,old_quantity,new_quantity,old_status,new_status,note)
 values(p_photo_id,v_count.id,p_actor_id,p_decision,v_qty,
  case when p_decision='reject' then null else v_count.quantity end,
  v_status,v_count.status,left(coalesce(p_note,''),500));
 return jsonb_build_object('ok',true,'unchanged',false,'count_id',v_count.id,
  'slot',v_count.balance_slot,'quantity',v_count.quantity,'status',v_count.status);
end $$;
revoke all on function public.inventory_label_review_count_v1(uuid,smallint,text,smallint,uuid,text) from public,anon,authenticated;
grant execute on function public.inventory_label_review_count_v1(uuid,smallint,text,smallint,uuid,text) to service_role;

   or coalesce(v_photo.parsed->>'label_serial','') !~ '^[0-9A-F]{10,20}$' then
   raise exception 'photo_identity_not_verified' using errcode='22023';
 end if;
 v_product:=(v_photo.parsed->>'product_id')::uuid;
 v_serial:=v_photo.parsed->>'label_serial';
 select * into v_count from public.inventory_label_counts
  where label_serial=v_serial and balance_slot=p_slot for update;
 if found and (v_count.photo_id<>p_photo_id or v_count.product_id<>v_product) then
   raise exception 'slot_belongs_to_another_photo' using errcode='23505';
 end if;
 if found and v_count.status<>'pending_review' then
   if (p_decision='approve' and v_count.status='approved' and p_quantity is null)
     or (p_decision='reject' and v_count.status='rejected' and p_quantity is null) then
      return jsonb_build_object('ok',true,'unchanged',true,'count_id',v_count.id,'status',v_count.status);
   end if;
   raise exception 'review_already_final' using errcode='23505';
 end if;
 if not found then
   if p_decision<>'correct' then
     raise exception 'marking_needs_manual_quantity' using errcode='22023';
   end if;
   -- Não permitir criar balanço em slot inativo: apenas erros OMR registrados.
   if not exists(
     select 1 from jsonb_array_elements(
       case when jsonb_typeof(v_photo.parsed->'errors')='array'
         then v_photo.parsed->'errors' else '[]'::jsonb end
     ) as issue(value) where issue.value->>'slot'=p_slot::text
   ) then
     raise exception 'slot_has_no_unresolved_mark' using errcode='22023';
   end if;
   insert into public.inventory_label_counts
     (photo_id,batch_id,product_id,label_serial,balance_slot,quantity,confidence,status,reviewed_at,reviewed_by)
   values(p_photo_id,v_photo.batch_id,v_product,v_serial,p_slot,p_quantity,0,'approved',now(),p_actor_id)
   returning * into v_count;
   v_qty:=null;v_status:=null;
 else
   if p_decision='approve' and p_quantity is not null and p_quantity<>v_count.quantity then
     raise exception 'approve_cannot_change_quantity' using errcode='22023';
   end if;
   v_qty:=v_count.quantity;v_status:=v_count.status;
   update public.inventory_label_counts set
     quantity=case when p_decision='correct' then p_quantity else quantity end,
     status=case when p_decision='reject' then 'rejected' else 'approved' end,
     reviewed_at=now(),reviewed_by=p_actor_id
   where id=v_count.id returning * into v_count;
 end if;
 insert into public.inventory_label_review_events
   (photo_id,count_id,actor_id,decision,old_quantity,new_quantity,old_status,new_status,note)
 values(p_photo_id,v_count.id,p_actor_id,p_decision,v_qty,
  case when p_decision='reject' then null else v_count.quantity end,
  v_status,v_count.status,left(coalesce(p_note,''),500));
 return jsonb_build_object('ok',true,'unchanged',false,'count_id',v_count.id,
  'slot',v_count.balance_slot,'quantity',v_count.quantity,'status',v_count.status);
end $$;
revoke all on function public.inventory_label_review_count_v1(uuid,smallint,text,smallint,uuid,text) from public,anon,authenticated;
grant execute on function public.inventory_label_review_count_v1(uuid,smallint,text,smallint,uuid,text) to service_role;
