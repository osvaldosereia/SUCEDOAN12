from pathlib import Path
import re


def read(path):
    return Path(path).read_text(encoding='utf-8')


def write(path, text):
    Path(path).write_text(text, encoding='utf-8')


def replace_once(text, old, new, label):
    count=text.count(old)
    if count!=1:
        raise SystemExit(f'{label}: expected exactly 1 match, got {count}')
    return text.replace(old,new,1)


def regex_once(text, pattern, repl, label, flags=0):
    out,count=re.subn(pattern,repl,text,count=1,flags=flags)
    if count!=1:
        raise SystemExit(f'{label}: expected exactly 1 regex match, got {count}')
    return out

# 1) Confirmação Meta: template organizado aprovado + public_code como única identidade humana.
path='supabase/functions/admin-orders-v1/index.ts'
s=read(path)
s=replace_once(s,'"0975":"pedidorecebidosite0975",\n  "1018":"pedidorecebidosite1018"','"0975":"pedidoorganizadosite0975v2",\n  "1018":"pedidoorganizadosite1018v2"','confirmation template names')
anchor='  }catch(error){console.error("order_public_link",text((error as Error)?.message||error,180))}\n'
insert=anchor+'''  const publicOrderCode=text(publicOrderLink?.public_code,5);\n  const publicOrderUrl=text(publicOrderLink?.public_url,300);\n  if(!/^[A-Z]{2}[0-9]{3}$/.test(publicOrderCode)||!publicOrderUrl){\n    const nextStatus=scope==="checkout_auto"?"retry":"failed";\n    try{await finish(outboxId,nextStatus,null,"public_order_identity_missing",scope==="checkout_auto"?30:0)}catch{}\n    return respond({ok:false,error:"public_order_identity_missing",status:nextStatus,outbox_id:outboxId,dispatch_scope:scope},scope==="checkout_auto"?503:409);\n  }\n'''
s=replace_once(s,anchor,insert,'public code guard')
s=replace_once(s,'order_public_code:text(publicOrderLink?.public_code,5),','order_public_code:publicOrderCode,','public code payload')
s=regex_once(s,r'order_url:text\(publicOrderLink\?\.public_url,220\)\|\|`https://donaantonia\.com\.br/pedido/\?o=\$\{orderId\}`,','order_url:publicOrderUrl,','public url payload')
old_components='''  const templateName=ORDER_TEMPLATE_BY_CHANNEL[channel];\n  const components=[{type:"body",parameters:[\n    {type:"text",text:details.orderNumber},\n    {type:"text",text:details.totalFormatted},\n    {type:"text",text:details.deliverySummary},\n    {type:"text",text:details.paymentLabel}\n  ]}];'''
new_components='''  const templateName=ORDER_TEMPLATE_BY_CHANNEL[channel];\n  const components=[{type:"body",parameters:[\n    {type:"text",text:text(details.orderDate,40)},\n    {type:"text",text:publicOrderCode},\n    {type:"text",text:text(details.customerStatus,30)},\n    {type:"text",text:text(details.customerName,80)},\n    {type:"text",text:text(details.customerPhone,30)},\n    {type:"text",text:text(details.addressLabel,90)},\n    {type:"text",text:text(details.districtLabel,40)},\n    {type:"text",text:text(details.cityLabel,40)},\n    {type:"text",text:text(details.deliveryLabel,80)},\n    {type:"text",text:text(details.basketTextTemplate,80)},\n    {type:"text",text:text(details.itemsText,180)},\n    {type:"text",text:text(details.totalFormatted,30)},\n    {type:"text",text:text(details.paymentLabel,50)},\n    {type:"text",text:publicOrderUrl}\n  ]}];'''
s=replace_once(s,old_components,new_components,'organized confirmation body params')
write(path,s)

# 2) Envio manual da vitrine: nunca mostrar order_number técnico.
path='supabase/functions/admin-order-vitrine-send-v1/index.ts'
s=read(path)
old='''    const link=await publicOrderLink(orderId),short=clean(orderResult.data.order_number,80)||orderId.slice(0,8).toUpperCase();\n    const text=`Olá! Aqui está a vitrine do seu pedido Dona Antônia.\\nPedido: ${short}\\n${link.public_order_url}`;'''
new='''    const link=await publicOrderLink(orderId),publicCode=clean(link.public_order_code,5);\n    if(!/^[A-Z]{2}[0-9]{3}$/.test(publicCode))return json(req,{ok:false,error:"public_order_code_missing"},409);\n    const text=`Olá! Aqui está a vitrine do seu pedido Dona Antônia.\\nPedido: ${publicCode}\\n${link.public_order_url}`;'''
s=replace_once(s,old,new,'manual vitrine human code')
write(path,s)

# 3) API Admin: transportar public_code e disparar pós-separação antes do Bling.
path='supabase/functions/admin-products-live-v1/index.ts'
s=read(path)
helper='''async function publicOrderCodeMap(ids:string[]){\n  const out=new Map<string,string>(),cleanIds=[...new Set((ids||[]).filter(Boolean))];\n  for(let i=0;i<cleanIds.length;i+=100){\n    const q=await db.from("order_public_snapshots_v1").select("order_id,public_code").in("order_id",cleanIds.slice(i,i+100));\n    if(q.error)throw q.error;\n    for(const row of q.data||[]){const code=tx(row.public_code,5);if(/^[A-Z]{2}[0-9]{3}$/.test(code))out.set(String(row.order_id),code)}\n  }\n  return out;\n}\n'''
s=replace_once(s,'async function mapOrders(rows:any[]){\n',helper+'async function mapOrders(rows:any[]){\n','public code map helper')
s=replace_once(s,'const [rmap,ready,smap,dmap]=await Promise.all([reservationRows(ids),stockReadiness(ids),paymentSettlementMap(ids),deliveryReturnMap(ids)]);','const [rmap,ready,smap,dmap,pmap]=await Promise.all([reservationRows(ids),stockReadiness(ids),paymentSettlementMap(ids),deliveryReturnMap(ids),publicOrderCodeMap(ids)]);','public code map query')
s=replace_once(s,'id:o.id,order_number:o.order_number,status:uiStatus(o.status),','id:o.id,public_code:pmap.get(String(o.id))||null,order_number:o.order_number,status:uiStatus(o.status),','public code output')
s=replace_once(s,'public_order_url:publicLink?.public_url||null,public_order_code:publicLink?.public_code||null','public_order_url:publicLink?.public_url||null,public_order_code:publicLink?.public_code||null,public_code:publicLink?.public_code||mapped.public_code||null','public code detail alias')
notify='''  try{await db.rpc("ops2_refresh_order_public_snapshot_v1",{p_order_id:oid})}catch{}\n\n  try{\n    const notifyResponse=await fetch(`${U}/functions/v1/order-separation-notify-v1`,{\n      method:"POST",\n      headers:{"Content-Type":"application/json","x-internal-key":K},\n      body:JSON.stringify({order_id:oid}),\n      signal:AbortSignal.timeout(18000)\n    });\n    if(!notifyResponse.ok){const detail=await notifyResponse.text().catch(()=>"");console.error("order_separation_customer_notify",oid,notifyResponse.status,tx(detail,300))}\n  }catch(error){console.error("order_separation_customer_notify",oid,tx((error as Error)?.message||error,300))}\n\n  const snap=await buildSnapshot(oid,"separation_verified");'''
s=regex_once(s,r'  try\{await db\.rpc\("ops2_refresh_order_public_snapshot_v1",\{p_order_id:oid\}\)\}catch\{\}\s+\n?  const snap=await buildSnapshot\(oid,"separation_verified"\);',notify,'separation notifier before Bling')
write(path,s)

# 4) Admin visual: sempre public_code para humanos; order_number fica apenas técnico/interno.
path='vitrine/admin/index.html'
s=read(path)
s=replace_once(s,"  function shortOrder(n){const s=String(n||'');return s.length>8?s.slice(-8):s}\n","  function shortOrder(n){const s=String(n||'');return s.length>8?s.slice(-8):s}\n  function orderDisplayCode(o){const code=String(o?.public_code||o?.public_order_code||'').trim().toUpperCase();return /^[A-Z]{2}\\d{3}$/.test(code)?code:'—'}\n",'order display helper')
for old in [
    'shortOrder(o.order_number||o.id)',
    'shortOrder(o?.order_number||o?.id)',
    'shortOrder(o.order_number)',
    'shortOrder(o?.order_number)',
    'shortOrder(order.order_number||order.id)',
    'shortOrder(order?.order_number||order?.id)',
    'shortOrder(order.order_number)',
    'shortOrder(order?.order_number)'
]:
    repl='orderDisplayCode(order)' if old.startswith('shortOrder(order') else 'orderDisplayCode(o)'
    s=s.replace(old,repl)
s=s.replace('const hay=[o.order_number,','const hay=[o.public_code,o.order_number,')
write(path,s)

# 5) Atualizar contratos existentes para o template organizado e public_code.
for path in ['scripts/test-admin-order-whatsapp-ui-integration.mjs','scripts/test-checkout-order-meta-cutover-v1.mjs']:
    s=read(path)
    s=s.replace('pedidorecebidosite0975','pedidoorganizadosite0975v2').replace('pedidorecebidosite1018','pedidoorganizadosite1018v2')
    write(path,s)

path='scripts/test-checkout-whatsapp-payload-audit.mjs'
s=read(path)
s=s.replace("if(name==='ops2_order_public_link_v1')return {data:null,error:null};","if(name==='ops2_order_public_link_v1')return {data:{public_code:'DA123',public_token:'abc123abc123abc1',public_url:'https://donaantonia.com.br/p/?k=abc123abc123abc1'},error:null};")
s=s.replace("assert.equal(metaCall?.templateName,'pedidorecebidosite0975');","assert.equal(metaCall?.templateName,'pedidoorganizadosite0975v2');")
old_expect='''assert.deepEqual(JSON.parse(JSON.stringify(parameters)),[\n  {type:'text',text:'DA-TEST-12345678'},\n  {type:'text',text:providerRequest.total_formatted},\n  {type:'text',text:providerRequest.delivery_label},\n  {type:'text',text:'PIX'}\n]);\nassert.match(String(parameters[1].text),/92/,'template must keep formatted order total');\nassert.ok(String(parameters[2].text).includes('Grade branca'),'template delivery summary must retain address reference');'''
new_expect='''assert.equal(parameters.length,14);\nassert.equal(parameters[1].text,'DA123','template must expose only the public order code');\nassert.equal(parameters[11].text,providerRequest.total_formatted);\nassert.equal(parameters[12].text,'PIX');\nassert.equal(parameters[13].text,'https://donaantonia.com.br/p/?k=abc123abc123abc1');\nassert.ok(parameters[10].text.includes('Arroz 5kg'),'organized confirmation must retain products');\nassert.ok(parameters[5].text.includes('Grade branca'),'organized confirmation address must retain checkout reference');\nassert.ok(!parameters.some(p=>String(p.text).includes('DA-TEST-12345678')),'technical order_number must never be customer-visible');'''
s=replace_once(s,old_expect,new_expect,'payload audit expectations')
write(path,s)

print('order public code + separation WhatsApp patch applied')
