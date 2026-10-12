/* Customer post-order capability; the public ?k= token never grants write permission. */
(()=>{'use strict';
const API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/order-customer-actions-v1';
const KEY_PREFIX='da_customer_action_v1:',HEX=/^[a-f0-9]{64}$/i,VIEW=/^[a-f0-9]{16}$/i;
const state={token:'',viewToken:'',data:null,busy:false,loaded:false,notice:'',noticeError:false};
const $=s=>document.querySelector(s);
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const escapeText=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(action,method='GET',body){
 const result=await fetch(API+'?action='+encodeURIComponent(action),{
  method,cache:'no-store',referrerPolicy:'no-referrer',
  headers:{'X-Customer-Action-Token':state.token,...(body?{'Content-Type':'application/json'}:{})},
  body:body?JSON.stringify(body):undefined
 });
 const data=await result.json().catch(()=>({ok:false,error:'invalid_server_response'}));
 if(!result.ok||data.ok!==true){const error=new Error(String(data.error||'service_unavailable'));error.code=data.error;throw error}
 return data;
}
async function bootstrap(){
 const params=new URLSearchParams(location.search);
 const fresh=(params.get('c')||'').trim(),publicView=(params.get('k')||'').trim();
 const token=HEX.test(fresh)?fresh:VIEW.test(publicView)?sessionStorage.getItem(KEY_PREFIX+publicView)||'':'';
 if(!HEX.test(token))return null;
 state.token=token;
 try{
  const data=await api('session');
  if(!VIEW.test(String(data.public_token||'')))throw Error('invalid_public_token');
  state.viewToken=data.public_token;state.data=data;state.loaded=true;
  sessionStorage.setItem(KEY_PREFIX+state.viewToken,token);
  if(fresh)history.replaceState(null,'','/pedido/?k='+encodeURIComponent(state.viewToken));
  return data;
 }catch{
  if(fresh)history.replaceState(null,'','/pedido/');
  state.token='';state.data=null;state.loaded=false;
  return null;
 }
}
function label(code){
 const names={
   order_changed:'O pedido foi atualizado. Revise o novo total antes de confirmar.',
   order_status_closed:'Este pedido já avançou e não aceita confirmação por aqui.',
   order_operational_data_incomplete:'Faltam dados de entrega ou pagamento. Fale com a Dona Antônia pelo WhatsApp.',
   stock_unavailable:'O estoque mudou. Entre em contato para ajustar seu pedido.',
   session_expired:'O prazo deste acesso terminou. Solicite outro link à equipe.',
   order_not_editable:'O prazo de acréscimos terminou.',
   feature_disabled:'As ofertas para acrescentar ainda não estão disponíveis.',
   addon_window_expired:'O prazo para acrescentar ofertas terminou.',
   confirmation_unavailable:'Não foi possível confirmar agora. Tente novamente.'
 };
 return names[code]||'Não foi possível concluir. Tente novamente ou fale com a Dona Antônia.';
}
const panel=document.createElement('section');
panel.id='postorderCustomerActions';
panel.className='card';
panel.style.cssText='margin-top:16px;padding:18px;border-radius:14px;display:none';
function setStatus(message,error=false){
 state.notice=message;state.noticeError=error;
 const target=panel.querySelector('[data-customer-status]');
 if(target){target.textContent=message;target.style.color=error?'#a02f27':'#276b43'}
}
async function startAddon(){
 if(state.busy)return;state.notice='';state.busy=true;renderPanel();
 try{
  const info=await api('addon_session','POST',{});
  location.href='/adicionar/?k='+encodeURIComponent(state.viewToken)+'#t='+encodeURIComponent(info.addon_token);
 }catch(e){state.busy=false;renderPanel();setStatus(label(e.code),true)}
}
async function confirm(){
 if(state.busy||!state.data?.can_confirm)return;
 state.notice='';const agreed=window.confirm('Confirmar seu pedido no valor total de '+money(state.data.total)+'? Depois de confirmar, não será possível acrescentar ofertas.');
 if(!agreed)return;
 state.busy=true;renderPanel();
 try{
  const snapshot=state.data;
  await api('confirm','POST',{
   expected_total:snapshot.total,expected_total_cents:Math.round(Number(snapshot.total)*100),
   expected_updated_at:snapshot.updated_at
  });
  const latest=await api('session');state.data=latest;
  renderPanel();setStatus('Pedido confirmado! Nossa equipe já pode preparar sua entrega.');
  setTimeout(()=>location.reload(),1300);
 }catch(e){
  if(e.code==='order_changed'){
   try{state.data=await api('session')}catch{}
   renderPanel();
  }
  setStatus(label(e.code),true);
 }finally{state.busy=false;renderPanel()}
}
function renderPanel(){
 if(!state.data)return;
 panel.style.display='block';
 const s=state.data,received=s.status==='storefront_received'&&s.can_confirm===true;
 if(!received){
  panel.innerHTML='<h2 style="margin:0 0 10px;font-size:18px">Situação do pedido</h2><p style="margin:0">'+
    (s.status==='confirmed'?'✅ Pedido confirmado. Obrigado!':'Este pedido não está mais aguardando confirmação.')+'</p>';
  return;
 }
 panel.innerHTML='<h2 style="margin:0 0 5px;font-size:18px">Confirme seu pedido</h2>'+
  '<p style="margin:0 0 12px;color:#647469;font-size:14px">Confira os produtos e o valor antes de autorizar a preparação.</p>'+
  '<div style="display:flex;justify-content:space-between;gap:12px;margin:0 0 14px"><strong>Total do pedido</strong><strong>'+escapeText(money(s.total))+'</strong></div>'+
  '<button type="button" id="postorderOffers" style="width:100%;min-height:49px;background:#fff;color:#176b43;border:1px solid #176b43;border-radius:10px;font-weight:750;margin-bottom:10px" '+(state.busy?'disabled':'')+'>🛍️ Ver ofertas e acrescentar à sacola</button>'+
  '<button type="button" id="postorderConfirm" style="width:100%;min-height:52px;background:#176b43;color:white;border:0;border-radius:10px;font-weight:800" '+(state.busy?'disabled':'')+'>✅ CONFIRMAR MEU PEDIDO</button>'+
  '<p style="font-size:13px;margin:10px 0 0;color:#65736b">Você também pode confirmar sem acrescentar ofertas.</p>'+
  '<p data-customer-status role="status" aria-live="polite" style="font-size:13px;margin:8px 0 0"></p>';
 $('#postorderOffers').onclick=startAddon;
 $('#postorderConfirm').onclick=confirm;
 if(state.notice)setStatus(state.notice,state.noticeError);
}
function render(data){
 if(!state.loaded||!state.data)return;
 const snapshotTotal=Number(data?.snapshot?.final_total??data?.snapshot?.total??state.data.total);
 if(data?.current_status!==state.data.status||Math.abs(snapshotTotal-Number(state.data.total))>0.005){
   api('session').then(next=>{state.data=next;renderPanel()}).catch(()=>{});
 }
 const root=$('#app');if(root?.parentNode&&panel.parentNode!==root.parentNode)root.parentNode.insertBefore(panel,root.nextSibling);
 renderPanel();
}
window.DACustomerActions={bootstrap,render};
})();