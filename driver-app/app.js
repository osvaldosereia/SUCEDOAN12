import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cfg=window.DA_DRIVER_CONFIG||{};
const $=s=>document.querySelector(s);
const disabled=$('#disabledView'),app=$('#app'),loginPanel=$('#loginPanel'),routePanel=$('#routePanel'),stopsEl=$('#stops');
const state={sb:null,session:null,snapshot:null,queue:JSON.parse(localStorage.getItem('da_driver_queue_v1')||'[]'),gpsWatch:null,collectionStop:null,collectionPayments:[]};
const uid=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;
const saveQueue=()=>{localStorage.setItem('da_driver_queue_v1',JSON.stringify(state.queue));renderQueue()};
const renderQueue=()=>{$('#queueCount').textContent=`${state.queue.length} pendência${state.queue.length===1?'':'s'} offline`;$('#syncFooter').classList.toggle('hidden',!state.session)};
const status=(el,msg)=>{el.textContent=msg||''};
const edgeUrl=()=>`${cfg.supabaseUrl}/functions/v1/${cfg.edgeFunction}`;
const brl=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const money=cents=>brl.format(Number(cents||0)/100);
const methodLabel=m=>({cash:'Dinheiro',pix:'Pix',card:'Cartão',credit_card:'Cartão de crédito',food_meal_card:'Alimentação/refeição',payment_link:'Link de pagamento',prepaid_pix:'Pix antecipado',prepaid_link:'Link antecipado',other:'Outro'}[m]||'Não informado');
const reasonLabel=r=>({payment_expectation_missing:'Forma de recebimento não definida',prepayment_incomplete_at_route:'Pagamento antecipado ainda não confirmado',unresolved_payment_observation:'Existe pagamento aguardando conciliação',order_overpaid:'Valor recebido acima do pedido',expected_payment_method_missing:'Forma de pagamento ausente',payment_expectation_review_required:'Expectativa financeira em revisão'}[r]||String(r||'Revisão financeira necessária'));

async function edge(payload){
  const token=state.session?.access_token;if(!token)throw new Error('not_authenticated');
  const res=await fetch(edgeUrl(),{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`,'apikey':cfg.supabasePublishableKey},body:JSON.stringify(payload)});
  const data=await res.json().catch(()=>({ok:false,error:'invalid_response'}));
  if(!res.ok||data?.ok===false){const err=new Error(data?.error||`http_${res.status}`);err.data=data;throw err}
  return data;
}

async function dispatchOrQueue(payload){
  payload.client_event_id=payload.client_event_id||`driver:${uid()}`;
  if(!navigator.onLine){state.queue.push(payload);saveQueue();return {queued:true}}
  try{return await edge(payload)}catch(err){
    if(String(err?.message||'').includes('Failed to fetch')){state.queue.push(payload);saveQueue();return {queued:true}}
    throw err;
  }
}

async function syncQueue(){
  if(!navigator.onLine||!state.session||!state.queue.length)return;
  const pending=[...state.queue],kept=[];
  for(const item of pending){try{await edge(item)}catch(err){if(String(err?.message||'').includes('Failed to fetch'))kept.push(item);else console.warn('offline action rejected',item.action,err)}}
  state.queue=kept;saveQueue();await loadRoute();
}

function showNotice(msg,kind='info'){
  const el=$('#notice');el.textContent=msg||'';el.classList.toggle('hidden',!msg);el.classList.toggle('danger-text',kind==='danger');
}

function financialCard(stop){
  const f=stop.financial;if(!f?.ok)return '';
  if(f.decision==='covered')return `<div class="money-card covered"><div class="money-line"><div><strong>Pedido já pago</strong><small>Não cobrar novamente.</small></div><span class="money-value">${money(0)}</span></div><span class="money-badge">Já pago</span></div>`;
  if(f.decision==='collect'){
    const change=Number(f.change_required_cents||0);
    return `<div class="money-card collect"><div class="money-line"><div><strong>Cobrar na entrega</strong><small>${methodLabel(f.expected_method)}</small></div><span class="money-value">${money(f.remaining_due_cents)}</span></div>${change>0?`<small>Cliente informou ${money(f.tender_amount_cents)} · preparar troco de <b>${money(change)}</b></small>`:''}<span class="money-badge">Cobrar</span></div>`;
  }
  return `<div class="money-card review"><strong>Revisar antes de entregar</strong><small>${reasonLabel(f.reason)}</small><span class="money-badge">Revisão</span></div>`;
}

function renderCollectionSummary(snap){
  const el=$('#collectionSummary'),sum=snap.collection_summary;
  if(!sum?.enabled){el.classList.add('hidden');return}
  const parts=[`${sum.collect_order_count||0} pedido(s) a cobrar`,money(sum.collect_due_cents||0)];
  if(Number(sum.change_required_cents||0)>0)parts.push(`troco ${money(sum.change_required_cents)}`);
  if(Number(sum.review_order_count||0)>0)parts.push(`${sum.review_order_count} em revisão`);
  el.textContent=parts.join(' · ');el.classList.remove('hidden');
}

function renderRoute(){
  const snap=state.snapshot?.snapshot||state.snapshot;
  if(!snap?.ok){$('#routeCode').textContent='Sem rota';$('#routeSummary').textContent='Nenhuma rota publicada ou ativa para você.';stopsEl.innerHTML='<div class="card empty">Aguardando rota.</div>';$('#startRouteBtn').classList.add('hidden');$('#collectionSummary').classList.add('hidden');return}
  $('#driverName').textContent=snap.driver?.display_name||'Entregador';
  $('#routeCode').textContent=snap.route?.route_code||'Rota';
  const arr=Array.isArray(snap.stops)?snap.stops:[];
  const done=arr.filter(x=>['delivered','skipped','rescheduled'].includes(x.status)).length;
  $('#routeSummary').textContent=`${done}/${arr.length} paradas concluídas · ${snap.route?.status||''}`;
  renderCollectionSummary(snap);
  if(Number(snap.collection_summary?.review_order_count||0)>0)showNotice('Há pedido(s) com pendência financeira. Eles precisam de revisão antes da confirmação de entrega.','danger');else showNotice('');
  $('#startRouteBtn').classList.toggle('hidden',snap.route?.status!=='published');
  $('#startRouteBtn').onclick=async()=>{try{await dispatchOrQueue({action:'start_route',route_id:snap.route.id});await loadRoute();startGps()}catch(e){alert(`Não foi possível iniciar: ${e.message}`)}};
  stopsEl.innerHTML='';
  for(const stop of arr){
    const card=document.createElement('section');card.className=`card stop stop-${stop.status}`;
    const address=[stop.address?.street||stop.address?.logradouro,stop.address?.number||stop.address?.numero,stop.address?.neighborhood||stop.address?.bairro,stop.address?.city||stop.address?.cidade].filter(Boolean).join(', ')||'Endereço não informado';
    const legacyDue=stop.financial?.ok?Number(stop.financial.remaining_due_cents||0)/100:Number(stop.amount_due||0);
    card.innerHTML=`<div class="stop-top"><span class="seq">${stop.sequence_no}</span><div><strong>${address}</strong><small>${stop.reference||''}</small></div><span class="pill">${stop.status}</span></div><div class="stop-meta"><span>${stop.volumes||1} volume(s)</span><span>${stop.financial?.ok?'Saldo '+money(stop.financial.remaining_due_cents):'Receber R$ '+legacyDue.toFixed(2)}</span></div>${financialCard(stop)}<div class="actions"></div>`;
    const actions=card.querySelector('.actions');
    if(['planned','locked_next','active'].includes(stop.status))actions.append(button('Cheguei',()=>act('arrived',stop.id)));
    if(stop.status==='arrived'){
      const f=stop.financial;
      if(snap.financial_context?.enabled&&f?.ok){
        if(f.decision==='covered')actions.append(button('Entreguei',()=>deliverCovered(stop),true));
        else if(f.decision==='collect')actions.append(button('Receber e entregar',()=>openCollection(stop),true));
        else actions.append(button('Pendência financeira',()=>alert(reasonLabel(f.reason))));
      }else actions.append(button('Entreguei',()=>deliverCovered(stop),true));
      actions.append(button('Não consegui',()=>fail(stop.id)));
    }
    if(stop.latitude!=null&&stop.longitude!=null)actions.append(button('Abrir navegação',()=>window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${stop.latitude},${stop.longitude}`)}`,'_blank')));
    stopsEl.append(card);
  }
}

const button=(label,fn,primary=false)=>{const b=document.createElement('button');b.textContent=label;if(primary)b.classList.add('primary');b.onclick=fn;return b};
async function act(action,stopId,extra={}){try{const result=await dispatchOrQueue({action,stop_id:stopId,...extra});if(result?.queued)showNotice('Ação salva offline. Ela será validada pelo servidor quando a conexão voltar.');else await loadRoute();return result}catch(e){const detail=e?.data?.financial?.reason?` · ${reasonLabel(e.data.financial.reason)}`:'';alert(`Ação não concluída: ${e.message}${detail}`);throw e}}
async function deliverCovered(stop){try{const result=await act('delivered',stop.id,{proof:{method:'driver_confirmation'}});if(result?.queued)showNotice('Entrega salva offline; nenhuma confirmação financeira foi antecipada.');else showNotice('Entrega registrada. O financeiro permanece separado da confirmação fiscal.')}catch{}}
async function fail(stopId){const incident=prompt('Motivo: customer_absent, address_issue, payment_issue, vehicle_issue, delay, damage, safety ou other','customer_absent')||'other';const notes=prompt('Observação curta (opcional)','')||'';try{await dispatchOrQueue({action:'failed',stop_id:stopId,incident_type:incident,notes});await loadRoute()}catch(e){alert(`Falha ao registrar ocorrência: ${e.message}`)}}

function parseMoneyInput(v){let normalized=String(v||'').trim().replace(/\s/g,'');if(normalized.includes(',')&&normalized.includes('.'))normalized=normalized.replace(/\./g,'').replace(',','.');else if(normalized.includes(','))normalized=normalized.replace(',','.');const n=Number(normalized);return Number.isFinite(n)&&n>=0?Math.round(n*100):null}
const centsInput=cents=>(Number(cents||0)/100).toFixed(2).replace('.',',');
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const paymentUiMethod=expected=>expected==='cash'?'cash':expected==='pix'?'pix':expected==='payment_link'?'payment_link':expected==='card'?'credit_card':'credit_card';
const paymentOptions=selected=>[
  ['cash','Dinheiro'],['pix','PIX'],['credit_card','Cartão de crédito'],
  ['food_meal_card','Alimentação/refeição'],['payment_link','Link de pagamento'],['other','Outro']
].map(([value,label])=>`<option value="${value}" ${selected===value?'selected':''}>${label}</option>`).join('');

function paymentAmount(row){return parseMoneyInput(row.amount)}
function collectionTotals(){
  const due=Number(state.collectionStop?.financial?.remaining_due_cents||0);
  const received=state.collectionPayments.reduce((sum,row)=>sum+(paymentAmount(row)||0),0);
  return {due,received,remaining:due-received};
}
function updatePaymentRow(id,field,value){
  const row=state.collectionPayments.find(x=>x.id===id);if(!row)return;
  row[field]=value;
  if(field==='method'&&value!=='cash')row.tender='';
  renderPaymentRows();
}
function removePaymentRow(id){
  if(state.collectionPayments.length<=1)return;
  state.collectionPayments=state.collectionPayments.filter(x=>x.id!==id);
  renderPaymentRows();
}
function addPaymentRow(){
  if(state.collectionPayments.length>=8){status($('#collectionStatus'),'Máximo de 8 formas por recebimento.');return}
  const {remaining}=collectionTotals();
  state.collectionPayments.push({id:uid(),method:'credit_card',amount:remaining>0?centsInput(remaining):'',tender:'',reference:''});
  renderPaymentRows();
}
function renderPaymentRows(){
  const host=$('#paymentRows');if(!host)return;
  host.innerHTML='';
  state.collectionPayments.forEach((row,index)=>{
    const amount=paymentAmount(row)||0;
    const tender=row.method==='cash'?parseMoneyInput(row.tender):null;
    const change=row.method==='cash'&&tender!=null&&tender>=amount?tender-amount:0;
    const item=document.createElement('div');item.className='payment-row';item.dataset.paymentId=row.id;
    item.innerHTML=`
      <div class="payment-row-head"><strong>Pagamento ${index+1}</strong>${state.collectionPayments.length>1?`<button type="button" class="remove-payment">Remover</button>`:''}</div>
      <label>Forma recebida<select class="payment-method">${paymentOptions(row.method)}</select></label>
      <label>Valor nesta forma<input class="payment-amount" type="text" inputmode="decimal" value="${esc(row.amount)}" placeholder="0,00"></label>
      ${row.method==='cash'?`<label>Valor em dinheiro entregue<input class="payment-tender" type="text" inputmode="decimal" value="${esc(row.tender)}" placeholder="${esc(row.amount||'0,00')}"></label><div class="payment-change">${tender!=null?(tender>=amount?`Troco: <b>${money(change)}</b>`:'Valor entregue menor que esta parte do pagamento.'):'Informe o valor entregue se houver troco.'}</div>`:''}
      ${row.method!=='cash'?`<label>Referência/NSU <span class="optional">(opcional)</span><input class="payment-reference" type="text" maxlength="120" value="${esc(row.reference)}" placeholder="Não informe número do cartão"></label>`:''}
    `;
    item.querySelector('.payment-method').onchange=e=>updatePaymentRow(row.id,'method',e.target.value);
    const refreshRowChange=()=>{
      const amountNow=paymentAmount(row)||0,tenderNow=row.method==='cash'?parseMoneyInput(row.tender):null;
      const changeEl=item.querySelector('.payment-change');
      if(changeEl)changeEl.innerHTML=tenderNow!=null?(tenderNow>=amountNow?`Troco: <b>${money(tenderNow-amountNow)}</b>`:'Valor entregue menor que esta parte do pagamento.'):'Informe o valor entregue se houver troco.';
    };
    item.querySelector('.payment-amount').oninput=e=>{row.amount=e.target.value;refreshRowChange();refreshPaymentTotals()};
    item.querySelector('.payment-tender')?.addEventListener('input',e=>{row.tender=e.target.value;refreshRowChange();refreshPaymentTotals()});
    item.querySelector('.payment-reference')?.addEventListener('input',e=>{row.reference=e.target.value});
    item.querySelector('.remove-payment')?.addEventListener('click',()=>removePaymentRow(row.id));
    host.append(item);
  });
  refreshPaymentTotals();
}
function refreshPaymentTotals(){
  const {due,received,remaining}=collectionTotals();
  const totals=$('#paymentTotals');if(!totals)return;
  const ok=remaining===0&&received>0;
  totals.className=`payment-totals ${ok?'ok':remaining<0?'over':'pending'}`;
  totals.innerHTML=`<span>Total do pedido <b>${money(due)}</b></span><span>Informado <b>${money(received)}</b></span><span>${remaining===0?'Fechou corretamente':remaining>0?`Falta <b>${money(remaining)}</b>`:`Excedeu <b>${money(Math.abs(remaining))}</b>`}</span>`;
  $('#confirmCollectionBtn').disabled=!ok;
  status($('#collectionStatus'),ok?'':'A soma das formas de pagamento precisa fechar exatamente o saldo do pedido.');
}
function openCollection(stop){
  state.collectionStop=stop;const f=stop.financial;
  $('#collectionOrderInfo').innerHTML=`<b>Saldo a receber: ${money(f.remaining_due_cents)}</b><br>Cliente informou: ${methodLabel(f.expected_method)}${Number(f.change_required_cents||0)>0?` · troco previsto ${money(f.change_required_cents)}`:''}<br><small>Se pagar de outro jeito ou dividir, registre o que aconteceu de verdade.</small>`;
  const method=paymentUiMethod(f.expected_method);
  state.collectionPayments=[{
    id:uid(),
    method,
    amount:centsInput(f.remaining_due_cents),
    tender:method==='cash'&&f.tender_amount_cents!=null?centsInput(f.tender_amount_cents):'',
    reference:''
  }];
  status($('#collectionStatus'),'');renderPaymentRows();$('#collectionSheet').classList.remove('hidden');
}
function closeCollection(){
  state.collectionStop=null;state.collectionPayments=[];$('#collectionSheet').classList.add('hidden');status($('#collectionStatus'),'')
}
async function confirmCollection(){
  const stop=state.collectionStop;if(!stop)return;
  const {due,received,remaining}=collectionTotals();
  if(received<=0||remaining!==0){status($('#collectionStatus'),`A soma precisa ser exatamente ${money(due)}.`);return}
  const payments=[];
  for(let i=0;i<state.collectionPayments.length;i++){
    const row=state.collectionPayments[i],amount=paymentAmount(row);
    if(!amount||amount<=0){status($('#collectionStatus'),`Pagamento ${i+1}: informe um valor maior que zero.`);return}
    let tender=null;
    if(row.method==='cash'){
      tender=row.tender?parseMoneyInput(row.tender):amount;
      if(tender==null||tender<amount){status($('#collectionStatus'),`Pagamento ${i+1}: o dinheiro entregue não pode ser menor que ${money(amount)}.`);return}
    }
    payments.push({
      payment_method:row.method,
      amount_cents:amount,
      tender_amount_cents:tender,
      reference:row.method==='cash'?null:String(row.reference||'').trim().slice(0,120)
    });
  }
  $('#confirmCollectionBtn').disabled=true;status($('#collectionStatus'),'Registrando recebimentos e entrega…');
  try{
    const result=await act('delivered',stop.id,{
      proof:{method:'driver_confirmation'},
      collection:{payments}
    });
    closeCollection();
    if(result?.queued){
      showNotice('Recebimentos e entrega salvos offline. O servidor validará o pacote completo quando a conexão voltar.');
    }else{
      const receipts=Array.isArray(result?.receipts)?result.receipts:[];
      const observed=receipts.some(x=>x.recognition_status==='observed');
      const split=Boolean(result?.collection_bundle?.split_payment);
      if(observed)showNotice(`Entrega registrada${split?' com pagamento dividido':''}. PIX/cartões ficaram aguardando conciliação; nada foi confirmado automaticamente no fiscal.`);
      else showNotice(`Entrega e dinheiro registrados${split?' em partes':''}. O fechamento da rota ainda fará a conciliação do caixa.`);
    }
  }catch(e){status($('#collectionStatus'),`Não foi possível concluir: ${e.message}`)}
  finally{refreshPaymentTotals()}
}

async function loadRoute(){if(!state.session)return;try{state.snapshot=await edge({action:'route'});renderRoute()}catch(e){if(e.message==='driver_runtime_disabled'){routePanel.classList.add('hidden');disabled.classList.remove('hidden')}else status($('#loginStatus'),`Erro: ${e.message}`)}}

function stopGps(){if(state.gpsWatch!=null){navigator.geolocation?.clearWatch(state.gpsWatch);state.gpsWatch=null}}
function startGps(){
  const snap=state.snapshot?.snapshot||state.snapshot;if(!cfg.enabled||!cfg.gpsEnabled||snap?.route?.status!=='active'||!navigator.geolocation)return;
  stopGps();let last=0;
  state.gpsWatch=navigator.geolocation.watchPosition(async pos=>{
    if(Date.now()-last<Number(cfg.gpsIntervalSeconds||30)*1000)return;last=Date.now();
    try{await dispatchOrQueue({action:'location',route_id:snap.route.id,latitude:pos.coords.latitude,longitude:pos.coords.longitude,accuracy_m:pos.coords.accuracy,captured_at:new Date(pos.timestamp).toISOString()})}catch(e){console.warn('gps rejected',e.message)}
  },err=>console.warn('gps unavailable',err.message),{enableHighAccuracy:true,maximumAge:15000,timeout:15000});
}

async function login(){status($('#loginStatus'),'Entrando…');const {data,error}=await state.sb.auth.signInWithPassword({email:$('#email').value.trim(),password:$('#password').value});if(error){status($('#loginStatus'),error.message);return}state.session=data.session;loginPanel.classList.add('hidden');routePanel.classList.remove('hidden');await loadRoute();renderQueue();startGps()}

async function boot(){
  if(!cfg.enabled){disabled.classList.remove('hidden');app.classList.add('hidden');return}
  disabled.classList.add('hidden');app.classList.remove('hidden');state.sb=createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
  const {data}=await state.sb.auth.getSession();state.session=data.session;if(state.session){loginPanel.classList.add('hidden');routePanel.classList.remove('hidden');await loadRoute();startGps()}
  $('#loginBtn').onclick=login;$('#syncBtn').onclick=syncQueue;$('#cancelCollectionBtn').onclick=closeCollection;$('#confirmCollectionBtn').onclick=confirmCollection;$('#addPaymentBtn').onclick=addPaymentRow;
  window.addEventListener('online',()=>{updateNetwork();syncQueue()});window.addEventListener('offline',updateNetwork);updateNetwork();renderQueue();
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(console.warn);
}
function updateNetwork(){$('#networkState').textContent=navigator.onLine?'online':'offline';$('#networkState').classList.toggle('offline',!navigator.onLine)}
boot();
