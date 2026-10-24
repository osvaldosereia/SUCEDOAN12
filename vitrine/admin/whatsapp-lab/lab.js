import {latestCanaryReply,CANARY_CONVERSATION} from './reply-parser.mjs?v=20261024-4';
import {collectBasketVariants,buildMetaCatalogCsv,buildSizeListMessage,buildCombinationsListMessage,buildMetaProductListPreview,validatePreviewPayload} from './catalog-tools.mjs?v=20261024-2';
import {attendanceJsonApi,attendanceAuthorizedFetch} from '../atendimento/attendance-auth.js?v=auth-refresh-v2';

const STORE='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/storefront-v2';
const CANARY_URL='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-whatsapp-1018-canary-v1';
const SIZE_ORDER=['economica','mini','pequena','media','grande'];
const SIZE_LABELS={economica:'Econômica',mini:'Mini',pequena:'Pequena',media:'Média',grande:'Grande'};
const LIVE_TEST_ENABLED=false; // OFF: the two company numbers currently have ANA enabled.
const TEST_CONVERSATION_ID='ff5c1e73-f3ed-4b88-8eba-b6e3a9883941';
const TEST_RECIPIENT='+5565998150975';
const ORIGIN_CHANNEL='+5565984491018';
const $=id=>document.getElementById(id);
const state={account1018:null,models:[],variants:new Map(),loading:true,selection:null,items:[],officialPrice:null,quoteReady:false,quoteSequence:0,quoteTimer:null,alternatives:new Map(),openPosition:null,extras:new Map(),searchResults:[],searchTimer:null,busy:false,lastUpdate:null,metaSelectedSize:null,canary:null,canaryBusy:false,verifiedChoiceId:null,originalCompositionChanged:false};

function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function money(cents){return Number.isFinite(Number(cents))?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(cents)/100):'—';}
function imageTag(src,name){let url;try{url=new URL(String(src||''));}catch{return '<span class="no-img">◇</span>';}if(url.protocol!=='https:')return '<span class="no-img">◇</span>';return '<img loading="lazy" decoding="async" referrerpolicy="no-referrer" alt="'+escapeHtml(name||'Produto')+'" src="'+escapeHtml(url.href)+'">';}
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function sendStatus(text,type=''){$('sendStatus').textContent=text;$('sendStatus').className='send-status '+type;}
async function store(action,params={},method='GET'){
  const url=new URL(STORE);url.searchParams.set('action',action);
  const options={method,cache:'no-store',headers:{}};
  if(method==='GET'){for(const [key,value] of Object.entries(params))if(value!==null&&value!==undefined)url.searchParams.set(key,String(value));}
  else{options.headers['Content-Type']='application/json';options.body=JSON.stringify(params);}
  const response=await fetch(url,options);
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok===false){const error=new Error(String(data.error||'catalog_request_failed'));error.code=data.error||response.status;throw error;}
  return data;
}
function choiceKey(model,number){return model.id+'@'+number;}
function variantFor(model,number){return state.variants.get(choiceKey(model,number));}
function validVariant(detail){return Boolean(detail?.basket?.display_price_cents>=0&&Array.isArray(detail.items)&&detail.items.length);}
function displayPrice(model,n){const v=variantFor(model,n);if(v?.pending)return 'Carregando…';return validVariant(v?.data)?money(v.data.basket.display_price_cents):'Indisponível';}
function renderPrices(){
  $('priceGrid').innerHTML=state.models.map(model=>{
    const options=[1,2,3].map(n=>{
      const v=variantFor(model,n),active=state.selection?.key===choiceKey(model,n),ready=validVariant(v?.data);
      return '<button class="choice '+(active?'active ':'')+(!ready?'unavailable':'')+'" data-choice="'+escapeHtml(choiceKey(model,n))+'" type="button" '+(!ready?'disabled':'')+' aria-pressed="'+(active?'true':'false')+'"><small>Combinação '+n+'</small><b>'+escapeHtml(displayPrice(model,n))+'</b></button>';
    }).join('');
    return '<article class="price-card"><h3>Cesta '+escapeHtml(SIZE_LABELS[model.size_key]||model.name)+'</h3>'+options+'</article>';
  }).join('');
}
function currentExtraCents(){let result=0;for(const {product,quantity} of state.extras.values())result+=Number(product.price_cents||0)*quantity;return result;}
function currentTotalCents(){return state.quoteReady&&Number.isFinite(state.officialPrice)?state.officialPrice+currentExtraCents():null;}
function renderDetail(){
  if(!state.selection){$('detail').innerHTML='<div class="empty">Selecione uma das 15 combinações para começar.</div>';return;}
  const basket=state.selection,head='<div class="detail-heading"><div><h3>Cesta '+escapeHtml(basket.label)+' · Combinação '+basket.number+'</h3><p>Escolha marcas, mude quantidades ou retire produtos. Alterações não são salvas.</p></div><div class="total">'+(state.quoteReady?money(state.officialPrice):'Calculando…')+'</div></div>';
  const items=state.items.map((row,index)=>{
    const available=state.alternatives.get(row.position_id)||[],open=state.openPosition===row.position_id;
    const options=open?'<div class="options"><h4>Alternativas para '+escapeHtml(row.label||row.name)+'</h4>'+(available.length?available.map(o=>'<button class="option" type="button" data-alternative="'+escapeHtml(row.position_id)+'" data-product="'+escapeHtml(o.product_id)+'"><strong>'+escapeHtml(o.name)+'</strong><small>'+money(o.price_cents)+' · Estoque disponível: '+escapeHtml(o.stock_quantity)+'</small></button>').join(''):'<p class="placeholder">Nenhuma alternativa disponível no estoque.</p>')+'<button class="mini-btn" type="button" data-close-options="1">Fechar</button></div>':'';
    return '<div class="item '+(row.quantity===0?'removed':'')+'">'+imageTag(row.image_url,row.name)+'<div><strong>'+escapeHtml(row.name)+'</strong><small>'+escapeHtml(row.label)+' · '+(row.quantity===0?'Retirado da cesta':'Quantidade: '+row.quantity)+'</small></div><div class="item-actions"><button class="mini-btn" type="button" data-decrease="'+index+'" aria-label="Diminuir quantidade">−</button><span class="count">'+row.quantity+'</span><button class="mini-btn" type="button" data-increase="'+index+'" aria-label="Aumentar quantidade">+</button><button class="mini-btn" type="button" data-swap="'+index+'">Trocar marca</button></div>'+options+'</div>';
  }).join('');
  const valid=state.quoteReady&&state.officialPrice!==null;
  $('detail').innerHTML=head+'<div class="items">'+items+'</div><div class="totals"><span>Subtotal cesta '+(valid?'+ extras':'(aguardando recálculo)')+'</span><strong class="total">'+(valid?money(currentTotalCents()):'—')+'</strong></div><p class="notice">Valores consultados ao motor oficial de cestas. Extras exibidos como estimativa. Esta tela é somente um laboratório, não confirma pedidos.</p>';
}
function renderExtras(){
  const chosen=[...state.extras.values()];
  $('extraSelected').innerHTML=chosen.length?'<h3 style="font-size:13px">Adicionados à simulação</h3>'+chosen.map(({product,quantity})=>'<div class="extra-picked"><span>'+escapeHtml(product.name)+' · '+money(Number(product.price_cents)*quantity)+'</span><button class="mini-btn" type="button" data-extra-minus="'+escapeHtml(product.id)+'">−</button><b>'+quantity+'</b><button class="mini-btn" type="button" data-extra-plus="'+escapeHtml(product.id)+'">+</button></div>').join(''):'';
  $('extraResults').innerHTML=state.searchResults.length?state.searchResults.slice(0,8).map(p=>'<div class="extra-result">'+imageTag(p.image_url,p.name)+'<span><strong>'+escapeHtml(p.name)+'</strong><br><small>'+money(p.price_cents)+' · '+escapeHtml(p.stock_quantity)+' em estoque</small></span><button type="button" class="mini-btn" data-add-extra="'+escapeHtml(p.id)+'">Adicionar</button></div>').join(''):'<p class="placeholder">Busque um produto para adicionar à simulação.</p>';
}
function buildPricesMessage(){
  const lines=['Dona Antônia | Cestas Básicas','Confira nossas 5 cestas e as 3 opções de marcas:',''];
  for(const m of state.models)lines.push('Cesta '+(SIZE_LABELS[m.size_key]||m.name)+':\n'+[1,2,3].map(n=>' '+n+'. '+displayPrice(m,n)).join('\n'));
  lines.push('','Responda com o tamanho e a combinação desejada. Você pode trocar marcas, mudar quantidades e acrescentar produtos antes de confirmar.','Preços e disponibilidade sujeitos à confirmação.');
  return lines.join('\n');
}
function buildBasketMessage(){
  if(!state.selection)return 'Selecione uma combinação para montar a resposta.';
  const lines=['Dona Antônia | Cesta '+state.selection.label+' · combinação '+state.selection.number,'','Composição:'];
  for(const item of state.items)if(item.quantity>0)lines.push(item.quantity+'× '+item.name);
  if(state.extras.size){lines.push('','Produtos extras:');for(const {product,quantity} of state.extras.values())lines.push(quantity+'× '+product.name);}
  lines.push('','Subtotal da cesta: '+(state.quoteReady?money(state.officialPrice):'aguardando cálculo'));
  if(state.extras.size)lines.push('Extras (estimativa): '+money(currentExtraCents()));
  lines.push('Total preliminar: '+(currentTotalCents()===null?'aguardando cálculo':money(currentTotalCents())),'','Esta é uma prévia para conferência. Os valores e a disponibilidade devem ser confirmados no pedido.');
  return lines.join('\n');
}
function currentMessage(){return $('messageMode').value==='basket'?buildBasketMessage():buildPricesMessage();}
function updatePreview(){
  const text=currentMessage();
  $('preview').textContent=text;
  const ready=Boolean(state.account1018)&&!state.loading&&($('messageMode').value!=='basket'||Boolean(state.selection&&state.quoteReady));
  $('copyBtn').disabled=!ready;
  $('sendBtn').disabled=!LIVE_TEST_ENABLED||!ready||state.busy||text.length>3900;
  renderCompositionPreview();
}

function renderCompositionPreview(){
  const ready=Boolean(state.selection)&&state.quoteReady&&Number.isSafeInteger(Number(state.officialPrice))&&Number(state.officialPrice)>=0;
  const body=ready?buildBasketMessage():'Selecione uma das 15 combinações ou use “Ler escolha do cliente” para abrir a cesta escolhida. Aguarde o valor ser calculado.';
  const withinLimit=body.length<=3900;
  $('compositionPreview').textContent=withinLimit?body:'A composição excede o limite seguro para uma única mensagem. Revise os itens na tela do Admin.';
  $('copyCompositionBtn').disabled=!ready||!withinLimit;
}
async function copyBasketComposition(){
  if($('copyCompositionBtn').disabled||!state.selection||!state.quoteReady)return;
  const text=buildBasketMessage();
  if(text.length>3900)return;
  try{
    await navigator.clipboard.writeText(text);
    sendStatus('Composição copiada para conferência. Nenhuma mensagem foi enviada.','success');
  }catch{
    sendStatus('Não foi possível copiar. Confira a prévia exibida acima.','error');
  }
}

function snapshotForMeta(){return collectBasketVariants(state.models,state.variants);}
function metaPayload(snapshot){
  const kind=$('metaPayloadKind').value;
  if(kind==='products')return buildMetaProductListPreview(snapshot,'ID_DO_CATALOGO_META');
  if(kind==='combinations'){
    const size=state.metaSelectedSize||state.models.find(m=>m.id===state.selection?.modelId)?.size_key||'economica';
    return buildCombinationsListMessage(snapshot,size);
  }
  return buildSizeListMessage(snapshot);
}
function renderMeta(){
  const snap=snapshotForMeta(),ready=snap.ready&&!state.loading;
  const warnings=[...snap.issues];
  $('exportCatalogBtn').disabled=!ready;
  const total=snap.rows.length;
  const bad=total!==15||warnings.length>0;
  const reasons=bad?(warnings.slice(0,4).join(' | ')+(warnings.length>4?' (+ '+(warnings.length-4)+' observações)':'')):'';
  $('metaReadiness').classList.toggle('invalid',bad&&!state.loading);
  $('metaReadiness').textContent=state.loading?'Carregando composições e preços…':
    total+' de 15 versões disponíveis para exportação. '+(bad?reasons:'CSV pronto para importação manual na Meta.');
  let payload=null;
  try{payload=metaPayload(snap);if(!validatePreviewPayload(payload))throw new Error('meta_interactive_structure_invalid');}
  catch(error){$('metaPayloadJson').textContent='Não é possível montar o exemplo: '+String(error.message||error);}
  if(payload){$('metaPayloadJson').textContent=JSON.stringify(payload,null,2);}
  $('copyMetaPayloadBtn').disabled=!payload;
  const size=state.metaSelectedSize;
  const rows=size?snap.rows.filter(r=>r.size===size):SIZE_ORDER.map(k=>({size:k,name:SIZE_LABELS[k]}));
  const items=rows.map(row=>{
    if(!size){
      const choices=snap.rows.filter(x=>x.size===row.size);
      const cents=choices.map(x=>x.priceCents);
      const priceText=choices.length===3?'de '+money(Math.min(...cents)):'Ver opções';
      return '<button type="button" class="meta-choice-item" data-meta-size="'+escapeHtml(row.size)+'"><span><strong>Cesta '+escapeHtml(row.name)+'</strong><small>3 combinações de marcas</small></span><b>'+escapeHtml(priceText)+'</b></button>';
    }
    return '<button type="button" class="meta-choice-item" data-meta-combo="'+escapeHtml(row.size)+'" data-meta-combo-n="'+row.number+'"><span><strong>Combinação '+row.number+'</strong><small>'+(row.stock>0?'Marcas e produtos disponíveis':'Confirmar disponibilidade')+'</small></span><b>'+money(row.priceCents)+'</b></button>';
  }).join('');
  $('metaInteractivePreview').innerHTML='<div class="meta-sample-head"><strong>'+(size?'Cesta '+escapeHtml(SIZE_LABELS[size]):'Escolha o tamanho da cesta')+'</strong><span class="meta-sample-step">'+(size?'Etapa 2 de 2':'Etapa 1 de 2')+'</span></div><div class="meta-choice-grid">'+(items||'<p class="placeholder">Não há combinações completas disponíveis.</p>')+'</div>'+(size?'<button type="button" class="meta-preview-back" id="metaPreviewBack">← Voltar aos tamanhos</button>':'');
}
function downloadMetaCatalog(){
  const snapshot=snapshotForMeta();
  if(!snapshot.ready){sendStatus('Não é possível exportar 15 versões sem preço, composição e imagem válidos.','error');return;}
  try{
    const csv=buildMetaCatalogCsv(snapshot);
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download='dona-antonia-meta-cestas-15-'+new Date().toISOString().slice(0,10)+'.csv';
    link.style.display='none';document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    sendStatus('CSV com 15 versões gerado. A importação na Meta é manual; nenhuma publicação foi feita.','success');
  }catch(error){sendStatus('Erro ao gerar arquivo de catálogo: '+String(error.message||error),'error');}
}
async function copyMetaPayload(){
  let payload;
  try{payload=metaPayload(snapshotForMeta());if(!validatePreviewPayload(payload))throw new Error('invalid_preview_payload');}
  catch(error){sendStatus('Prévia inválida: '+String(error.message||error),'error');return;}
  try{await navigator.clipboard.writeText(JSON.stringify(payload,null,2));sendStatus('Exemplo de payload da Meta copiado. NÃO foi enviado.','success');}
  catch{sendStatus('Não foi possível copiar. Abra a estrutura JSON abaixo.','error');}
}


const CANARY_ERROR_LABELS={
  service_window_closed:'A janela de 24 horas está fechada. Envie uma mensagem do número final 8360 para o 1018 e clique em Verificar novamente.',
  human_mode_required:'A conversa de homologação precisa permanecer em atendimento humano.',
  meta_transport_unavailable:'Transporte Meta ou configuração do emissor indisponível.',
  test_conversation_not_found:'A conversa de teste 1018 → 8360 ainda não existe.',
  meta_channel_not_ready:'O canal 1018 não está homologado para envio Meta.',
  already_sent_or_attempted_today:'O limite de um envio desse tipo por dia foi atingido.',
  admin_auth_required:'Abra o Vitrine Admin e autentique-se.',
  canary_audit_unavailable:'Serviço de auditoria indisponível; envio não realizado.',
  admin_write_required:'É necessário acesso administrativo de escrita para esse teste.'
};
function canaryError(code){return CANARY_ERROR_LABELS[code]||String(code||'Condição não atendida');}
function canaryKind(){return $('metaPayloadKind').value==='combinations'?'combinations':'sizes';}
function canaryPayload(){
  const snap=snapshotForMeta();
  if(!snap.ready)throw new Error('As 15 composições devem estar disponíveis antes do envio.');
  if($('metaPayloadKind').value==='products')throw new Error('Envio de produtos exige catálogo da Meta vinculado. Selecione uma lista interativa.');
  const payload=metaPayload(snap);
  if(!validatePreviewPayload(payload)||payload?.interactive?.type!=='list')throw new Error('Prévia interativa inválida.');
  return payload;
}
function refreshCanaryControls(){
  const kind=canaryKind();
  const used=(state.canary?.sent_today||[]).some(x=>x.kind===kind);
  const ready=state.canary?.can_send===true&&snapshotForMeta().ready&&!state.canaryBusy&&!state.loading&&!used&&$('metaPayloadKind').value!=='products';
  $('canarySendBtn').disabled=!ready;
  $('canarySendBtn').textContent=state.canaryBusy?'Verificando envio…':kind==='combinations'?'Enviar 3 combinações ao 8360':'Enviar 5 tamanhos ao 8360';
  const supported=Array.isArray(state.canary?.capabilities)&&state.canary.capabilities.includes('composition');
  const alreadySent=(state.canary?.sent_today||[]).some(x=>x.kind==='composition');
  const size=state.models.find(m=>m.id===state.selection?.modelId)?.size_key;
  const matched=Boolean(size&&state.selection&&state.verifiedChoiceId==='da:whatsapp:basket:'+size+':'+state.selection.number);
  $('sendCompositionBtn').disabled=!supported||state.canary?.can_send!==true||!matched||!state.quoteReady||state.originalCompositionChanged||state.canaryBusy||state.loading||alreadySent;
  $('sendCompositionBtn').textContent=!supported?'Composição: serviço pendente':alreadySent?'Composição já testada hoje':'Enviar composição ao 8360';
}
async function fetchCanary(){
  state.canary=null;
  $('canaryStatus').textContent='Consultando o canal 1018 e a janela de atendimento…';
  $('canaryRefreshBtn').disabled=true;
  refreshCanaryControls();
  try{
    const response=await attendanceAuthorizedFetch(CANARY_URL,{method:'GET',cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok)throw new Error(data.error||'canary_preflight_unavailable');
    state.canary=data;
    const used=(data.sent_today||[]).map(x=>x.kind==='sizes'?'Tamanhos':'Combinações');
    const ready=data.can_send===true;
    $('canaryStatus').textContent=ready?'Canal 1018 e conversa humana com 8360 verificados. Janela válida até '+new Date(data.window_until).toLocaleString('pt-BR')+(used.length?' · Usados hoje: '+used.join(', '):''):canaryError(data.reason||'canary_not_ready');
    $('canaryStatus').classList.toggle('invalid',!ready);
  }catch(error){
    $('canaryStatus').textContent='Verificação indisponível: '+canaryError(error.message);
    $('canaryStatus').classList.add('invalid');
  }finally{$('canaryRefreshBtn').disabled=false;refreshCanaryControls();}
}

async function readCustomerReply(){
  const button=$('readReplyBtn');
  state.verifiedChoiceId=null;refreshCanaryControls();
  button.disabled=true;$('replyStatus').classList.remove('invalid');
  $('replyStatus').textContent='Lendo as últimas escolhas recebidas pelo canal 1018…';
  try{
    const data=await attendanceJsonApi('conversation',{conversation_id:CANARY_CONVERSATION,limit:35});
    const reply=latestCanaryReply(data);
    if(!reply){
      $('replyStatus').textContent='Nenhuma seleção interativa de cesta foi encontrada nesta conversa de teste.';
      return;
    }
    const age=Date.now()-Date.parse(reply.receivedAt||'');
    if(!Number.isFinite(age)||age<0||age>7*86400000){
      $('replyStatus').textContent='Existe uma seleção antiga, mas ela não será usada para continuar este teste.';
      return;
    }
    const model=state.models.find(x=>x.size_key===reply.size);
    if(!model)throw new Error('O tamanho escolhido ainda não está disponível no catálogo atual.');
    const label=SIZE_LABELS[reply.size]||reply.size;
    state.metaSelectedSize=reply.size;
    if(reply.kind==='size'){
      $('metaPayloadKind').value='combinations';
      renderMeta();refreshCanaryControls();
      $('replyStatus').textContent='Recebido: Cesta '+label+'. As três combinações e seus preços estão prontos abaixo. Clique em “Enviar 3 combinações ao 8360” para enviar o próximo menu interativo.';
    }else{
      $('metaPayloadKind').value='combinations';
      const key=choiceKey(model,reply.number);
      const detail=state.variants.get(key);
      if(!validVariant(detail?.data))throw new Error('A combinação selecionada está indisponível no estoque atual.');
      choose(key);
      state.verifiedChoiceId=reply.id;refreshCanaryControls();
      $('replyStatus').textContent='Recebido: Cesta '+label+', combinação '+reply.number+'. A composição e os preços foram abertos para conferência e personalização. Nenhuma mensagem foi enviada automaticamente.';
    }
  }catch(error){
    $('replyStatus').classList.add('invalid');
    $('replyStatus').textContent='Falha ao ler escolha: '+String(error?.message||error);
  }finally{button.disabled=false;refreshCanaryControls();}
}

async function sendBasketComposition(){
  if(!state.canary?.capabilities?.includes('composition')||state.canaryBusy||state.canary.can_send!==true||!state.selection||!state.verifiedChoiceId||state.originalCompositionChanged||!state.quoteReady)return;
  const size=state.models.find(m=>m.id===state.selection.modelId)?.size_key;
  const choice='da:whatsapp:basket:'+size+':'+state.selection.number;
  if(!size||choice!==state.verifiedChoiceId||(state.canary.sent_today||[]).some(x=>x.kind==='composition'))return;
  if(!confirm('Enviar a composição original da Cesta '+state.selection.label+', combinação '+state.selection.number+', exclusivamente do 1018 para o número de teste 8360? O servidor recalculará os dados.'))return;
  state.canaryBusy=true;refreshCanaryControls();sendStatus('Revalidando escolha, preço e estoque antes do teste…');
  try{
    const response=await attendanceAuthorizedFetch(CANARY_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request_id:crypto.randomUUID(),kind:'composition',expected_choice_id:choice})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.ok!==true)throw Error(canaryError(data.error||'composition_send_not_confirmed'));
    sendStatus('A Meta aceitou a composição enviada ao teste 8360. Confira o recebimento no WhatsApp.','success');
  }catch(error){sendStatus('Envio não confirmado: '+String(error.message||error)+'. Não haverá reenvio automático.','error');}
  finally{state.canaryBusy=false;await fetchCanary();}
}

async function sendCanary(){
  if(state.canaryBusy||!state.canary?.can_send)return;
  let payload;
  try{payload=canaryPayload();}catch(error){sendStatus(String(error.message),'error');return;}
  const kind=canaryKind();
  if((state.canary.sent_today||[]).some(x=>x.kind===kind))return;
  if(!confirm('Confirmar envio REAL pela Meta? Origem 1018. Destino interno final 8360. Tipo: '+(kind==='sizes'?'5 tamanhos':'3 combinações')+'. Não haverá reenvio automático.'))return;
  state.canaryBusy=true;refreshCanaryControls();
  sendStatus('Enviando uma mensagem interativa somente ao número final 8360…');
  try{
    const response=await attendanceAuthorizedFetch(CANARY_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({request_id:crypto.randomUUID(),kind,size_key:state.metaSelectedSize||state.models.find(m=>m.id===state.selection?.modelId)?.size_key||'economica',payload})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.ok!==true)throw new Error(canaryError(data.error||'canary_send_unconfirmed'));
    sendStatus('A Meta aceitou a lista interativa. Confira a chegada no WhatsApp final 8360 e a resposta ao 1018.','success');
  }catch(error){sendStatus('O envio NÃO foi confirmado: '+String(error.message||error)+'. Não será reenviado automaticamente.','error');}
  finally{state.canaryBusy=false;await fetchCanary();}
}

function updateAll(){renderPrices();renderDetail();renderExtras();updatePreview();renderMeta();refreshCanaryControls();}
async function load(){
  if(state.busy)return;
  state.loading=true;state.variants.clear();state.selection=null;state.verifiedChoiceId=null;state.originalCompositionChanged=false;state.items=[];state.officialPrice=null;state.quoteReady=false;state.extras.clear();state.searchResults=[];
  $('refreshBtn').disabled=true;$('extraSearch').disabled=true;$('extraSearch').value='';sendStatus('');
  try{
    status('Validando sessão do Vitrine Admin…');
    const accounts=await attendanceJsonApi('accounts');
    state.account1018=(accounts.items||[]).find(a=>String(a.phone_e164).replace(/\D/g,'')===ORIGIN_CHANNEL.replace(/\D/g,''))||null;
    if(!state.account1018)throw new Error('O canal Meta 1018 não está cadastrado na Central.');
    status('Lendo os modelos de cestas do site…');
    const data=await store('home_size_cards');
    const found=new Map((data.baskets||[]).map(x=>[x.size_key,x]));
    state.models=SIZE_ORDER.map(key=>found.get(key)).filter(Boolean);
    if(state.models.length!==5)throw new Error('A vitrine não retornou os cinco tamanhos de cesta.');
    const jobs=[];for(const m of state.models)for(let n=1;n<=3;n++){jobs.push({model:m,n});state.variants.set(choiceKey(m,n),{pending:true});}
    renderPrices();renderMeta();
    let cursor=0,finished=0;
    await Promise.all(Array.from({length:3},async()=>{
      while(cursor<jobs.length){
        const job=jobs[cursor++],key=choiceKey(job.model,job.n);
        try{
          const detail=await store('basket',{basket_id:key,lightweight:1});
          state.variants.set(key,{data:detail});
        }catch(error){state.variants.set(key,{error:String(error.message||error)});}
        finished++;status('Consultando preços e estoque reais: '+finished+' de '+jobs.length+' combinações.');
        renderPrices();updatePreview();renderMeta();
      }
    }));
    state.lastUpdate=new Date();state.loading=false;
    const count=[...state.variants.values()].filter(v=>validVariant(v.data)).length;
    status(count+'/15 combinações calculadas · atualizado às '+state.lastUpdate.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+(count<15?' · algumas combinações indisponíveis':''),count===0);
    $('refreshBtn').disabled=false;$('extraSearch').disabled=false;updateAll();
  }catch(error){
    state.loading=false;renderMeta();status('Não foi possível iniciar o laboratório: '+String(error.message||error)+'. Abra o Vitrine Admin, autentique-se e tente novamente.',true);
    $('refreshBtn').disabled=false;updatePreview();
  }
}
function choose(key){
  const variant=state.variants.get(key);if(!validVariant(variant?.data))return;
  const model=state.models.find(m=>key.startsWith(m.id+'@'));if(!model)return;
  const number=Number(key.split('@')[1]);
  state.selection={key,modelId:model.id,label:SIZE_LABELS[model.size_key]||model.name,number};
  state.verifiedChoiceId=null;state.originalCompositionChanged=false;
  state.items=variant.data.items.map(x=>({...x,quantity:Number(x.quantity||0)}));
  state.officialPrice=Number(variant.data.basket.display_price_cents);
  state.quoteReady=true;state.quoteSequence++;
  state.alternatives.clear();state.openPosition=null;state.extras.clear();
  $('messageMode').value='basket';updateAll();
}
function scheduleQuote(){
  state.quoteReady=false;state.quoteSequence++;const seq=state.quoteSequence;clearTimeout(state.quoteTimer);renderDetail();updatePreview();refreshCanaryControls();
  state.quoteTimer=setTimeout(async()=>{
    const selected=state.selection;if(!selected)return;
    try{
      const payload={basket_id:selected.modelId,composition_number:selected.number,lightweight:true,allow_unavailable_preview:true,items:state.items.map(i=>({position_id:i.position_id,product_id:i.product_id,quantity:i.quantity}))};
      const result=await store('basket_mold_quote',payload,'POST');
      if(state.quoteSequence!==seq)return;
      state.officialPrice=Number(result.total_cents);
      state.quoteReady=Number.isFinite(state.officialPrice);
      if(!state.quoteReady)throw new Error('invalid_price');
      status('Prévia recalculada com as regras comerciais oficiais da cesta.');
    }catch(error){if(state.quoteSequence!==seq)return;state.quoteReady=false;status('A composição alterada não pôde ser validada pelo motor de cestas: '+String(error.message||error),true);}
    renderDetail();updatePreview();refreshCanaryControls();
  },280);
}
function adjustItem(index,increment){
  const item=state.items[index];if(!item)return;
  const next=Math.max(0,Math.min(1000,item.quantity+increment));if(next===item.quantity)return;
  item.quantity=next;state.originalCompositionChanged=true;
  scheduleQuote();
}
async function swapOptions(index){
  const item=state.items[index];if(!item||!state.selection)return;
  if(state.openPosition===item.position_id){state.openPosition=null;renderDetail();return;}
  state.openPosition=item.position_id;state.alternatives.set(item.position_id,[]);renderDetail();
  try{
    const data=await store('basket_mold_options',{basket_id:state.selection.modelId,composition_number:state.selection.number,position_id:item.position_id,selected_product_id:item.product_id,quantity:item.quantity||item.base_quantity||1,offset:0});
    if(state.openPosition!==item.position_id)return;
    state.alternatives.set(item.position_id,data.alternatives||[]);
  }catch(error){status('Erro ao consultar marcas disponíveis: '+String(error.message||error),true);}
  renderDetail();
}
function selectAlternative(positionId,productId){
  const row=state.items.find(i=>i.position_id===positionId),option=(state.alternatives.get(positionId)||[]).find(o=>o.product_id===productId);
  if(!row||!option)return;
  Object.assign(row,{product_id:option.product_id,name:option.name,image_url:option.image_url,stock_quantity:option.stock_quantity,price_cents:option.price_cents});
  state.originalCompositionChanged=true;
  state.openPosition=null;scheduleQuote();
}
async function searchExtras(text){
  if(!state.selection)return;
  const q=String(text||'').trim();if(q.length<2){state.searchResults=[];renderExtras();return;}
  try{
    const result=await store('products',{q,limit:12,offset:0});
    if($('extraSearch').value.trim()!==q)return;
    state.searchResults=(result.products||[]).filter(x=>Number(x.stock_quantity||0)>0).slice(0,8);
    renderExtras();
  }catch(error){sendStatus('Falha ao buscar produtos extras: '+String(error.message||error),'error');}
}
function adjustExtra(id,delta){
  const product=state.searchResults.find(x=>String(x.id)===id)||state.extras.get(id)?.product;
  if(!product)return;
  const quantity=(state.extras.get(id)?.quantity||0)+delta;
  if(quantity<=0)state.extras.delete(id);
  else if(quantity<=Number(product.stock_quantity||0))state.extras.set(id,{product,quantity});
  else{sendStatus('Quantidade maior que o estoque disponível.','error');return;}
  state.originalCompositionChanged=true;
  renderExtras();renderDetail();updatePreview();refreshCanaryControls();
}
async function copyMessage(){
  const text=currentMessage();if(!text)return;
  try{await navigator.clipboard.writeText(text);sendStatus('Mensagem copiada. Nenhum envio foi feito.','success');}
  catch{sendStatus('O navegador não autorizou copiar a mensagem.','error');}
}
async function sendTest(){
  if(!LIVE_TEST_ENABLED){sendStatus('Envio desabilitado: isole primeiro a automação dos dois números de teste.','error');return;}
  if(state.busy||state.loading||!state.account1018)return;
  const msg=currentMessage();
  if(!msg||msg.length>3900){sendStatus('Mensagem vazia ou longa demais.','error');return;}
  if(!confirm('Enviar esta mensagem de TESTE pelo WhatsApp 1018 somente para o número interno final 0975? Nenhum cliente receberá este teste.'))return;
  state.busy=true;updatePreview();sendStatus('Validando conta Meta, conversa interna e janela de atendimento…');
  try{
    const detail=await attendanceJsonApi('conversation',{conversation_id:TEST_CONVERSATION_ID,limit:1});
    const conv=detail.conversation||{},account=detail.account||{};
    if(String(account.phone_e164||'')!==ORIGIN_CHANNEL||String(account.id||'')!==String(state.account1018.id)||String(conv.whatsapp_account_id||'')!==String(state.account1018.id)||String(conv.phone_e164||'')!==TEST_RECIPIENT)throw new Error('O destino ou canal não corresponde ao teste interno autorizado.');
    if(detail.service_window?.open!==true)throw new Error('Janela de 24h fechada. Não enviaremos mensagem livre.');
    if(detail.send_capability?.enabled!==true||detail.send_capability?.provider!=='meta')throw new Error('Transporte Meta humano indisponível para este teste.');
    const key='lab1018:'+Date.now()+':'+(crypto.randomUUID?.()||'manual');
    const result=await attendanceJsonApi('send_text',{conversation_id:TEST_CONVERSATION_ID,text:msg,idempotency_key:key},'POST');
    if(result?.ok!==true)throw new Error(String(result?.error||'send_unconfirmed'));
    sendStatus('Meta aceitou o envio pelo canal 1018 para o teste interno 0975. Confira a conversa para verificar a entrega.','success');
  }catch(error){sendStatus('Teste NÃO confirmado: '+String(error.message||error)+'. Não haverá reenvio automático.','error');}
  finally{state.busy=false;updatePreview();}
}

$('exportCatalogBtn').addEventListener('click',downloadMetaCatalog);
$('copyMetaPayloadBtn').addEventListener('click',()=>void copyMetaPayload());
$('metaPayloadKind').addEventListener('change',()=>{renderMeta();refreshCanaryControls();});
$('metaInteractivePreview').addEventListener('click',event=>{
  const btn=event.target.closest('button');if(!btn)return;
  if(btn.id==='metaPreviewBack'){state.metaSelectedSize=null;renderMeta();refreshCanaryControls();return;}
  if(btn.hasAttribute('data-meta-size')){state.metaSelectedSize=btn.dataset.metaSize;renderMeta();refreshCanaryControls();return;}
  if(btn.hasAttribute('data-meta-combo')){
    const size=btn.dataset.metaCombo,n=Number(btn.dataset.metaComboN);
    const model=state.models.find(m=>m.size_key===size);
    if(model&&Number.isInteger(n))choose(model.id+'@'+n);
  }
});

$('refreshBtn').addEventListener('click',()=>load());
$('messageMode').addEventListener('change',updatePreview);
$('copyBtn').addEventListener('click',()=>void copyMessage());
$('copyCompositionBtn').addEventListener('click',()=>void copyBasketComposition());
$('sendBtn').addEventListener('click',()=>void sendTest());
$('priceGrid').addEventListener('click',event=>{const button=event.target.closest('[data-choice]');if(button&&!button.disabled)choose(button.dataset.choice);});
$('detail').addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.hasAttribute('data-decrease'))return adjustItem(Number(button.dataset.decrease),-1);
  if(button.hasAttribute('data-increase'))return adjustItem(Number(button.dataset.increase),1);
  if(button.hasAttribute('data-swap'))return void swapOptions(Number(button.dataset.swap));
  if(button.hasAttribute('data-close-options')){state.openPosition=null;renderDetail();return;}
  if(button.hasAttribute('data-alternative'))selectAlternative(button.dataset.alternative,button.dataset.product);
});
$('extraSearch').addEventListener('input',event=>{clearTimeout(state.searchTimer);state.searchTimer=setTimeout(()=>void searchExtras(event.target.value),320);});
$('extraResults').addEventListener('click',event=>{const b=event.target.closest('[data-add-extra]');if(b)adjustExtra(b.dataset.addExtra,1);});
$('extraSelected').addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;if(b.hasAttribute('data-extra-minus'))adjustExtra(b.dataset.extraMinus,-1);if(b.hasAttribute('data-extra-plus'))adjustExtra(b.dataset.extraPlus,1);});
$('readReplyBtn').addEventListener('click',()=>void readCustomerReply());
$('canaryRefreshBtn').addEventListener('click',()=>void fetchCanary());
$('canarySendBtn').addEventListener('click',()=>void sendCanary());
$('sendCompositionBtn').addEventListener('click',()=>void sendBasketComposition());
void load().then(()=>fetchCanary());
