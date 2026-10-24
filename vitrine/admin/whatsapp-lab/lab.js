import {attendanceJsonApi} from '../atendimento/attendance-auth.js?v=auth-refresh-v2';

const STORE='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/storefront-v2';
const SIZE_ORDER=['economica','mini','pequena','media','grande'];
const SIZE_LABELS={economica:'Econômica',mini:'Mini',pequena:'Pequena',media:'Média',grande:'Grande'};
const LIVE_TEST_ENABLED=false; // OFF: the two company numbers currently have ANA enabled.
const TEST_RECIPIENT='+5565998150975';
const ORIGIN_CHANNEL='+5565984491018';
const $=id=>document.getElementById(id);
const state={account1018:null,models:[],variants:new Map(),loading:true,selection:null,items:[],officialPrice:null,quoteReady:false,quoteSequence:0,quoteTimer:null,alternatives:new Map(),openPosition:null,extras:new Map(),searchResults:[],searchTimer:null,busy:false,lastUpdate:null};

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
}
function updateAll(){renderPrices();renderDetail();renderExtras();updatePreview();}
async function load(){
  if(state.busy)return;
  state.loading=true;state.variants.clear();state.selection=null;state.items=[];state.officialPrice=null;state.quoteReady=false;state.extras.clear();state.searchResults=[];
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
    renderPrices();
    let cursor=0,finished=0;
    await Promise.all(Array.from({length:3},async()=>{
      while(cursor<jobs.length){
        const job=jobs[cursor++],key=choiceKey(job.model,job.n);
        try{
          const detail=await store('basket',{basket_id:key,lightweight:1});
          state.variants.set(key,{data:detail});
        }catch(error){state.variants.set(key,{error:String(error.message||error)});}
        finished++;status('Consultando preços e estoque reais: '+finished+' de '+jobs.length+' combinações.');
        renderPrices();updatePreview();
      }
    }));
    state.lastUpdate=new Date();state.loading=false;
    const count=[...state.variants.values()].filter(v=>validVariant(v.data)).length;
    status(count+'/15 combinações calculadas · atualizado às '+state.lastUpdate.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+(count<15?' · algumas combinações indisponíveis':''),count===0);
    $('refreshBtn').disabled=false;$('extraSearch').disabled=false;updateAll();
  }catch(error){
    state.loading=false;status('Não foi possível iniciar o laboratório: '+String(error.message||error)+'. Abra o Vitrine Admin, autentique-se e tente novamente.',true);
    $('refreshBtn').disabled=false;updatePreview();
  }
}
function choose(key){
  const variant=state.variants.get(key);if(!validVariant(variant?.data))return;
  const model=state.models.find(m=>key.startsWith(m.id+'@'));if(!model)return;
  const number=Number(key.split('@')[1]);
  state.selection={key,modelId:model.id,label:SIZE_LABELS[model.size_key]||model.name,number};
  state.items=variant.data.items.map(x=>({...x,quantity:Number(x.quantity||0)}));
  state.officialPrice=Number(variant.data.basket.display_price_cents);
  state.quoteReady=true;state.quoteSequence++;
  state.alternatives.clear();state.openPosition=null;state.extras.clear();
  $('messageMode').value='basket';updateAll();
}
function scheduleQuote(){
  state.quoteReady=false;state.quoteSequence++;const seq=state.quoteSequence;clearTimeout(state.quoteTimer);renderDetail();updatePreview();
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
    renderDetail();updatePreview();
  },280);
}
function adjustItem(index,increment){
  const item=state.items[index];if(!item)return;
  item.quantity=Math.max(0,Math.min(1000,item.quantity+increment));
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
  renderExtras();renderDetail();updatePreview();
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
$('refreshBtn').addEventListener('click',()=>load());
$('messageMode').addEventListener('change',updatePreview);
$('copyBtn').addEventListener('click',()=>void copyMessage());
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
void load();
