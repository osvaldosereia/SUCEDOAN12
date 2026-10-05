-- Persist the attribution included in signed Meta WhatsApp webhooks and expose
-- the evidence-backed service/free-entry deadlines to the Admin context.

create or replace function public.capture_whatsapp_conversation_attribution_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_received_at timestamptz;
  v_referral jsonb := '{}'::jsonb;
  v_source_type text;
  v_key text;
  v_value text;
  v_limit integer;
begin
  if new.direction <> 'inbound' then
    return new;
  end if;

  v_received_at := coalesce(new.received_at, new.created_at, now());
  if new.provider = 'meta' and jsonb_typeof(new.metadata->'referral') = 'object' then
    v_source_type := lower(btrim(coalesce(new.metadata->'referral'->>'source_type','')));
    if v_source_type in ('ad','post') then
      v_referral := jsonb_build_object('source_type',v_source_type);
    end if;
    foreach v_key in array array['source_id','source_url','headline','body','media_type','ctwa_clid'] loop
      v_limit := case v_key
        when 'source_id' then 256
        when 'source_url' then 2048
        when 'headline' then 500
        when 'body' then 2000
        when 'media_type' then 40
        when 'ctwa_clid' then 512
      end;
      if jsonb_typeof(new.metadata->'referral'->v_key) = 'string' then
        v_value := left(btrim(regexp_replace(new.metadata->'referral'->>v_key,'[[:cntrl:]]',' ','g')),v_limit);
        if v_value <> '' then
          v_referral := v_referral || jsonb_build_object(v_key,v_value);
        end if;
      end if;
    end loop;
  end if;

  update public.conversations c
  set source = case v_source_type when 'ad' then 'meta_ad' when 'post' then 'organic' else c.source end,
      referral = case when v_referral <> '{}'::jsonb then v_referral else c.referral end,
      last_inbound_at = greatest(coalesce(c.last_inbound_at,'-infinity'::timestamptz),v_received_at),
      service_window_expires_at = greatest(coalesce(c.service_window_expires_at,'-infinity'::timestamptz),v_received_at + interval '24 hours')
  where c.id = new.conversation_id
    and c.whatsapp_account_id = new.whatsapp_account_id;

  return new;
end;
$$;

revoke all on function public.capture_whatsapp_conversation_attribution_v1() from public, anon, authenticated;

drop trigger if exists whatsapp_messages_capture_conversation_attribution_v1 on public.whatsapp_messages_v1;
create trigger whatsapp_messages_capture_conversation_attribution_v1
after insert or update of metadata, direction, received_at
on public.whatsapp_messages_v1
for each row
execute function public.capture_whatsapp_conversation_attribution_v1();

create or replace function public.capture_meta_free_entry_window_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_epoch_text text;
  v_epoch numeric;
  v_expiration timestamptz;
begin
  if new.provider <> 'meta'
    or coalesce(new.payload #>> '{conversation,origin,type}','') <> 'referral_conversion' then
    return new;
  end if;

  v_epoch_text := new.payload #>> '{conversation,expiration_timestamp}';
  if v_epoch_text !~ '^[0-9]{10,13}$' then
    return new;
  end if;

  v_epoch := v_epoch_text::numeric;
  if v_epoch between 1000000000 and 4102444800 then
    v_expiration := to_timestamp(v_epoch::double precision);
  elsif v_epoch between 1000000000000 and 4102444800000 then
    v_expiration := to_timestamp((v_epoch / 1000)::double precision);
  else
    return new;
  end if;

  update public.conversations c
  set free_entry_window_expires_at = greatest(
        coalesce(c.free_entry_window_expires_at,'-infinity'::timestamptz),
        v_expiration
      )
  from public.whatsapp_messages_v1 m
  where m.id = new.message_id
    and m.provider = 'meta'
    and m.conversation_id = c.id
    and m.whatsapp_account_id = c.whatsapp_account_id;

  return new;
end;
$$;

revoke all on function public.capture_meta_free_entry_window_v1() from public, anon, authenticated;

drop trigger if exists whatsapp_status_capture_meta_free_entry_window_v1 on public.whatsapp_message_status_events_v1;
create trigger whatsapp_status_capture_meta_free_entry_window_v1
after insert on public.whatsapp_message_status_events_v1
for each row
execute function public.capture_meta_free_entry_window_v1();

create or replace function public.ops2_admin_attendance_context_v1(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_conversation public.conversations%rowtype;
  v_customer public.customers%rowtype;
  v_address public.customer_addresses%rowtype;
  v_registration jsonb;
  v_orders jsonb := '[]'::jsonb;
  v_doc_digits text;
  v_doc_masked text;
begin
  select c.* into v_conversation from public.conversations c where c.id=p_conversation_id;
  if not found then return jsonb_build_object('ok',false,'error','conversation_not_found'); end if;

  if v_conversation.customer_id is not null then
    select cu.* into v_customer from public.customers cu where cu.id=v_conversation.customer_id;
    if found then
      select a.* into v_address from public.customer_addresses a
      where a.customer_id=v_customer.id and a.is_active=true
      order by a.is_default desc,a.updated_at desc,a.created_at desc,a.id limit 1;
      v_registration:=public.ops2_customer_registration_state_v1(v_customer.id);
      v_doc_digits:=regexp_replace(coalesce(v_customer.cpf_cnpj,''),'\D','','g');
      if length(v_doc_digits)>=4 then
        v_doc_masked:=repeat('*',greatest(0,length(v_doc_digits)-4))||right(v_doc_digits,4);
      else
        v_doc_masked:=null;
      end if;

      with recent_orders as (
        select o.* from public.orders o where o.customer_id=v_customer.id
        order by coalesce(o.confirmed_at,o.created_at) desc,o.created_at desc,o.id desc limit 10
      )
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',o.id,'order_number',o.order_number,'status',o.status,'total',o.total,
        'currency',btrim(o.currency),'source',o.source,'payment_method',o.payment_method,
        'confirmed_at',o.confirmed_at,'created_at',o.created_at,
        'items',coalesce((select jsonb_agg(jsonb_build_object(
          'id',oi.id,'product_id',oi.product_id,'name',oi.name_snapshot,'sku',oi.sku_snapshot,
          'quantity',oi.quantity,'unit_price',oi.unit_price,'line_total',oi.line_total
        ) order by oi.created_at,oi.id) from public.order_items oi where oi.order_id=o.id),'[]'::jsonb)
      ) order by coalesce(o.confirmed_at,o.created_at) desc,o.created_at desc,o.id desc),'[]'::jsonb)
      into v_orders from recent_orders o;
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,
    'conversation',jsonb_build_object(
      'id',v_conversation.id,'whatsapp_account_id',v_conversation.whatsapp_account_id,
      'customer_id',v_conversation.customer_id,
      'phone_e164',public.canonical_whatsapp_e164_br_v2(v_conversation.wa_contact_e164),
      'status',v_conversation.status,'mode',v_conversation.mode,
      'human_required',coalesce(v_conversation.human_required,false),
      'last_inbound_at',v_conversation.last_inbound_at,'last_outbound_at',v_conversation.last_outbound_at,
      'source',v_conversation.source,'referral',v_conversation.referral,
      'service_window_expires_at',v_conversation.service_window_expires_at,
      'free_entry_window_expires_at',v_conversation.free_entry_window_expires_at
    ),
    'customer',case when v_customer.id is null then null else jsonb_build_object(
      'id',v_customer.id,'name',v_customer.name,
      'phone_e164',public.canonical_whatsapp_e164_br_v2(v_customer.primary_whatsapp_e164),
      'masked_document',v_doc_masked,'marketing_opt_in',v_customer.marketing_opt_in,
      'marketing_consent_updated_at',v_customer.marketing_consent_updated_at,
      'last_order_at',v_customer.last_order_at,'order_count',coalesce(v_customer.order_count,0),
      'lifetime_value',coalesce(v_customer.lifetime_value,0),'preferred_reply',v_customer.preferred_reply
    ) end,
    'address',case when v_address.id is null then null else jsonb_build_object(
      'id',v_address.id,'label',v_address.label,'street',v_address.street,'number',v_address.number,
      'complement',v_address.complement,'neighborhood',v_address.neighborhood,'city',v_address.city,
      'state',v_address.state,'postal_code',v_address.postal_code,'reference',v_address.reference,
      'is_default',v_address.is_default
    ) end,
    'registration',v_registration,'orders',v_orders
  );
end;
$$;

revoke all on function public.ops2_admin_attendance_context_v1(uuid) from public, anon, authenticated;
grant execute on function public.ops2_admin_attendance_context_v1(uuid) to service_role;
