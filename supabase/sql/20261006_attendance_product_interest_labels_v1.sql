begin;

-- A label describes a purchased product category, never the customer's gender.
insert into public.attendance_labels_v1(name,color,sort_order,is_active)
select 'Comprou: cuidados femininos','#b04c8b',220,true
where not exists(
  select 1 from public.attendance_labels_v1
  where lower(btrim(name))=lower('Comprou: cuidados femininos') and is_active=true
);

alter table public.attendance_conversation_auto_labels_v1
  drop constraint if exists attendance_conversation_auto_labels_v1_source_check;
alter table public.attendance_conversation_auto_labels_v1
  add constraint attendance_conversation_auto_labels_v1_source_check
  check(source_kind in ('delivery_schedule','product_purchase'));

create or replace function public.ops2_attendance_refresh_product_interest_labels_v1(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_order public.orders%rowtype;
  v_label_id uuid;
  v_changed integer:=0;
  v_order_found boolean:=false;
  v_customer_id uuid;
  v_customer_ids uuid[]:='{}'::uuid[];
begin
  if p_order_id is null then return jsonb_build_object('ok',false,'error','order_required'); end if;
  select * into v_order from public.orders where id=p_order_id;
  v_order_found:=found;

  select coalesce(array_agg(distinct cv.customer_id) filter(where cv.customer_id is not null),'{}'::uuid[])
    into v_customer_ids
  from public.attendance_conversation_auto_labels_v1 a
  join public.conversations cv on cv.id=a.conversation_id
  where a.source_kind='product_purchase' and a.source_ref=p_order_id;
  if v_order_found and v_order.customer_id is not null then
    v_customer_ids:=array_append(v_customer_ids,v_order.customer_id);
  end if;
  if coalesce(array_length(v_customer_ids,1),0)=0 then
    perform pg_advisory_xact_lock(hashtextextended('attendance:product-interest:order:'||p_order_id::text,6802));
  else
    foreach v_customer_id in array v_customer_ids loop
      perform pg_advisory_xact_lock(hashtextextended('attendance:product-interest:'||v_customer_id::text,6802));
    end loop;
  end if;

  select id into v_label_id
  from public.attendance_labels_v1
  where lower(btrim(name))=lower('Comprou: cuidados femininos') and is_active=true
  order by created_at,id limit 1;

  delete from public.attendance_conversation_auto_labels_v1
  where source_kind='product_purchase' and source_ref=p_order_id;

  if v_order_found
     and v_order.customer_id is not null
     and v_order.status in ('confirmed','processing','ready','delivered')
     and v_order.cancelled_at is null
     and v_order.returned_at is null
     and v_label_id is not null then
    insert into public.attendance_conversation_auto_labels_v1(conversation_id,label_id,source_kind,source_ref)
    select distinct cv.id,v_label_id,'product_purchase',v_order.id
    from public.conversations cv
    where cv.customer_id=v_order.customer_id
      and exists(
        select 1
        from public.order_items oi
        join public.products p on p.id=oi.product_id
        where oi.order_id=v_order.id
          and lower(btrim(coalesce(p.customer_subsubcategory,'')))='cuidados femininos'
          and lower(coalesce(p.customer_taxonomy_confidence,''))='high'
          and lower(coalesce(p.customer_taxonomy_review_status,'')) in ('reviewed','auto_classified')
      )
    on conflict(conversation_id,label_id,source_kind,source_ref) do nothing;
    get diagnostics v_changed=row_count;
  end if;

  foreach v_customer_id in array v_customer_ids loop
    delete from public.attendance_conversation_labels_v1 current_label
    using public.conversations cv
    where cv.id=current_label.conversation_id and cv.customer_id=v_customer_id
      and not exists(select 1 from public.attendance_conversation_manual_labels_v1 m where m.conversation_id=current_label.conversation_id and m.label_id=current_label.label_id)
      and not exists(select 1 from public.attendance_conversation_auto_labels_v1 a where a.conversation_id=current_label.conversation_id and a.label_id=current_label.label_id);

    insert into public.attendance_conversation_labels_v1(conversation_id,label_id)
    select cv.id,owned.label_id
    from public.conversations cv
    cross join lateral (
      select label_id from public.attendance_conversation_manual_labels_v1 where conversation_id=cv.id
      union
      select label_id from public.attendance_conversation_auto_labels_v1 where conversation_id=cv.id
    ) owned
    where cv.customer_id=v_customer_id
    on conflict(conversation_id,label_id) do nothing;
  end loop;

  return jsonb_build_object('ok',true,'order_id',p_order_id,'labels_added',v_changed);
end;
$$;

create or replace function public.ops2_attendance_product_interest_order_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if tg_op='DELETE' then
    perform public.ops2_attendance_refresh_product_interest_labels_v1(old.id);
    return old;
  end if;
  perform public.ops2_attendance_refresh_product_interest_labels_v1(new.id);
  if tg_op='UPDATE' and old.id is distinct from new.id then
    perform public.ops2_attendance_refresh_product_interest_labels_v1(old.id);
  end if;
  return new;
end;
$$;

create or replace function public.ops2_attendance_product_interest_item_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if tg_op='DELETE' then
    perform public.ops2_attendance_refresh_product_interest_labels_v1(old.order_id);
    return old;
  end if;
  perform public.ops2_attendance_refresh_product_interest_labels_v1(new.order_id);
  if tg_op='UPDATE' and old.order_id is distinct from new.order_id then
    perform public.ops2_attendance_refresh_product_interest_labels_v1(old.order_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_attendance_product_interest_order_v1 on public.orders;
create trigger trg_attendance_product_interest_order_v1
after insert or update of status,customer_id,cancelled_at,returned_at or delete on public.orders
for each row execute function public.ops2_attendance_product_interest_order_trigger_v1();

drop trigger if exists trg_attendance_product_interest_items_v1 on public.order_items;
create trigger trg_attendance_product_interest_items_v1
after insert or update of order_id,product_id or delete on public.order_items
for each row execute function public.ops2_attendance_product_interest_item_trigger_v1();

-- Backfill labels from finalized purchases and their confirmed product taxonomy.
do $$
declare v_order_id uuid;
begin
  for v_order_id in
    select distinct o.id
    from public.orders o
    join public.order_items oi on oi.order_id=o.id
    join public.products p on p.id=oi.product_id
    where o.customer_id is not null
      and o.status in ('confirmed','processing','ready','delivered')
      and o.cancelled_at is null and o.returned_at is null
      and lower(btrim(coalesce(p.customer_subsubcategory,'')))='cuidados femininos'
      and lower(coalesce(p.customer_taxonomy_confidence,''))='high'
      and lower(coalesce(p.customer_taxonomy_review_status,'')) in ('reviewed','auto_classified')
  loop
    perform public.ops2_attendance_refresh_product_interest_labels_v1(v_order_id);
  end loop;
end;
$$;

revoke all on function public.ops2_attendance_refresh_product_interest_labels_v1(uuid) from public,anon,authenticated;
revoke all on function public.ops2_attendance_product_interest_order_trigger_v1() from public,anon,authenticated;
revoke all on function public.ops2_attendance_product_interest_item_trigger_v1() from public,anon,authenticated;
grant execute on function public.ops2_attendance_refresh_product_interest_labels_v1(uuid) to service_role;
grant execute on function public.ops2_attendance_product_interest_order_trigger_v1() to service_role;
grant execute on function public.ops2_attendance_product_interest_item_trigger_v1() to service_role;

commit;
