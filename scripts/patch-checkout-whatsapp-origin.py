from pathlib import Path

STORE=Path('supabase/functions/storefront-v2/index.ts')
SQL=Path('supabase/sql/20261001_checkout_whatsapp_outbox_v1.sql')

store=STORE.read_text(encoding='utf-8')
old="""  const pay=txt(p?.payment_method,80),rawPhone=txt(p?.whatsapp_phone,40),ph=phone(rawPhone),items=Array.isArray(p?.items)?p.items.slice(0,80):[];"""
new="""  const pay=txt(p?.payment_method,80),rawPhone=txt(p?.whatsapp_phone,40),ph=phone(rawPhone),items=Array.isArray(p?.items)?p.items.slice(0,80):[],whatsappOriginRaw=txt(p?.whatsapp_origin,4),whatsappOrigin=['0975','1018'].includes(whatsappOriginRaw)?whatsappOriginRaw:'';"""
if old in store:
    store=store.replace(old,new,1)
elif 'whatsappOriginRaw=txt(p?.whatsapp_origin,4)' not in store:
    raise SystemExit('submit declaration marker not found')

old_snapshot="""  const customerSnapshot=customer?{found:true,id:customer.id,display_name:customer.display_name||null,address:customer.address||null,identity_status:\"existing_optional\"}:{};"""
new_snapshot="""  const customerSnapshot={...(customer?{found:true,id:customer.id,display_name:customer.display_name||null,address:customer.address||null,identity_status:\"existing_optional\"}:{}),...(whatsappOrigin?{whatsapp_origin:whatsappOrigin}:{})};"""
if old_snapshot in store:
    store=store.replace(old_snapshot,new_snapshot,1)
elif 'whatsapp_origin:whatsappOrigin' not in store:
    raise SystemExit('customer snapshot marker not found')
STORE.write_text(store,encoding='utf-8')

sql=SQL.read_text(encoding='utf-8')
if '  v_checkout_origin text;' not in sql:
    sql=sql.replace('  v_channel_phone_e164 text;\n  v_payload jsonb;', '  v_channel_phone_e164 text;\n  v_checkout_origin text;\n  v_payload jsonb;',1)

order_marker="""  if not found then
    return jsonb_build_object('ok',false,'error','order_not_found');
  end if;

  if v_order.customer_id is not null then"""
order_repl="""  if not found then
    return jsonb_build_object('ok',false,'error','order_not_found');
  end if;

  v_checkout_origin:=lower(coalesce(v_order.checkout_snapshot#>>'{customer,whatsapp_origin}',''));
  if v_checkout_origin not in ('0975','1018') then
    v_checkout_origin:='';
  end if;

  if v_order.customer_id is not null then"""
if order_marker in sql:
    sql=sql.replace(order_marker,order_repl,1)
elif "checkout_snapshot#>>'{customer,whatsapp_origin}'" not in sql:
    raise SystemExit('order origin marker not found')

old_route="""  if right(coalesce(v_channel_phone_e164,''),4)='1018' then
    v_channel_origin:='1018';
  elsif right(coalesce(v_channel_phone_e164,''),4)='0975' then
    v_channel_origin:='0975';
  else
    -- Entrada direta sem conversa conhecida usa o 0975 como canal operacional padrão.
    v_channel_origin:='0975';
    select public.canonical_whatsapp_e164_br_v2(wa.phone_e164)
      into v_channel_phone_e164
    from public.whatsapp_accounts wa
    where wa.is_active=true
      and right(regexp_replace(coalesce(wa.phone_e164,''),'\\D','','g'),4)='0975'
    order by wa.updated_at desc nulls last,wa.created_at desc nulls last
    limit 1;
    v_channel_phone_e164:=coalesce(v_channel_phone_e164,'+5565998150975');
  end if;"""
new_route="""  if right(coalesce(v_channel_phone_e164,''),4)='1018' then
    -- O vínculo real da conversa/conta tem prioridade sobre qualquer origem enviada pelo navegador.
    v_channel_origin:='1018';
  elsif right(coalesce(v_channel_phone_e164,''),4)='0975' then
    v_channel_origin:='0975';
  elsif v_checkout_origin='1018' then
    v_channel_origin:='1018';
    select public.canonical_whatsapp_e164_br_v2(wa.phone_e164)
      into v_channel_phone_e164
    from public.whatsapp_accounts wa
    where wa.is_active=true
      and right(regexp_replace(coalesce(wa.phone_e164,''),'\\D','','g'),4)='1018'
    order by wa.updated_at desc nulls last,wa.created_at desc nulls last
    limit 1;
    v_channel_phone_e164:=coalesce(v_channel_phone_e164,'+5565984491018');
  elsif v_checkout_origin='0975' then
    v_channel_origin:='0975';
    select public.canonical_whatsapp_e164_br_v2(wa.phone_e164)
      into v_channel_phone_e164
    from public.whatsapp_accounts wa
    where wa.is_active=true
      and right(regexp_replace(coalesce(wa.phone_e164,''),'\\D','','g'),4)='0975'
    order by wa.updated_at desc nulls last,wa.created_at desc nulls last
    limit 1;
    v_channel_phone_e164:=coalesce(v_channel_phone_e164,'+5565998150975');
  else
    -- Entrada direta sem conversa nem origem reconhecida usa o 0975 como canal operacional padrão.
    v_channel_origin:='0975';
    select public.canonical_whatsapp_e164_br_v2(wa.phone_e164)
      into v_channel_phone_e164
    from public.whatsapp_accounts wa
    where wa.is_active=true
      and right(regexp_replace(coalesce(wa.phone_e164,''),'\\D','','g'),4)='0975'
    order by wa.updated_at desc nulls last,wa.created_at desc nulls last
    limit 1;
    v_channel_phone_e164:=coalesce(v_channel_phone_e164,'+5565998150975');
  end if;"""
if old_route in sql:
    sql=sql.replace(old_route,new_route,1)
elif "elsif v_checkout_origin='1018'" not in sql:
    raise SystemExit('channel routing block not found')
SQL.write_text(sql,encoding='utf-8')
print('checkout WhatsApp origin fallback patch applied')
