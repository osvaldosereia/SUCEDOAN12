(function(){
  'use strict';

  const C=window.DA_COUNT_CONFIG||{};
  const EDGE='inventory-fast-autosave-v1';
  const EVERY=3;
  const K={
    auth:'da_count_v2_auth',
    known:'da_count_fast_known_v1',
    unknown:'da_count_fast_unknown_v1',
    operation:'da_fast_stock_operation_v1',
    device:'da_count_v2_device',
    lastTotal:'da_fast_autosave_last_total_v1',
    unknownRecorded:'da_fast_unknown_recorded_v1',
    restored:'da_fast_autosave_restored_v1'
  };
  const $=id=>document.getElementById(id);
  const dig=v=>String(v??'').replace(/\D/g,'');
  const txt=v=>String(v??'').replace(/\s+/g,' ').trim();

  let busy=false;
  let unknownBusy=false;
  let restoreTried=false;

  function read(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}}
  function write(key,value){localStorage.setItem(key,JSON.stringify(value))}
  function knownRows(){return read(K.known,[])}
  function unknownRows(){return read(K.unknown,[])}
  function totalRows(rows){return rows.reduce((sum,row)=>sum+Math.max(0,Number(row?.quantity||0)),0)}
  function totalReads(){return totalRows(knownRows())+totalRows(unknownRows())}
  function mode(){const value=sessionStorage.getItem(K.operation);return value==='add'||value==='balance'?value:''}
  function lastTotal(){const n=Number(sessionStorage.getItem(K.lastTotal)||0);return Number.isFinite(n)&&n>=0?n:0}
  function setLastTotal(value){sessionStorage.setItem(K.lastTotal,String(Math.max(0,Math.trunc(Number(value)||0))))}

  function device(){
    let value=localStorage.getItem(K.device);
    if(!value){
      const family=/Android/i.test(navigator.userAgent)?'Android':/iPhone|iPad/i.test(navigator.userAgent)?'iOS':'Browser';
      value=`${family}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
      localStorage.setItem(K.device,value);
    }
    return txt(value).slice(0,120)||'Browser';
  }

  function indicator(){
    let el=$('fastAutosaveIndicator');
    if(el)return el;
    const host=$('fastStatus')?.parentElement||$('fastMode');
    if(!host)return null;
    el=document.createElement('div');
    el.id='fastAutosaveIndicator';
    el.className='fast-autosave-indicator';
    el.textContent=`Salvamento automático: a cada ${EVERY} leituras`;
    host.appendChild(el);
    const style=document.createElement('style');
    style.textContent='.fast-autosave-indicator{margin-top:6px;font-size:9px;color:#50645a;background:#eef4ef;border-radius:8px;padding:6px 8px}.fast-autosave-indicator.busy{color:#73520d;background:#fff5dc}.fast-autosave-indicator.ok{color:#235f37;background:#eaf6ed}.fast-autosave-indicator.error{color:#8b3030;background:#f9eaea}';
    document.head.appendChild(style);
    return el;
  }
  function show(message,kind=''){
    const el=indicator();if(!el)return;
    el.textContent=message;
    el.className=`fast-autosave-indicator ${kind}`.trim();
  }

  async function refreshAuth(){
    let auth=read(K.auth,null);
    if(!auth?.refresh_token)throw new Error('Sessão expirada.');
    const r=await fetch(`${C.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,{
      method:'POST',headers:{apikey:C.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:auth.refresh_token})
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok||!data.access_token)throw new Error('Sessão expirada.');
    write(K.auth,data);return data;
  }

  async function api(action,payload={},retry=true){
    let auth=read(K.auth,null);
    if(!auth?.access_token)throw new Error('Faça login.');
    const r=await fetch(`${C.supabaseUrl}/functions/v1/${EDGE}`,{
      method:'POST',
      headers:{apikey:C.supabasePublishableKey,Authorization:`Bearer ${auth.access_token}`,'Content-Type':'application/json'},
      body:JSON.stringify({action,device_label:device(),...payload})
    });
    const data=await r.json().catch(()=>({}));
    if(r.status===401&&retry){await refreshAuth();return api(action,payload,false)}
    if(!r.ok||data.ok===false)throw new Error(data.detail||data.error||`Erro ${r.status}`);
    return data;
  }

  function mergeCanonicalRows(canonical,base){
    if(!Array.isArray(canonical)||!canonical.length)return base;
    const byCode=new Map(canonical.map(row=>[dig(row?.code||row?.product?.gtin),row]));
    return base.map(row=>{
      const code=dig(row?.code||row?.product?.gtin);
      const saved=byCode.get(code);
      if(!saved)return row;
      return {...row,product_id:saved.product_id||row.product_id,product:{...(row.product||{}),...(saved.product||{})}};
    });
  }

  async function checkpoint(force=false){
    if(busy||!navigator.onLine)return;
    const selectedMode=mode();
    if(!selectedMode)return;
    const total=totalReads();
    if(!total)return;
    const previous=lastTotal();
    if(!force&&total-previous<EVERY)return;

    const known=knownRows();
    const unknown=unknownRows();
    busy=true;
    show(`Salvando checkpoint ${total} leitura(s)…`,'busy');
    try{
      const data=await api('checkpoint',{mode:selectedMode,scan_total:total,known_rows:known,unknown_rows:unknown});
      const current=knownRows();
      const merged=mergeCanonicalRows(data.known_rows,current);
      write(K.known,merged);
      setLastTotal(total);
      show(`Checkpoint salvo · ${total} leitura(s) protegidas`,'ok');
    }catch(e){
      show(`Checkpoint pendente · ${e.message||'falha de conexão'}`,'error');
    }finally{busy=false}
  }

  async function recordUnknowns(){
    if(unknownBusy||!navigator.onLine)return;
    const rows=unknownRows().filter(row=>row?.status==='not_found'&&dig(row?.code));
    if(!rows.length)return;
    const recorded=read(K.unknownRecorded,{});
    const pending=rows.map(row=>{
      const ean=dig(row.code);const quantity=Math.max(0,Number(row.quantity||0));const sent=Math.max(0,Number(recorded[ean]||0));
      return{ean,delta:Math.max(0,quantity-sent),quantity};
    }).filter(x=>x.delta>0);
    if(!pending.length)return;

    unknownBusy=true;
    try{
      for(const item of pending){
        await api('record_unknown',{ean:item.ean,delta:item.delta});
        recorded[item.ean]=item.quantity;
        write(K.unknownRecorded,recorded);
      }
    }catch(e){
      show(`EAN não encontrado aguardando registro · ${e.message||'falha'}`,'error');
    }finally{unknownBusy=false}
  }

  async function restore(){
    if(restoreTried||!navigator.onLine)return;
    restoreTried=true;
    if(totalReads()>0)return;
    if(!read(K.auth,null)?.access_token)return;
    try{
      const data=await api('restore');
      const cp=data?.checkpoint;
      if(!cp||!Number(cp.scan_total))return;
      if(totalReads()>0)return;
      write(K.known,Array.isArray(cp.known_rows)?cp.known_rows:[]);
      write(K.unknown,Array.isArray(cp.unknown_rows)?cp.unknown_rows:[]);
      if(!mode()&&(cp.operation_mode==='add'||cp.operation_mode==='balance'))sessionStorage.setItem(K.operation,cp.operation_mode);
      setLastTotal(Number(cp.scan_total)||0);
      show(`Contagem recuperada · ${cp.scan_total} leitura(s)`,'ok');
      if(sessionStorage.getItem(K.restored)!=='1'){
        sessionStorage.setItem(K.restored,'1');
        setTimeout(()=>location.reload(),120);
      }
    }catch{}
  }

  async function completeCheckpoint(){
    try{await api('complete')}catch{}
    setLastTotal(0);
    localStorage.removeItem(K.unknownRecorded);
    sessionStorage.removeItem(K.restored);
    show(`Salvamento automático: a cada ${EVERY} leituras`);
  }

  function watchFinish(){
    let tries=0;
    const timer=setInterval(()=>{
      tries+=1;
      if(knownRows().length===0){clearInterval(timer);completeCheckpoint()}
      else if(tries>=30)clearInterval(timer);
    },500);
  }

  function tick(){
    restore();
    const total=totalReads();
    if(total===0&&lastTotal()>0)setLastTotal(0);
    if(total-lastTotal()>=EVERY)checkpoint(false);
    recordUnknowns();
  }

  function bind(){
    indicator();
    setInterval(tick,400);
    $('fastFinishButton')?.addEventListener('click',watchFinish);
    $('fastClearButton')?.addEventListener('click',()=>setTimeout(()=>{if(totalReads()===0)completeCheckpoint()},80));
    window.addEventListener('online',()=>{restore();checkpoint(true);recordUnknowns()});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&totalReads()>0)checkpoint(true)});
    tick();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);
  else bind();
})();
