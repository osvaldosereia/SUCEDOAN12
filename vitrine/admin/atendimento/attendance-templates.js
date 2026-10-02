const TEMPLATE_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-whatsapp-templates-v1';
const ATTENDANCE_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-whatsapp-ops-v1';
const ADMIN_TOKEN_KEY='da_finance_access_token_v1';
const ADMIN_PUBLIC_KEY='sb_publishable_tFXHtH0HCXZepVtwgKElIg_DxS76Gu8';

const $=selector=>document.querySelector(selector);
let accountsByChannel={};
let syncing=false;

function adminToken(){return String(sessionStorage.getItem(ADMIN_TOKEN_KEY)||'').trim()}
function activeChannel(){return String($('[data-channel-switch].active')?.dataset?.channelSwitch||'').trim()}
function channelByPhone(phone){const digits=String(phone||'').replace(/\D/g,'');if(digits.endsWith('0975'))return '0975';if(digits.endsWith('1018'))return '1018';return null}

async function adminGet(baseUrl,params={}){
  const token=adminToken();
  if(!token)throw new Error('admin_session_required');
  const url=new URL(baseUrl);
  for(const [key,value] of Object.entries(params))if(value!==null&&value!==undefined&&value!=='')url.searchParams.set(key,String(value));
  const response=await fetch(url,{method:'GET',headers:{Authorization:`Bearer ${token}`,apikey:ADMIN_PUBLIC_KEY},cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok===false)throw new Error(data?.error||`templates_${response.status}`);
  return data;
}

async function ensureAccounts(){
  if(Object.keys(accountsByChannel).length===2)return accountsByChannel;
  const data=await adminGet(ATTENDANCE_API,{action:'accounts'});
  const next={};
  for(const account of data.items||[]){const channel=channelByPhone(account.phone_e164);if(channel)next[channel]=account}
  accountsByChannel=next;
  return next;
}

function bodyPreview(components){
  const body=(Array.isArray(components)?components:[]).find(item=>String(item?.type||'').toUpperCase()==='BODY');
  return String(body?.text||'').trim();
}

function setStatus(text,tone='neutral'){
  const node=$('#templatesStatus');if(!node)return;node.textContent=text;node.dataset.tone=tone;
}

function renderTemplates(items,channel){
  const list=$('#templatesList');if(!list)return;list.replaceChildren();
  const approved=(Array.isArray(items)?items:[]).filter(item=>String(item?.status||'').toUpperCase()==='APPROVED');
  if(!approved.length){const empty=document.createElement('div');empty.className='context-empty';empty.textContent=`Nenhum template aprovado encontrado no canal ${channel}.`;list.append(empty);return}
  for(const item of approved){
    const card=document.createElement('div');card.className='manager-row template-cache-item';
    const main=document.createElement('div');
    const title=document.createElement('strong');title.textContent=String(item.name||'Template');
    const meta=document.createElement('small');meta.textContent=`${item.language||'—'} · ${item.category||'—'} · APROVADO`;
    main.append(title,meta);
    const preview=bodyPreview(item.components);if(preview){const text=document.createElement('span');text.textContent=preview;main.append(text)}
    card.append(main);list.append(card);
  }
}

async function syncCurrentChannel(){
  if(syncing)return;
  const channel=activeChannel();if(!channel){setStatus('Canal não localizado.','error');return}
  syncing=true;const button=$('#templateSyncBtn');if(button)button.disabled=true;
  setStatus(`Sincronizando templates do ${channel}…`);
  try{
    const accounts=await ensureAccounts();const account=accounts[channel];if(!account?.id)throw new Error('account_not_found');
    const data=await adminGet(TEMPLATE_API,{action:'sync',account_id:account.id});
    renderTemplates(data.items||[],channel);
    const approved=(data.items||[]).filter(item=>String(item?.status||'').toUpperCase()==='APPROVED').length;
    setStatus(`${approved} template${approved===1?'':'s'} aprovado${approved===1?'':'s'} no canal ${channel}.`,'success');
  }catch(error){
    const code=String(error?.message||'');
    const message=code==='admin_session_required'?'Aguarde a Central concluir o login e clique em Atualizar.':'Não foi possível sincronizar os templates agora.';
    setStatus(message,'error');
    const list=$('#templatesList');if(list){list.replaceChildren();const empty=document.createElement('div');empty.className='context-empty';empty.textContent=message;list.append(empty)}
  }finally{syncing=false;if(button)button.disabled=false}
}

function closeTemplates(){const menu=$('#templatesMenu');if(menu)menu.hidden=true}
function toggleTemplates(){
  const menu=$('#templatesMenu');if(!menu)return;menu.hidden=!menu.hidden;
  if(!menu.hidden)syncCurrentChannel().catch(()=>{});
}

function bind(){
  const button=$('#templatesBtn'),sync=$('#templateSyncBtn');if(!button||!sync)return;
  button.addEventListener('click',toggleTemplates);
  sync.addEventListener('click',()=>syncCurrentChannel().catch(()=>{}));
  for(const id of ['catalogBtn','quickRepliesBtn','productsBtn','moreToolsBtn'])$(`#${id}`)?.addEventListener('click',closeTemplates);
  document.querySelectorAll('[data-channel-switch]').forEach(channelButton=>channelButton.addEventListener('click',()=>{
    accountsByChannel={};
    const menu=$('#templatesMenu');if(menu&&!menu.hidden)setTimeout(()=>syncCurrentChannel().catch(()=>{}),120);
  }));
}

bind();
