import {CONFIG} from './config.js';
const AUTH_KEY='da_admin_v3_auth';
const FN='admin-whatsapp-direct-v1';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
let dashboard=null,basketData=[],activeBasket=null;

function auth(){try{return JSON.parse(localStorage.getItem(AUTH_KEY)||'null')}catch{return null}}
async function login(pin){
  const start=await fetch(`${CONFIG.supabaseUrl}/functions/v1/admin-pin-auth-v1`,{method:'POST',headers:{apikey:CONFIG.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({pin})});
  const issued=await start.json().catch(()=>({}));if(!start.ok||!issued.token_hash)throw new Error(issued.error||'Código inválido.');
  const verify=await fetch(`${CONFIG.supabaseUrl}/auth/v1/verify`,{method:'POST',headers:{apikey:CONFIG.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({type:issued.verification_type||'magiclink',token_hash:issued.token_hash})});
  const session=await verify.json().catch(()=>({}));if(!verify.ok||!session.access_token)throw new Error('Não consegui abrir a sessão.');localStorage.setItem(AUTH_KEY,JSON.stringify(session));return session;
}
async function api(action,payload={}){
  const a=auth();if(!a?.access_token)throw new Error('Faça login.');
  const r=await fetch(`${CONFIG.supabaseUrl}/functions/v1/${FN}`,{method:'POST',headers:{apikey:CONFIG.supabasePublishableKey,Authorization:`Bearer ${a.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({action,...payload})});
  const data=await r.json().catch(()=>({}));if(r.status===401){localStorage.removeItem(AUTH_KEY);throw new Error('Sessão expirada. Entre novamente.')}if(!r.ok||data.ok===false)throw new Error(data.detail||data.error||`Erro ${r.status}`);return data;
}
function showLogin(){$('loginBox').classList.remove('hidden');$('app').classList.add('hidden');setTimeout(()=>$('pinInput').focus(),30)}
function showApp(){$('loginBox').classList.add('hidden');$('app').classList.remove('hidden')}

$('pinForm').addEventListener('submit',async e=>{e.preventDefault();const pin=String($('pinInput').value||'').replace(/\D/g,'').slice(0,6);if(pin.length!==6){$('pinStatus').textContent='Digite os 6 números.';return}$('pinButton').disabled=true;$('pinStatus').textContent='Entrando…';try{await login(pin);showApp();await loadAll()}catch(err){$('pinStatus').textContent=err.message;$('pinButton').disabled=false}});
$('pinInput').addEventListener('input',()=>{$('pinInput').value=$('pinInput').value.replace(/\D/g,'').slice(0,6)});

function readinessPill(label,ok){return `<span class="dot ${ok?'ok':'bad'}">${ok?'✓':'×'} ${esc(label)}</span>`}
function renderDashboard(data){
  dashboard=data;const r=data.readiness||{},a=data.account||{},c=data.config||{};
  $('readiness').innerHTML=[readinessPill('Token Meta',r.access),readinessPill('App Secret',r.app_secret),readinessPill('Verify Token',r.verify_token),readinessPill(`Graph ${r.graph_version_value||'API'}`,r.graph_version)].join('');
  $('accountBox').innerHTML=`<div class="small">Conta</div><strong>${esc(a.display_name||'—')}</strong><div class="mono">Phone Number ID: ${esc(a.phone_number_id||'—')}<br>WABA ID: ${esc(a.waba_id||'—')}<br>Callback: ${esc(r.callback_url||'—')}</div>`;
  $('storefrontUrl').value=c.storefront_url||'';$('publicPhone').value=c.public_phone||'';$('greetingText').value=c.greeting_text||'';$('addressRequestText').value=c.address_request_text||'';$('addressAudioUrl').value=c.address_audio_url||'';$('requireLocation').value=String(c.require_location!==false);$('releaseMode').value=c.release_mode||'off';$('enabled').value=String(c.enabled===true);
  const owner=data.user?.role==='owner';$('releaseMode').disabled=!owner;$('enabled').disabled=!owner;
  $('events').innerHTML=(data.recent_events||[]).length?(data.recent_events||[]).map(x=>`<div class="template"><strong>${esc(x.event_type)}</strong><div class="small">${esc(x.direction)} · ${new Date(x.created_at).toLocaleString('pt-BR')}</div></div>`).join(''):'<div class="small">Nenhum evento direto ainda.</div>';
}
function renderTemplates(rows){
  $('templates').innerHTML=rows.map(t=>`<div class="template" data-template="${esc(t.template_key)}"><div class="fields"><label>Chave<input data-f="template_key" value="${esc(t.template_key)}" disabled></label><label>Nome aprovado na Meta<input data-f="meta_template_name" value="${esc(t.meta_template_name||'')}"></label><label class="wide">Finalidade<input data-f="purpose" value="${esc(t.purpose||'')}"></label><label class="wide">Texto<textarea data-f="body_text">${esc(t.body_text||'')}</textarea></label><label>Mídia<select data-f="media_kind"><option value="none" ${t.media_kind==='none'?'selected':''}>Sem mídia</option><option value="image" ${t.media_kind==='image'?'selected':''}>Imagem</option></select></label><label>URL da imagem<input data-f="media_url" value="${esc(t.media_url||'')}"></label><label>Ativo<select data-f="enabled"><option value="false" ${!t.enabled?'selected':''}>Não</option><option value="true" ${t.enabled?'selected':''}>Sim</option></select></label><label>Status Meta<input value="${esc(t.meta_status||'not_configured')}" disabled></label></div><div class="small">Categoria fixa: UTILITY · botões permitidos: somente respostas internas.</div><div class="actions"><button class="btn secondary" type="button" data-save-template="${esc(t.template_key)}">Salvar</button></div></div>`).join('');
}
function renderBaskets(rows){
  basketData=rows;$('baskets').innerHTML=rows.map(b=>`<div class="basket"><img src="${esc(b.image_url||'')}" alt=""><div><strong>${esc(b.name)}</strong><div class="small">R$ ${Number(b.base_price||0).toLocaleString('pt-BR',{minimumFractionDigits:2})} · ${(b.basket_template_items||[]).length} itens cadastrados</div><div class="small">${b.asset?.status==='ready'?'Arte salva':'Arte ainda não salva'}</div></div><button class="btn secondary" type="button" data-generate-basket="${esc(b.id)}">Gerar arte</button></div>`).join('');
}
async function loadAll(){try{const [d,t,b]=await Promise.all([api('dashboard'),api('templates'),api('basket_assets')]);renderDashboard(d);renderTemplates(t.templates||[]);renderBaskets(b.baskets||[])}catch(err){if(/login|sessão/i.test(err.message)){showLogin();return}alert(err.message)}}
$('reloadBtn').addEventListener('click',loadAll);
$('configForm').addEventListener('submit',async e=>{e.preventDefault();try{const data=await api('save_config',{storefront_url:$('storefrontUrl').value,public_phone:$('publicPhone').value,greeting_text:$('greetingText').value,address_request_text:$('addressRequestText').value,address_audio_url:$('addressAudioUrl').value,require_location:$('requireLocation').value==='true',release_mode:$('releaseMode').value,enabled:$('enabled').value==='true'});renderDashboard({...dashboard,config:data.config});alert('Configuração salva.')}catch(err){alert(err.message)}});
$('syncTemplates').addEventListener('click',async()=>{try{const x=await api('sync_meta_templates');alert(`Sincronizados ${x.templates?.length||0} template(s) da Meta.`);await loadAll()}catch(err){alert(err.message)}});

document.addEventListener('click',async e=>{
  const save=e.target.closest('[data-save-template]');if(save){const box=save.closest('[data-template]'),get=f=>box.querySelector(`[data-f="${f}"]`)?.value;try{await api('save_template',{template_key:box.dataset.template,meta_template_name:get('meta_template_name'),purpose:get('purpose'),body_text:get('body_text'),media_kind:get('media_kind'),media_url:get('media_url'),enabled:get('enabled')==='true',buttons:[]});alert('Template salvo.');await loadAll()}catch(err){alert(err.message)}return}
  const gen=e.target.closest('[data-generate-basket]');if(gen){const basket=basketData.find(x=>x.id===gen.dataset.generateBasket);if(basket)await renderBasketAsset(basket)}
});

function loadImage(src){return new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>resolve(img);img.onerror=reject;img.src=src})}
function fitImage(ctx,img,x,y,w,h){const r=Math.min(w/img.width,h/img.height),nw=img.width*r,nh=img.height*r;ctx.drawImage(img,x+(w-nw)/2,y+(h-nh)/2,nw,nh)}
function wrap(ctx,text,maxWidth,maxLines=2){const words=String(text||'').split(/\s+/),lines=[];let line='';for(const word of words){const test=line?`${line} ${word}`:word;if(ctx.measureText(test).width<=maxWidth)line=test;else{if(line)lines.push(line);line=word;if(lines.length>=maxLines-1)break}}if(line&&lines.length<maxLines)lines.push(line);return lines}
async function renderBasketAsset(basket){
  activeBasket=basket;const canvas=$('assetCanvas'),ctx=canvas.getContext('2d');canvas.width=1080;canvas.height=1920;ctx.clearRect(0,0,1080,1920);ctx.fillStyle='#f7f2ea';ctx.fillRect(0,0,1080,1920);
  try{const logo=await loadImage('../img/logoantonia5.png');fitImage(ctx,logo,335,38,410,150)}catch{}
  ctx.textAlign='center';ctx.fillStyle='#3f291e';ctx.font='700 54px Arial';ctx.fillText(basket.name,540,235);ctx.font='700 42px Arial';ctx.fillText(`R$ ${Number(basket.base_price||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}`,540,292);
  ctx.fillStyle='#fff';ctx.fillRect(140,330,800,470);try{const photo=await loadImage(basket.image_url);fitImage(ctx,photo,170,350,740,430)}catch{ctx.fillStyle='#6e625b';ctx.font='28px Arial';ctx.fillText('Foto da cesta indisponível',540,570)}
  ctx.textAlign='left';ctx.fillStyle='#3f291e';ctx.font='700 32px Arial';ctx.fillText('Produtos da cesta',72,858);
  const items=[...(basket.basket_template_items||[])].sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0));const mid=Math.ceil(items.length/2),cols=[items.slice(0,mid),items.slice(mid)];
  cols.forEach((rows,col)=>{let y=914;const x=72+col*510;for(const item of rows){const product=item.product||{},qty=Number(item.quantity||0);ctx.font='700 24px Arial';ctx.fillStyle='#5f2e1f';ctx.fillText(`${qty}x`,x,y);ctx.font='22px Arial';ctx.fillStyle='#2f2925';const lines=wrap(ctx,product.name||'Produto',405,2);lines.forEach((line,i)=>ctx.fillText(line,x+55,y+i*27));y+=Math.max(48,lines.length*27+14)}});
  ctx.fillStyle='#5f2e1f';ctx.fillRect(0,1740,1080,180);ctx.textAlign='center';ctx.fillStyle='#fff';ctx.font='700 31px Arial';ctx.fillText('Dona Antônia · Cuiabá e Várzea Grande',540,1800);ctx.font='700 40px Arial';ctx.fillText(dashboard?.config?.public_phone||'Telefone a confirmar',540,1852);
  $('assetTitle').textContent=basket.name;$('assetPreviewCard').classList.remove('hidden');$('assetStatus').textContent='Prévia gerada com os dados atuais do Supabase.';$('assetPreviewCard').scrollIntoView({behavior:'smooth',block:'start'});
}
$('downloadAsset').addEventListener('click',()=>{if(!activeBasket)return;const a=document.createElement('a');a.href=$('assetCanvas').toDataURL('image/png');a.download=`${activeBasket.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-')}.png`;a.click()});
$('saveAsset').addEventListener('click',async()=>{if(!activeBasket)return;$('saveAsset').disabled=true;$('assetStatus').textContent='Salvando…';try{const data=await api('save_basket_asset',{basket_id:activeBasket.id,data_url:$('assetCanvas').toDataURL('image/png')});$('assetStatus').textContent=`Salva: ${data.asset.vertical_image_url}`;await loadAll()}catch(err){$('assetStatus').textContent=err.message}finally{$('saveAsset').disabled=false}});

if(auth()?.access_token){showApp();loadAll()}else showLogin();
