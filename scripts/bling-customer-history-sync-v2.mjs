import { writeFileSync } from 'node:fs';
import { mapBlingContact, mapBlingSale, digits, historyWindow } from './bling-customer-history-sync-core.mjs';

function text(v){ return String(v ?? '').trim(); }
function required(name){ const v=text(process.env[name]); if(!v) throw new Error(`A secret ${name} não foi configurada.`); return v; }

const APPLY=process.argv.includes('--apply');
const API_BASE='https://api.bling.com.br/Api/v3';
const SUPABASE_URL=required('SUPABASE_URL').replace(/\/+$/,'');
const SUPABASE_SERVICE_ROLE_KEY=required('SUPABASE_SERVICE_ROLE_KEY');
const MIN_INTERVAL_MS=Math.max(420,Number(process.env.BLING_REQUEST_INTERVAL_MS||460));
const HISTORY_DAYS=Math.max(1,Math.min(3650,Number.parseInt(process.env.HISTORY_DAYS||'90',10)||90));
const REPORT_FILE=String(process.env.BLING_SYNC_REPORT_FILE||'bling-customer-history-report.json');
let accessToken='',lastBlingRequestAt=0;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const nowIso=()=>new Date().toISOString();
const summary={mode:APPLY?'apply':'dry-run',history_days:HISTORY_DAYS,history_window_start:null,history_window_end:null,local_customers_before:0,linked_bling_before:0,contacts_synced:0,contacts_created:0,contacts_updated:0,addresses_saved:0,emails_saved:0,phones_saved:0,contact_conflicts:0,contact_errors:0,sales_listed:0,history_orders_saved:0,history_items_saved:0,history_errors:0};

function report(){ writeFileSync(REPORT_FILE,`${JSON.stringify(summary,null,2)}\n`,'utf8'); }
async function pace(){ const wait=Math.max(0,MIN_INTERVAL_MS-(Date.now()-lastBlingRequestAt)); if(wait) await sleep(wait); lastBlingRequestAt=Date.now(); }
async function bling(path,{allow404=false,label=path}={}){
  for(let attempt=1;attempt<=5;attempt++){
    await pace(); let r;
    try{ r=await fetch(`${API_BASE}${path}`,{headers:{Authorization:`Bearer ${accessToken}`,Accept:'application/json','enable-jwt':'1'}}); }
    catch(e){ if(attempt===5) throw new Error(`${label}: falha de rede (${e.message})`); await sleep(attempt*900); continue; }
    if(r.ok||(allow404&&r.status===404)) return r;
    const body=(await r.text()).slice(0,1000);
    if(!(r.status===429||r.status>=500)||attempt===5) throw new Error(`${label}: HTTP ${r.status} ${body}`);
    const ra=Number(r.headers.get('retry-after')); await sleep(Number.isFinite(ra)&&ra>0?ra*1000:attempt*attempt*900);
  }
  throw new Error(`${label}: falha inesperada`);
}
async function oauth(){
  const body=new URLSearchParams({grant_type:'refresh_token',refresh_token:required('BLING_REFRESH_TOKEN')});
  const basic=Buffer.from(`${required('BLING_CLIENT_ID')}:${required('BLING_CLIENT_SECRET')}`).toString('base64');
  await pace();
  const r=await fetch(`${API_BASE}/oauth/token`,{method:'POST',headers:{Authorization:`Basic ${basic}`,'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json','enable-jwt':'1'},body});
  if(!r.ok) throw new Error(`OAuth Bling HTTP ${r.status}: ${(await r.text()).slice(0,700)}`);
  const d=await r.json(); if(!text(d.access_token)) throw new Error('OAuth não retornou access_token.'); accessToken=text(d.access_token);
  const f=text(process.env.BLING_REFRESH_TOKEN_FILE); if(f&&text(d.refresh_token)) writeFileSync(f,text(d.refresh_token),{encoding:'utf8',mode:0o600});
}

function supaHeaders(extra={}){ return {apikey:SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,Accept:'application/json','Content-Type':'application/json',...extra}; }
async function supa(path,options={}){ const r=await fetch(`${SUPABASE_URL}${path}`,{...options,headers:supaHeaders(options.headers||{})}); const body=await r.text(); if(!r.ok) throw new Error(`Supabase ${r.status} ${path}: ${body.slice(0,900)}`); return body?JSON.parse(body):null; }
async function list(path){ return await supa(path,{method:'GET'})||[]; }
async function insert(table,row,{onConflict=null}={}){ const qs=onConflict?`?on_conflict=${encodeURIComponent(onConflict)}`:''; const prefer=onConflict?'resolution=merge-duplicates,return=representation':'return=representation'; const data=await supa(`/rest/v1/${table}${qs}`,{method:'POST',headers:{Prefer:prefer},body:JSON.stringify(row)}); return Array.isArray(data)?data[0]:data; }
async function patch(table,id,row){ const data=await supa(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(row)}); return Array.isArray(data)?data[0]:data; }
async function removeWhere(table,query){ await supa(`/rest/v1/${table}?${query}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}); }
function uniqueIndex(rows,keyFn){ const buckets=new Map(); for(const row of rows){ const k=keyFn(row); if(!k) continue; const a=buckets.get(k)||[]; a.push(row); buckets.set(k,a); } return new Map([...buckets].filter(([,a])=>a.length===1).map(([k,a])=>[k,a[0]])); }

const state={customers:[],byId:new Map(),byBling:new Map(),byDoc:new Map(),byPhone:new Map(),phoneOwners:new Map(),addressByCustomer:new Map(),emailByCustomer:new Map(),productByBling:new Map(),contactCache:new Map()};
async function loadLocal(){
  state.customers=await list('/rest/v1/customers?select=id,bling_contact_id,name,cpf_cnpj,primary_whatsapp_e164,last_bling_sync_at&limit=10000');
  const [phones,addresses,emails,products]=await Promise.all([
    list('/rest/v1/customer_phones?select=id,customer_id,phone_e164,is_primary,source&limit=10000'),
    list('/rest/v1/customer_addresses?select=id,customer_id,street,number,complement,neighborhood,city,state,postal_code,reference,google_maps_url,is_default,is_active&is_active=eq.true&limit=10000'),
    list('/rest/v1/customer_emails?select=id,customer_id,email,is_primary,source&limit=10000'),
    list('/rest/v1/products?select=id,bling_product_id&bling_product_id=not.is.null&limit=10000')
  ]);
  state.byId=new Map(state.customers.map(c=>[c.id,c]));
  state.byBling=new Map(state.customers.filter(c=>Number(c.bling_contact_id)>0).map(c=>[Number(c.bling_contact_id),c]));
  state.byDoc=uniqueIndex(state.customers,c=>digits(c.cpf_cnpj)||null);
  state.byPhone=uniqueIndex(state.customers,c=>text(c.primary_whatsapp_e164)||null);
  state.phoneOwners=new Map(phones.map(p=>[text(p.phone_e164),p]));
  for(const a of addresses){ const old=state.addressByCustomer.get(a.customer_id); if(!old||(!old.is_default&&a.is_default)) state.addressByCustomer.set(a.customer_id,a); }
  for(const e of emails){ const old=state.emailByCustomer.get(e.customer_id); if(!old||(!old.is_primary&&e.is_primary)) state.emailByCustomer.set(e.customer_id,e); }
  state.productByBling=new Map(products.map(p=>[Number(p.bling_product_id),p.id]));
  summary.local_customers_before=state.customers.length; summary.linked_bling_before=state.byBling.size;
}
function refreshIndexes(customer){ state.byId.set(customer.id,customer); if(Number(customer.bling_contact_id)>0) state.byBling.set(Number(customer.bling_contact_id),customer); if(digits(customer.cpf_cnpj)) state.byDoc.set(digits(customer.cpf_cnpj),customer); if(text(customer.primary_whatsapp_e164)) state.byPhone.set(text(customer.primary_whatsapp_e164),customer); }
function chooseCustomer(c){ const byBling=c.bling_contact_id?state.byBling.get(c.bling_contact_id):null; if(byBling) return {customer:byBling,match:'bling'}; const byDoc=c.cpf_cnpj?state.byDoc.get(c.cpf_cnpj):null; const byPhone=c.phone_e164?state.byPhone.get(c.phone_e164):null; if(byDoc&&byPhone&&byDoc.id!==byPhone.id) return {conflict:true}; return {customer:byDoc||byPhone||null,match:byDoc?'document':byPhone?'phone':'new'}; }
function hasAddress(a){ return !![a.street,a.number,a.neighborhood,a.city,a.state,a.postal_code].some(Boolean); }
async function saveAddress(customerId,blingId,a){ if(!hasAddress(a)) return; const existing=state.addressByCustomer.get(customerId); const payload={label:'Principal',bling_address_ref:`bling-contact-${blingId}`,is_default:true,is_active:true,updated_at:nowIso()}; for(const key of ['street','number','complement','neighborhood','city','state','postal_code','reference']) if(a[key]) payload[key]=a[key]; if(existing){ const saved=await patch('customer_addresses',existing.id,payload); state.addressByCustomer.set(customerId,saved||{...existing,...payload}); } else { const saved=await insert('customer_addresses',{customer_id:customerId,...payload}); state.addressByCustomer.set(customerId,saved); } summary.addresses_saved++; }
async function saveEmail(customerId,email){ if(!email) return; const existing=state.emailByCustomer.get(customerId); const payload={email,email_normalized:email.toLowerCase(),verification_status:'unverified',is_primary:true,source:'bling',evidence:{bling_sync:true},updated_at:nowIso()}; if(existing){ const saved=await patch('customer_emails',existing.id,payload); state.emailByCustomer.set(customerId,saved||{...existing,...payload}); } else { const saved=await insert('customer_emails',{customer_id:customerId,...payload}); state.emailByCustomer.set(customerId,saved); } summary.emails_saved++; }
async function savePhone(customerId,phone){ if(!phone) return; const owner=state.phoneOwners.get(phone); if(owner&&owner.customer_id!==customerId) return; if(!owner){ const saved=await insert('customer_phones',{customer_id:customerId,phone_e164:phone,source:'bling',is_primary:true}); state.phoneOwners.set(phone,saved); summary.phones_saved++; } }
async function syncContact(raw){
  const c=mapBlingContact(raw); if(!c.bling_contact_id||!c.name) return null;
  const chosen=chooseCustomer(c); if(chosen.conflict){ summary.contact_conflicts++; return null; }
  let customer=chosen.customer; const phoneOwner=c.phone_e164?state.phoneOwners.get(c.phone_e164):null; const safePhone=!c.phone_e164||!phoneOwner||phoneOwner.customer_id===customer?.id?c.phone_e164:null;
  const row={bling_contact_id:c.bling_contact_id,name:c.name,last_bling_sync_at:nowIso(),updated_at:nowIso()}; if(c.cpf_cnpj) row.cpf_cnpj=c.cpf_cnpj; if(safePhone) row.primary_whatsapp_e164=safePhone;
  if(!APPLY){ summary.contacts_synced++; return customer||{id:`dry-${c.bling_contact_id}`,...row}; }
  if(customer){ customer=await patch('customers',customer.id,row); summary.contacts_updated++; } else { customer=await insert('customers',{...row,is_active:true}); summary.contacts_created++; }
  if(!customer?.id) throw new Error(`Contato Bling ${c.bling_contact_id}: cliente local não retornado.`);
  refreshIndexes(customer); await savePhone(customer.id,safePhone); await saveEmail(customer.id,c.email); await saveAddress(customer.id,c.bling_contact_id,c.address); summary.contacts_synced++; return customer;
}
async function contactDetail(id){ const r=await bling(`/contatos/${encodeURIComponent(id)}`,{label:`Contato ${id}`}); return (await r.json())?.data||null; }
async function ensureContact(id){ id=Number(id)||0; if(!id) return null; if(state.contactCache.has(id)) return state.contactCache.get(id); try{ const raw=await contactDetail(id); const customer=raw?await syncContact(raw):state.byBling.get(id)||null; state.contactCache.set(id,customer); return customer; }catch(e){ summary.contact_errors++; console.error(`Contato ${id}: ${e.message}`); const local=state.byBling.get(id)||null; state.contactCache.set(id,local); return local; } }
async function listSales(start,end){ const rows=[]; for(let page=1;page<=5000;page++){ const q=new URLSearchParams({pagina:String(page),limite:'100',dataInicial:start,dataFinal:end}); const r=await bling(`/pedidos/vendas?${q}`,{label:`Pedidos ${start}..${end} pág ${page}`}); const pageRows=(await r.json())?.data||[]; rows.push(...pageRows); if(pageRows.length<100) break; } return rows; }
async function saleDetail(id){ const r=await bling(`/pedidos/vendas/${encodeURIComponent(id)}`,{label:`Pedido ${id}`,allow404:true}); if(r.status===404) return null; return (await r.json())?.data||null; }
async function saveSale(raw){
  const s=mapBlingSale(raw); if(!s.bling_order_id) return; let customer=null; if(s.bling_contact_id) customer=await ensureContact(s.bling_contact_id);
  if(!APPLY){ summary.history_orders_saved++; summary.history_items_saved+=s.items.length; return; }
  const history=await insert('bling_sales_history',{bling_order_id:s.bling_order_id,customer_id:customer?.id||null,bling_contact_id:s.bling_contact_id,order_number:s.order_number,order_date:s.order_date,status_id:s.status_id,status_name:s.status_name,total:s.total,discount:s.discount,other_expenses:s.other_expenses,store_id:s.store_id,store_order_number:s.store_order_number,raw:s.raw,synced_at:nowIso(),updated_at:nowIso()},{onConflict:'bling_order_id'});
  if(!history?.id) throw new Error(`Pedido ${s.bling_order_id}: histórico não retornado.`);
  await removeWhere('bling_sales_history_items',`history_id=eq.${encodeURIComponent(history.id)}`);
  if(s.items.length){ const rows=s.items.map(i=>({history_id:history.id,item_index:i.item_index,bling_product_id:i.bling_product_id,product_id:i.bling_product_id?state.productByBling.get(i.bling_product_id)||null:null,sku:i.sku,name:i.name,quantity:i.quantity,unit_price:i.unit_price,line_total:i.line_total,raw:i.raw})); await supa('/rest/v1/bling_sales_history_items',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(rows)}); summary.history_items_saved+=rows.length; }
  summary.history_orders_saved++;
}
async function syncExistingLinkedContacts(){ for(const id of [...state.byBling.keys()]) await ensureContact(id); }
async function syncHistory(){
  const {start,end}=historyWindow(HISTORY_DAYS,new Date());
  summary.history_window_start=start; summary.history_window_end=end;
  if(APPLY) await removeWhere('bling_sales_history',`order_date=lt.${encodeURIComponent(start)}`);
  let rows=[];
  try{ rows=await listSales(start,end); }
  catch(e){ summary.history_errors++; console.error(`Histórico ${start}..${end}: ${e.message}`); return; }
  summary.sales_listed=rows.length;
  for(const row of rows){ try{ const detail=await saleDetail(row.id); await saveSale(detail||row); }catch(e){ summary.history_errors++; console.error(`Pedido ${row?.id||'?'}: ${e.message}`); } }
}

try{ await oauth(); await loadLocal(); await syncExistingLinkedContacts(); await syncHistory(); report(); console.log(JSON.stringify(summary,null,2)); }
catch(e){ console.error(e.stack||e.message||e); summary.fatal_error=String(e.message||e); report(); process.exitCode=1; }
