import {
  FIREBASE_BASE, MUG_NODES, text, norm, money, dateTime, isMug, mugArt, fbGet, fbWrite,
  safeKey, nowIso, buildPrintJob, audit, sourceLabel
} from '../shared/mug-commerce-v1.js?v=20260828-1';
import { loadMugs } from './mug-store-v2.js?v=20260829-1';

const BUILD = '20260903-admin-orders-manager-v2';
const SETTINGS_KEY = 'da_admin_canecas_settings_v1';
const CACHE_MS = 45_000;
const state = { orders:[], legacy:[], jobs:[], mugs:[], loading:false, loadedAt:0, query:'', filter:'all', draftItems:[] };
const $ = (s,r=document) => r.querySelector(s);
const esc = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');

function active(){ return location.hash === '#orders' || $('.view[data-view="orders"]')?.classList.contains('active'); }
function settings(){ try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch { return {}; } }
function toast(message,error=false){ const el=$('#toast'); if(!el) return; el.textContent=message; el.className=`toast${error?' error':''}`; el.hidden=false; clearTimeout(toast.t); toast.t=setTimeout(()=>{el.hidden=true},error?4800:2600); }
function asRows(raw={}){ return Object.entries(raw||{}).map(([__key,v])=>({__key,id:text(v?.id||__key),...(v||{})})); }
function orderStatus(o={}){ return norm(o.status || o.status_comercial || 'novo'); }
function paymentStatus(o={}){ return norm(o?.pagamento?.status || o.pagamento_status || 'pendente'); }
function liOrder(o={}){ return norm(o.canal)==='loja_integrada' || Boolean(text(o?.loja_integrada?.pedido_id || o.loja_integrada_pedido_id)); }
function activeOrder(o={}){ return !['cancelado','entregue'].includes(orderStatus(o)); }
function released(o={}){ return paymentStatus(o)==='pago' && o.liberado_producao===true; }
function itemQty(i={}){ return Math.max(1,Number(i.quantidade||i.qtd||1)||1); }
function itemPrice(i={}){ return Number(i.preco||i.preco_venda||i.valor||0)||0; }
function orderTotal(o={}){
  const direct=[o.total,o.valor_total,o.valor_pedido].map(Number).find(Number.isFinite);
  if(Number.isFinite(direct)) return direct;
  return (Array.isArray(o.itens)?o.itens:[]).reduce((s,i)=>s+itemPrice(i)*itemQty(i),0)+Number(o.frete_valor||o?.entrega?.valor||0)-Number(o.desconto||0);
}
function typeInfo(o={}){
  const items=Array.isArray(o.itens)?o.itens:[], custom=items.filter(i=>i.personalizada===true || text(i.criacao_id||i.codigo_criacao)).length;
  if(custom && custom<items.length) return ['MISTO','warn'];
  if(custom) return ['PERSONALIZADO','cf'];
  return ['PADRONIZADO',''];
}
function jobsFor(o={}){ const id=text(o.id||o.__key); return state.jobs.filter(j=>text(j.pedido_id)===id); }
function productionInfo(o={}){
  const jobs=jobsFor(o), statuses=jobs.map(j=>norm(j.status));
  if(paymentStatus(o)!=='pago' || o.liberado_producao!==true) return ['Bloqueada','bad'];
  if(jobs.length && statuses.every(s=>['impresso','cancelado'].includes(s))) return ['Pronto para envio','good'];
  if(statuses.some(s=>s==='imprimindo') || orderStatus(o)==='producao') return ['Em produção','warn'];
  if(jobs.length) return [`Fila · ${jobs.filter(j=>['aguardando','reimpressao'].includes(norm(j.status))).length}`,'good'];
  return ['Liberada · sem fila','bad'];
}
function shippingInfo(o={}){
  const status=orderStatus(o);
  if(status==='entregue') return ['Entregue','good'];
  if(status==='enviado') return ['Enviado','good'];
  if(status==='pronto_envio') return ['Pronto','warn'];
  if(o?.melhor_envio?.status==='erro') return ['Erro envio','bad'];
  return [text(o?.entrega?.servico || 'A preparar'),''];
}
function integrationError(o={}){ return o?.bling?.status==='erro'||o?.nfe?.status==='erro'||o?.melhor_envio?.status==='erro'; }
function filterKey(o={}){
  if(integrationError(o)) return 'errors';
  const s=orderStatus(o);
  if(s==='enviado'||s==='entregue') return 'sent';
  if(s==='pronto_envio') return 'ready_shipping';
  if(s==='producao') return 'production';
  if(released(o)) return 'released';
  if(paymentStatus(o)!=='pago' && activeOrder(o)) return 'waiting_payment';
  return 'other';
}
function artForItem(o,item={}){
  const direct=mugArt(item); if(direct) return direct;
  const product=state.mugs.find(p=>text(p.firebaseKey||p.id||p.__key)===text(item.produto_key||item.firebaseKey) || norm(p.codigo||p.sku)===norm(item.codigo||item.sku));
  return mugArt(product||{});
}
function needsRegistration(o={}){
  if(liOrder(o)) return false;
  const c=o.cliente||{},e=o.entrega||{};
  return !text(c.nome)||!text(c.telefone||c.whatsapp)||!text(c.email)||!text(c.cpf)||!text(e.cep)||!text(e.endereco||e.logradouro)||!text(e.numero)||!text(e.cidade)||!text(e.uf);
}

async function loadLegacy(){
  try{
    const url=new URL(`${FIREBASE_BASE}/pedidos.json`); url.searchParams.set('orderBy',JSON.stringify('$key'));url.searchParams.set('limitToLast','180');url.searchParams.set('_',Date.now());
    const r=await fetch(url,{cache:'no-store'}); if(!r.ok) return [];
    const raw=await r.json();
    return asRows(raw).filter(o=>(Array.isArray(o.itens)?o.itens:[]).some(i=>isMug(i)||/caneca/i.test(text(i.nome)))).map(o=>({...o,__legacy:true,origem:o.origem||'dona_antonia'}));
  }catch{return []}
}
async function load(force=false){
  if(state.loading) return;
  if(!force && state.loadedAt && Date.now()-state.loadedAt<CACHE_MS) return render();
  state.loading=true;
  try{
    const snapshot=window.__CF_ADMIN_OPS_SNAPSHOT__;
    const fresh=snapshot?.loadedAt && Date.now()-Number(snapshot.loadedAt)<CACHE_MS;
    const [orders,jobs,mugs,legacy]=await Promise.all([
      fresh?Promise.resolve(Object.fromEntries((snapshot.orders||[]).map(o=>[text(o.__key||o.id),o]))):fbGet(MUG_NODES.orders),
      fresh?Promise.resolve(Object.fromEntries((snapshot.printJobs||[]).map(j=>[text(j.__key||j.id),j]))):fbGet(MUG_NODES.printJobs).catch(()=>({})),
      loadMugs(),loadLegacy()
    ]);
    state.orders=asRows(orders).sort((a,b)=>new Date(b.criado_em||0)-new Date(a.criado_em||0));
    state.jobs=asRows(jobs);state.mugs=mugs||[];state.legacy=legacy;state.loadedAt=Date.now();
    render();
  }catch(error){ console.error('[Pedidos V2]',error); $('#orders').innerHTML=`<div class="notice warn">Falha ao carregar Pedidos: ${esc(error.message||error)}</div>`; }
  finally{state.loading=false}
}
function allOrders(){
  const map=new Map(state.orders.map(o=>[text(o.id),o]));
  for(const o of state.legacy) if(!map.has(text(o.id))) map.set(text(o.id),o);
  return [...map.values()].sort((a,b)=>new Date(b.criado_em||0)-new Date(a.criado_em||0));
}
function metrics(list){
  return {
    waiting:list.filter(o=>filterKey(o)==='waiting_payment').length,
    released:list.filter(o=>filterKey(o)==='released').length,
    production:list.filter(o=>filterKey(o)==='production').length,
    ready:list.filter(o=>filterKey(o)==='ready_shipping').length,
    errors:list.filter(integrationError).length
  };
}
function chip(label,key,count){ return `<button class="cf-order-chip ${state.filter===key?'active':''}" data-order-filter="${key}">${esc(label)} <b>${count}</b></button>`; }
function badge(label,cls=''){ return `<span class="badge ${cls}">${esc(label)}</span>`; }
function orderRow(o){
  const [type,typeCls]=typeInfo(o),[prod,prodCls]=productionInfo(o),[ship,shipCls]=shippingInfo(o),pay=paymentStatus(o),li=liOrder(o),total=orderTotal(o);
  return `<div class="cf-order-row" data-order-id="${esc(o.id)}" data-legacy="${o.__legacy?'1':'0'}">
    <div class="cf-order-main"><strong>${esc(o.id)}</strong><span>${esc(o.cliente?.nome||o.cliente_nome||'Cliente não identificado')}</span><small>${esc(o.cliente?.telefone||o.cliente?.whatsapp||'')}</small></div>
    <div>${badge(type,typeCls)}${li?'<small class="cf-order-source">LOJA INTEGRADA</small>':'<small class="cf-order-source">MANUAL / DONA ANTÔNIA</small>'}</div>
    <div>${badge(pay==='pago'?'Pago':pay==='cancelado'?'Cancelado':'Pendente',pay==='pago'?'good':pay==='cancelado'?'bad':'warn')}<small>${li?'automático pela loja':'confirmação manual'}</small></div>
    <div>${badge(prod,prodCls)}</div><div>${badge(ship,shipCls)}</div>
    <div class="cf-order-total"><strong>${money(total)}</strong><small>${esc(dateTime(o.criado_em))}</small></div>
    <button class="cf-order-open" type="button" title="Abrir pedido">›</button>
  </div>`;
}
function installStyles(){
  if($('#cfOrdersV2Style')) return;const style=document.createElement('style');style.id='cfOrdersV2Style';style.textContent=`
  #orders[data-orders-v2]{display:grid;gap:12px}.cf-order-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.cf-order-metric{border:1px solid #e3e5e0;background:#fff;border-radius:12px;padding:12px}.cf-order-metric strong{font-size:24px;display:block}.cf-order-metric span{font-size:10px;color:#737a73}.cf-order-tools{display:grid;grid-template-columns:minmax(220px,1fr) auto;gap:9px}.cf-order-tools input{height:42px;border:1px solid #dfe2dc;border-radius:10px;padding:0 12px}.cf-order-chips{display:flex;gap:6px;flex-wrap:wrap}.cf-order-chip{border:1px solid #dde1da;background:#fff;border-radius:999px;padding:7px 10px;font-size:10px;cursor:pointer}.cf-order-chip.active{background:#1e2b22;color:#fff;border-color:#1e2b22}.cf-order-list{border:1px solid #e2e4df;border-radius:13px;background:#fff;overflow:hidden}.cf-order-row{display:grid;grid-template-columns:minmax(180px,1.4fr) .85fr .85fr 1fr 1fr .85fr 30px;gap:8px;align-items:center;padding:11px 12px;border-bottom:1px solid #eceeea;cursor:pointer}.cf-order-row:last-child{border-bottom:0}.cf-order-row:hover{background:#fafbf9}.cf-order-main{display:grid;gap:2px}.cf-order-main strong{font-size:12px}.cf-order-main span{font-size:11px}.cf-order-main small,.cf-order-row small{font-size:9px;color:#747a74;display:block;margin-top:3px}.cf-order-source{font-weight:800}.cf-order-total strong{font-size:12px}.cf-order-open{border:0;background:transparent;font-size:22px;cursor:pointer}.cf-order-empty{padding:35px;text-align:center;color:#737a73}.cf-order-art{display:grid;grid-template-columns:110px 1fr;gap:10px;padding:9px;border:1px solid #e2e4df;border-radius:11px;margin-bottom:8px}.cf-order-art img{width:110px;height:70px;object-fit:contain;background:#f5f5f2;border-radius:7px}.cf-order-art .missing{display:grid;place-items:center;width:110px;height:70px;background:#fff0ed;color:#92352d;border-radius:7px;font-size:9px}.cf-order-art-info{display:grid;gap:3px}.cf-order-art-info small{font-size:10px;color:#717771}.cf-payment-authority{padding:10px;border:1px solid #cfe0d3;background:#f3faf4;border-radius:10px;font-size:11px}.cf-payment-authority.pending{border-color:#ead4ad;background:#fff9ef}.cf-manual-items{display:grid;gap:7px}.cf-manual-item{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px;border:1px solid #e3e5e0;border-radius:9px}.cf-manual-add{display:grid;grid-template-columns:1fr 90px auto;gap:7px}.cf-manual-add select,.cf-manual-add input{height:39px;border:1px solid #dfe2dc;border-radius:9px;padding:0 9px}.cf-order-status-note{font-size:10px;color:#727872;margin-top:5px}@media(max-width:900px){.cf-order-metrics{grid-template-columns:repeat(2,1fr)}.cf-order-row{grid-template-columns:1fr 1fr}.cf-order-row>div:nth-child(n+3){min-width:0}.cf-order-open{display:none}.cf-order-tools{grid-template-columns:1fr}.cf-manual-add{grid-template-columns:1fr 80px}.cf-manual-add button{grid-column:1/-1}}
  `;document.head.appendChild(style);
}
function render(){
  if(!active()) return;installStyles();const root=$('#orders');if(!root)return;const all=allOrders(),m=metrics(all),q=norm(state.query);
  const filtered=all.filter(o=>(state.filter==='all'||filterKey(o)===state.filter) && (!q||norm([o.id,o.cliente?.nome,o.cliente?.telefone,o.cliente?.email,typeInfo(o)[0],orderStatus(o),paymentStatus(o)].join(' ')).includes(q)));
  root.dataset.ordersV2=BUILD;root.innerHTML=`<div class="cf-order-metrics"><div class="cf-order-metric"><strong>${m.waiting}</strong><span>Aguardando pagamento</span></div><div class="cf-order-metric"><strong>${m.released}</strong><span>Liberados para produção</span></div><div class="cf-order-metric"><strong>${m.production}</strong><span>Em produção</span></div><div class="cf-order-metric"><strong>${m.ready}</strong><span>Prontos para envio</span></div><div class="cf-order-metric"><strong>${m.errors}</strong><span>Com problema</span></div></div>
  <div class="cf-order-tools"><input id="cfOrderSearch" type="search" placeholder="Buscar pedido, cliente, telefone ou e-mail…" value="${esc(state.query)}"><button class="primary" id="cfNewManualOrder" type="button">Novo pedido manual</button></div>
  <div class="cf-order-chips">${chip('Todos','all',all.length)}${chip('Aguardando pagamento','waiting_payment',m.waiting)}${chip('Liberados','released',m.released)}${chip('Em produção','production',m.production)}${chip('Prontos para envio','ready_shipping',m.ready)}${chip('Enviados','sent',all.filter(o=>filterKey(o)==='sent').length)}${chip('Problemas','errors',m.errors)}</div>
  <section class="cf-order-list">${filtered.map(orderRow).join('')||'<div class="cf-order-empty">Nenhum pedido com estes filtros.</div>'}</section>`;
  $('#cfOrderSearch').oninput=e=>{state.query=e.target.value;render()};
  root.querySelectorAll('[data-order-filter]').forEach(b=>b.onclick=()=>{state.filter=b.dataset.orderFilter;render()});
  root.querySelectorAll('[data-order-id]').forEach(row=>row.onclick=()=>openOrder(all.find(o=>text(o.id)===text(row.dataset.orderId)&&Boolean(o.__legacy)===Boolean(row.dataset.legacy==='1'))||all.find(o=>text(o.id)===text(row.dataset.orderId))));
  $('#cfNewManualOrder').onclick=openManualNew;
  const title=$('#pageTitle'),sub=$('#pageSubtitle');if(title)title.textContent='Pedidos';if(sub)sub.textContent='Pagamento, produção, arte, envio e pedidos da Loja Integrada em um só lugar.';
}
function openDrawer(html){ $('#drawerContent').innerHTML=html;$('#drawer').classList.add('open');$('#drawer').setAttribute('aria-hidden','false');$('#overlay').hidden=false; }
function closeDrawer(){ $('#drawer').classList.remove('open');$('#drawer').setAttribute('aria-hidden','true');$('#overlay').hidden=true; }
function itemBlock(o,item){const art=artForItem(o,item),code=text(item.criacao_id||item.codigo_criacao),custom=item.personalizada===true||Boolean(code);return `<div class="cf-order-art">${art?`<img src="${esc(art)}" alt="Arte">`:'<div class="missing">SEM ARTE</div>'}<div class="cf-order-art-info"><b>${itemQty(item)}× ${esc(item.nome||'Caneca')}</b><small>${custom?'PERSONALIZADA':'PADRONIZADA'}${code?` · CF-ID ${esc(code)}`:''}</small><small>SKU ${esc(item.codigo||item.sku||'—')} · ${money(itemPrice(item))}/un.</small>${art?`<a href="${esc(art)}" target="_blank" rel="noopener">Abrir arte aprovada</a>`:'<strong style="color:#98362e">Produção sem arte localizada</strong>'}</div></div>`}
function openOrder(o){
  if(!o)return;const li=liOrder(o),pay=paymentStatus(o),[prod,prodCls]=productionInfo(o),[ship,shipCls]=shippingInfo(o),items=Array.isArray(o.itens)?o.itens:[],cfg=settings();
  const phone=text(o.cliente?.telefone||o.cliente?.whatsapp).replace(/\D/g,''),wa=phone?`https://wa.me/${phone.startsWith('55')?phone:`55${phone}`}`:'';
  openDrawer(`<h2>Pedido ${esc(o.id)}</h2><div class="subtitle">${badge(typeInfo(o)[0],typeInfo(o)[1])} · ${li?'Loja Integrada':'Manual / Dona Antônia'} · ${esc(dateTime(o.criado_em))}</div>
    <div class="form-section"><h3>Pagamento</h3>${li?`<div class="cf-payment-authority ${pay==='pago'?'':'pending'}"><b>${pay==='pago'?'✓ PAGAMENTO CONFIRMADO':'⏳ PAGAMENTO AINDA NÃO CONFIRMADO'}</b><br>Fonte autoritativa: Loja Integrada. O Admin não permite marcar este pagamento manualmente.</div>`:`<div class="cf-payment-authority ${pay==='pago'?'':'pending'}"><b>${pay==='pago'?'✓ PAGAMENTO CONFIRMADO':'Pagamento manual pendente'}</b><br>${pay==='pago'?'Produção pode ser liberada.':'Confirme somente depois de conferir PIX/cartão.'}</div>`}</div>
    <div class="form-section"><h3>Cliente</h3><div class="notice"><b>${esc(o.cliente?.nome||'Não identificado')}</b><br>${esc(o.cliente?.telefone||o.cliente?.whatsapp||'')} · ${esc(o.cliente?.email||'')}<br>CPF/CNPJ: ${esc(o.cliente?.cpf||o.cliente?.cnpj||'—')}</div></div>
    <div class="form-section"><h3>Canecas e artes</h3>${items.length?items.map(i=>itemBlock(o,i)).join(''):'<div class="notice warn">Nenhuma caneca identificada neste pedido.</div>'}</div>
    <div class="form-section"><h3>Operação</h3><div class="notice">Produção: <b>${esc(prod)}</b> · Envio: <b>${esc(ship)}</b><br>Total: <b>${money(orderTotal(o))}</b> · Frete: ${money(Number(o.frete_valor||o?.entrega?.valor||0))}</div></div>
    <div class="form-section"><h3>Integrações</h3><div class="notice">Bling: <b>${esc(o.bling?.status||'não enviado')}</b> · NF-e: <b>${esc(o.nfe?.status||'não emitida')}</b> · Melhor Envio: <b>${esc(o.melhor_envio?.status||'não iniciado')}</b></div></div>
    <div class="drawer-actions">${o.__legacy?'<button class="primary" id="cfImportLegacy">Importar para Admin</button>':!li&&pay!=='pago'?'<button class="primary" id="cfConfirmManualPay">CONFIRMAR PAGAMENTO</button>':''}${!li&&needsRegistration(o)?'<button class="secondary" id="cfRegistrationLink">Solicitar dados ao cliente</button>':''}${wa?`<a class="secondary" href="${wa}" target="_blank">WhatsApp</a>`:''}${cfg.blingWebhook&&!o.__legacy?'<button class="secondary" id="cfOrderBling">Enviar ao Bling</button>':''}${cfg.shippingWebhook&&!o.__legacy&&pay==='pago'?'<button class="secondary" id="cfOrderShipping">Preparar envio</button>':''}<button class="secondary" id="cfOrderRefresh">Atualizar</button></div>`,{kind:'order',id:o.id});
  if($('#cfImportLegacy'))$('#cfImportLegacy').onclick=()=>importLegacy(o);
  if($('#cfConfirmManualPay'))$('#cfConfirmManualPay').onclick=()=>confirmManualPayment(o);
  if($('#cfRegistrationLink'))$('#cfRegistrationLink').onclick=()=>copyRegistrationLink(o);
  if($('#cfOrderBling'))$('#cfOrderBling').onclick=()=>callIntegration('bling',o,cfg.blingWebhook);
  if($('#cfOrderShipping'))$('#cfOrderShipping').onclick=()=>callIntegration('shipping',o,cfg.shippingWebhook);
  $('#cfOrderRefresh').onclick=async()=>{closeDrawer();await load(true)};
}
async function importLegacy(o){
  try{const copy={...o,id:o.id,origem:'dona_antonia',status:o.status||'novo',importado_de:'pedidos',importado_em:nowIso(),atualizado_em:nowIso()};delete copy.__legacy;delete copy.__key;await fbWrite(`${MUG_NODES.orders}/${safeKey(o.id)}`,copy,'PUT');await audit('pedido_importado_admin_canecas',{pedido_id:o.id});toast('Pedido importado.');closeDrawer();await load(true)}catch(e){toast(e.message||e,true)}
}
async function confirmManualPayment(o){
  if(liOrder(o)) return toast('Pagamento da Loja Integrada não pode ser confirmado manualmente.',true);
  const items=Array.isArray(o.itens)?o.itens:[];if(!items.length)return toast('Pedido sem canecas.',true);
  const paidOrder={...o,pagamento:{...(o.pagamento||{}),status:'pago'},liberado_producao:true,liberado_producao_em:text(o.liberado_producao_em)||nowIso()};
  let jobs=[];try{jobs=items.map((item,index)=>buildPrintJob(paidOrder,{...item,arte_horizontal:artForItem(o,item)},index));}catch(e){return toast(e.message||e,true)}
  if(!confirm(`Confirmar pagamento do pedido ${o.id} e liberar ${jobs.length} trabalho(s) para produção?`))return;
  try{
    const now=nowIso();await fbWrite(`${MUG_NODES.orders}/${safeKey(o.id)}`,{pagamento:{...(o.pagamento||{}),status:'pago',confirmado_em:now,confirmado_por:'admin_manual'},pagamento_status:'pago',pagamento_confirmado:true,liberado_producao:true,liberado_producao_em:text(o.liberado_producao_em)||now,producao_status:'liberado',status:'pago',status_comercial:'pago',atualizado_em:now});
    for(const job of jobs){const existing=state.jobs.find(j=>text(j.id||j.__key)===text(job.id));if(existing)await fbWrite(`${MUG_NODES.printJobs}/${safeKey(job.id)}`,{pagamento_status:'pago',liberado_producao:true,liberado_producao_em:text(o.liberado_producao_em)||now,status:norm(existing.status)==='bloqueado_pagamento'?'aguardando':existing.status,atualizado_em:now});else await fbWrite(`${MUG_NODES.printJobs}/${safeKey(job.id)}`,job,'PUT')}
    await audit('pagamento_manual_confirmado',{pedido_id:o.id,jobs:jobs.map(j=>j.id)});toast('Pagamento confirmado e produção liberada.');closeDrawer();await load(true);
  }catch(e){toast(e.message||e,true)}
}
async function copyRegistrationLink(o){
  try{const path=`${MUG_NODES.orders}/${safeKey(o.id)}`,remote=await fbGet(path).catch(()=>o);let url=text(remote?.cadastro_url);if(!url){const token=(crypto.randomUUID?.()||`${Date.now()}${Math.random()}`).replace(/-/g,'');const root=location.origin+location.pathname.replace(/\/admin-canecas\/?$/,'');url=`${root}/canecafacil/cadastro.html?pedido=${encodeURIComponent(o.id)}&token=${encodeURIComponent(token)}`;await fbWrite(path,{cadastro_token:token,cadastro_url:url,cadastro_status:'pendente',atualizado_em:nowIso()})}await navigator.clipboard.writeText(url);toast('Link de cadastro copiado.')}catch(e){toast(`Não foi possível gerar o link: ${e.message||e}`,true)}
}
async function callIntegration(kind,o,url){
  try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:BUILD,action:kind,pedido_id:o.id,order:o})});const raw=await r.text();if(!r.ok)throw new Error(`HTTP ${r.status} ${raw.slice(0,120)}`);const node=kind==='bling'?'bling':'melhor_envio';await fbWrite(`${MUG_NODES.orders}/${safeKey(o.id)}/${node}`,{status:'solicitado',solicitado_em:nowIso(),resposta:raw.slice(0,800)});toast(kind==='bling'?'Envio ao Bling solicitado.':'Preparação de envio solicitada.');closeDrawer();await load(true)}catch(e){toast(`Integração falhou: ${e.message||e}`,true)}
}
function openManualNew(){
  state.draftItems=[];renderManualNew();
}
function renderManualNew(){
  const options=state.mugs.filter(isMug).map(p=>`<option value="${esc(text(p.firebaseKey||p.id||p.__key))}">${esc(p.nome||p.codigo||'Caneca')} · ${money(Number(p.preco||0))}</option>`).join('');
  openDrawer(`<h2>Novo pedido manual</h2><div class="subtitle">WhatsApp, balcão, empresa ou exceção operacional.</div><div class="form"><label>Nome<input id="cfManName"></label><label>WhatsApp<input id="cfManPhone"></label><label>E-mail<input id="cfManEmail" type="email"></label><label>CPF/CNPJ<input id="cfManCpf"></label></div><div class="form-section"><h3>Canecas</h3><div class="cf-manual-add"><select id="cfManProduct"><option value="">Selecione uma caneca…</option>${options}</select><input id="cfManQty" type="number" min="1" max="50" value="1"><button class="secondary" id="cfManAdd" type="button">Adicionar</button></div><div class="cf-manual-items" id="cfManItems">${manualDraftHtml()}</div></div><div class="drawer-actions"><button class="primary" id="cfManSave" type="button">Salvar pedido</button><button class="secondary" id="cfManCancel" type="button">Cancelar</button></div>`);
  $('#cfManAdd').onclick=()=>{const key=text($('#cfManProduct').value),qty=Math.max(1,Number($('#cfManQty').value||1));const p=state.mugs.find(x=>text(x.firebaseKey||x.id||x.__key)===key);if(!p)return;const found=state.draftItems.find(i=>i.produto_key===key);if(found)found.quantidade+=qty;else state.draftItems.push({id:`MANITEM-${Date.now().toString(36)}`,produto_key:key,firebaseKey:key,codigo:text(p.codigo||p.sku),sku:text(p.codigo||p.sku),nome:text(p.nome||'Caneca'),quantidade:qty,preco:Number(p.preco||0),personalizada:false,arte_horizontal:mugArt(p),arte_aprovada:mugArt(p)?{url:mugArt(p),versao:'catalogo'}:null});$('#cfManItems').innerHTML=manualDraftHtml();bindManualRemove()};
  bindManualRemove();$('#cfManSave').onclick=saveManualNew;$('#cfManCancel').onclick=closeDrawer;
}
function manualDraftHtml(){return state.draftItems.length?state.draftItems.map((i,index)=>`<div class="cf-manual-item"><span><b>${itemQty(i)}× ${esc(i.nome)}</b><small>${money(itemPrice(i))}/un. ${i.arte_horizontal?'· arte OK':'· SEM ARTE'}</small></span><button type="button" class="secondary" data-man-remove="${index}">Remover</button></div>`).join(''):'<div class="notice">Nenhuma caneca adicionada.</div>'}
function bindManualRemove(){$('#cfManItems')?.querySelectorAll('[data-man-remove]').forEach(b=>b.onclick=()=>{state.draftItems.splice(Number(b.dataset.manRemove),1);$('#cfManItems').innerHTML=manualDraftHtml();bindManualRemove()})}
async function saveManualNew(){
  if(!state.draftItems.length)return toast('Adicione ao menos uma caneca.',true);const name=text($('#cfManName').value),phone=text($('#cfManPhone').value);if(!name||!phone)return toast('Informe nome e WhatsApp.',true);
  const id=`MAN-CF-${Date.now().toString(36).toUpperCase()}`,now=nowIso(),total=state.draftItems.reduce((s,i)=>s+itemPrice(i)*itemQty(i),0);const order={id,origem:'dona_antonia',canal:'manual',tipo_pedido:'padronizado',status:'aguardando_pagamento',status_comercial:'aguardando_pagamento',cliente:{nome:name,telefone:phone,whatsapp:phone,email:text($('#cfManEmail').value),cpf:text($('#cfManCpf').value)},pagamento:{status:'pendente'},pagamento_status:'pendente',liberado_producao:false,producao_status:'bloqueado_pagamento',itens:state.draftItems,total,criado_em:now,atualizado_em:now};
  try{await fbWrite(`${MUG_NODES.orders}/${safeKey(id)}`,order,'PUT');await audit('pedido_manual_criado',{pedido_id:id,itens:state.draftItems.length,total});toast(`Pedido ${id} criado.`);closeDrawer();await load(true)}catch(e){toast(e.message||e,true)}
}
function schedule(force=false){setTimeout(()=>{if(active())void load(force)},120)}
window.addEventListener('admin-canecas:route',e=>{if(e.detail?.route==='orders')schedule(Boolean(e.detail?.force))});
window.addEventListener('admin-canecas:ops-snapshot',()=>{if(active()){state.loadedAt=0;schedule(false)}});
window.addEventListener('hashchange',()=>schedule(false));
document.addEventListener('DOMContentLoaded',()=>schedule(false));
document.documentElement.dataset.cfOrdersManager=BUILD;
export { BUILD,load,filterKey,liOrder };
