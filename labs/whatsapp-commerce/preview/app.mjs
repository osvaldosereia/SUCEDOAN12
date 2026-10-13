/**
 * Dona Antônia WhatsApp Lab — VISUAL SIMULATOR ONLY.
 * Aims to mirror WhatsApp interactive list + native Flow components.
 * It does not send messages, read Supabase, or access the Meta Cloud API.
 * All catalog items, mock images, prices and customers are illustrative.
 */
import {makeFakeCatalog,makeFakeStock,fakeExtraCatalog} from '../fixtures/fake-catalog.mjs';
import {createLabSession,chooseMode,chooseProduct,advance,back,addExtras,
  setCustomer,setDelivery,setPayment,publicView,confirmSimulated} from '../src/session.mjs';

const catalog=makeFakeCatalog(),inventory=makeFakeStock(catalog);
const ctx={catalog,inventory,extrasCatalog:fakeExtraCatalog};
const $=selector=>document.querySelector(selector);
const money=n=>(n/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sizes=catalog.models.filter(x=>x.composition===1);
const orders=new Map();
let session=null,currentBasket=null,lastOrder=null,pendingMode=null,selectedPayment='pix';
const button=(text,fn,kind='native-row')=>{
  const el=document.createElement('button');el.type='button';el.className=kind;
  el.textContent=text;el.onclick=fn;return el;
};
function noticeError(e){
  let el=$('#flowError');
  if(!el){el=document.createElement('div');el.id='flowError';el.className='error';$('#flowBody').prepend(el)}
  el.textContent='Não foi possível atualizar: '+String(e?.message||'tente novamente');
}
function act(fn){try{fn()}catch(e){noticeError(e)}}
function total(value,label='Total da cesta'){
  return '<div class="total"><span>'+esc(label)+'</span><strong>'+money(value)+'</strong></div>';
}
function row(html,onClick,{selected=false,disabled=false,checkbox=false}={}){
  const el=document.createElement('button');el.type='button';el.className='native-row'+(selected?' selected':'');
  el.disabled=disabled;el.innerHTML=html+'<span class="'+(checkbox?'check':'radio')+'"></span>';
  el.onclick=()=>act(onClick);return el;
}
function fakePack(option,index=0){
  // Illustrative package images ONLY; NOT actual Dona Antônia product photos.
  const hue=[114,45,214,160][index%4];
  const title=['A','B','C','D'][index%4];
  const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 90">'+
    '<rect x="12" y="4" width="56" height="82" rx="6" fill="hsl('+hue+',37%,76%)" stroke="#9aaba0"/>'+
    '<rect x="15" y="9" width="50" height="16" rx="2" fill="hsl('+hue+',53%,33%)"/>'+
    '<text x="40" y="21" text-anchor="middle" font-family="Arial" font-size="9" fill="white">MARCA '+title+'</text>'+
    '<ellipse cx="40" cy="53" rx="19" ry="13" fill="#fff" stroke="#b9c0b6"/>'+
    '<text x="40" y="57" text-anchor="middle" font-family="Arial" font-size="12" fill="hsl('+hue+',53%,33%)">LAB</text>'+
    '<text x="40" y="78" text-anchor="middle" font-family="Arial" font-size="9" fill="#20342a">TESTE</text></svg>';
  return 'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(svg);
}
function photo(o,i){
 return '<span class="product-thumb"><img loading="lazy" alt="Embalagem ilustrativa, não é foto real" src="'+
  fakePack(o,i)+'"></span>';
}
function appendBubble(html,fromMe=false){
 const div=document.createElement('div');div.className='msg'+(fromMe?' mine':'');
 div.innerHTML=html+'<div class="stamp">09:41 '+(fromMe?'✓✓':'')+'</div>';
 $('#chat').append(div);$('#chat').scrollTop=$('#chat').scrollHeight;return div;
}
function openList(){$('#shade').classList.remove('hidden');$('#basketSheet').classList.remove('hidden')}
function closeList(){$('#shade').classList.add('hidden');$('#basketSheet').classList.add('hidden')}
function buildList(){
 $('#basketRows').innerHTML='';
 for(const b of sizes){
  const item=document.createElement('button');item.type='button';item.className='sheet-row';
  item.innerHTML='<span class="text"><strong>'+esc(b.name)+'</strong><small>Valor ilustrativo: '+
    money(b.positions.reduce((s,p)=>s+(p.options.find(o=>o.id===p.default_id)?.price_cents||0)*p.quantity,0)+
      b.pricing.fixed_hidden_cents)+' · '+
    b.positions.length+' posições</small></span><span class="icon">›</span>';
  item.onclick=()=>selectBasket(b);$('#basketRows').append(item);
 }
}
function selectBasket(b){
 closeList();currentBasket=b;session=createLabSession({...ctx,modelId:b.id,composition:b.composition});
 lastOrder=null;pendingMode=null;
 appendBubble(esc(b.name),true);
 const view=publicView(ctx,session);
 const msg=appendBubble('<div class="heading">'+esc(b.name)+'</div>'+
  '<div class="summary">'+b.positions.length+' posições na composição.<br>Valor inicial ilustrativo: <b>'+
  money(view.total_cents)+'</b></div>');
 const btn=button('▣  Montar cesta',()=>openFlow(),'chat-button');
 msg.append(btn);
}
function openFlow(){if(!session)return;$('#flow').classList.remove('hidden');render()}
function closeFlow(){$('#flow').classList.add('hidden')}
function setScreen(title,html,footerText,fn){
 $('#flowTitle').textContent=title;$('#flowBody').innerHTML=html;
 const footer=$('#flowNext');
 footer.textContent=footerText;footer.onclick=()=>act(fn);
 footer.disabled=!fn;
}
function choiceList(mount,choices,selectedId,callback,{withImages=false,allowCheckbox=false}={}){
 const holder=document.createElement('div');
 choices.forEach((o,i)=>{
   const title=esc(o.title||o.name),desc=o.description?esc(o.description):'';
   const content=(withImages?photo(o,i):'')+'<span class="row-copy"><strong>'+title+
       '</strong>'+(desc?'<small>'+desc+'</small>':'')+'</span>';
   holder.append(row(content,()=>callback(o),{selected:allowCheckbox?selectedId.includes(o.id):o.id===selectedId,
     checkbox:allowCheckbox}));
 });
 $(mount).append(holder);
}
function checkoutBack(){
 let turns=0;
 while(session.step!=='CUSTOMER'&&turns++<5)session=back(ctx,session);
 render();
}
function render(){
 if(!session)return;
 const view=publicView(ctx,session);
 const step=view.step;
 if(step==='MODE'){
  const html='<h2>'+esc(view.basket_name)+'</h2><p>Como você prefere receber esta cesta?</p>'+
   '<div class="field-label">Escolha uma opção</div><div id="modeOptions"></div>'+
   total(view.total_cents)+'<div class="caption">Valor ilustrativo. Produtos fictícios neste teste.</div>';
  setScreen('Montar cesta',html,'Continuar',()=>{
   if(!pendingMode){noticeError(new Error('Selecione uma opção.'));return}
   session=chooseMode(ctx,session,pendingMode);render();
  });
  choiceList('#modeOptions',[
   {id:'ready',title:'Quero como está',description:'Manter os produtos da composição'},
   {id:'customize',title:'Personalizar cesta',description:'Escolher marcas ou retirar produtos'}
  ],pendingMode,o=>{pendingMode=o.id;render()});
 }else if(step==='PRODUCT'){
  const p=view.current_position;
  const options=p.options.map(o=>({...o,name:o.title,description:money(o.price_cents)}));
  if(p.removable)options.push({id:'__REMOVE__',name:'Retirar este produto',description:'Não incluir na cesta',noPhoto:true});
  const html='<button class="view-back" type="button" id="flowBack">‹ Voltar</button>'+
   '<div class="step-label">Produto '+view.step_number+' de '+view.step_total+'</div>'+
   '<h2>'+esc(p.label)+'</h2><p>Escolha uma marca. O total será atualizado.</p>'+
   '<div class="field-label">Selecione uma opção</div><div id="productOptions"></div>'+
   total(view.total_cents)+'<div class="caption">Embalagens ilustrativas. Fotos reais serão ligadas ao catálogo na homologação.</div>'+
   (view.quote_status==='unavailable'?'<div class="error">Há produtos sem estoque na simulação.</div>':'');
  setScreen('Personalizar cesta',html,view.step_number===view.step_total?'Concluir cesta':'Próximo produto',()=>{
    if(view.quote_status==='unavailable'){noticeError(new Error('Confira as marcas em estoque.'));return}
    session=advance(ctx,session);render();
  });
  $('#flowBack').onclick=()=>act(()=>{session=back(ctx,session);render()});
  const box=document.createElement('div');
  options.forEach((o,i)=>{
   const remove=o.id==='__REMOVE__';
   const selected=remove?p.selected_id===null:p.selected_id===o.id;
   const content=(remove?'':photo(o,i))+'<span class="row-copy"><strong>'+esc(o.name)+'</strong>'+
    '<small>'+esc(o.description)+'</small></span>';
   box.append(row(content,()=>{
     session=chooseProduct(ctx,session,{positionId:p.id,productId:remove?null:o.id,
       quantity:remove?0:undefined});render();
   },{selected}));
  });
  $('#productOptions').append(box);
 }else if(step==='UPSELL'){
  const selected=session.draft.extras.map(x=>x.id);
  const html='<button class="view-back" id="flowBack" type="button">‹ Voltar</button>'+
   '<h2>Sua cesta está pronta!</h2><p>Deseja acrescentar outros produtos? Essa etapa é opcional.</p>'+
   '<div class="field-label">Adicionais</div><div id="extraOptions"></div>'+
   total(view.total_cents,'Total com adicionais')+
   '<div class="caption">Preço ilustrativo; apenas 1 unidade de cada adicional neste teste.</div>';
  setScreen('Mais produtos',html,'Continuar',()=>{session=advance(ctx,session);render()});
  $('#flowBack').onclick=()=>act(()=>{session=back(ctx,session);render()});
  const options=Object.values(fakeExtraCatalog).map(x=>({id:x.id,title:x.name,description:money(x.price_cents)}));
  const holder=$('#extraOptions');
  options.forEach((o,i)=>{
    holder.append(row(photo(o,i)+'<span class="row-copy"><strong>'+esc(o.title)+'</strong><small>'+
      esc(o.description)+'</small></span>',()=>{
      const updated=selected.includes(o.id)?selected.filter(x=>x!==o.id):[...selected,o.id];
      session=addExtras(ctx,session,updated.map(id=>({id,quantity:1})));render();
    },{selected:selected.includes(o.id),checkbox:true}));
  });
 }else if(['CUSTOMER','DELIVERY','PAYMENT'].includes(step)){
  const html='<button class="view-back" id="flowBack" type="button">‹ Voltar</button>'+
   '<h2>Entrega e pagamento</h2><p>Confira os dados para finalizar a simulação.</p>'+
   '<label class="field-label" for="customerName">Nome do cliente</label>'+
   '<input class="native-field" id="customerName" maxlength="80" value="Cliente de teste" autocomplete="off">'+
   '<label class="field-label" for="address">Endereço de entrega</label>'+
   '<input class="native-field" id="address" maxlength="180" value="Rua de teste, 10, Cuiabá/MT" autocomplete="off">'+
   '<div class="field-label">Pagamento na entrega</div><div id="paymentOptions"></div>'+
   total(view.total_cents)+
   '<p class="caption">O localizador seria solicitado por uma mensagem nativa do WhatsApp, fora do Flow.</p>';
  setScreen('Finalizar pedido',html,'Revisar pedido',()=>{
   session=setCustomer(ctx,session,{kind:'new',label:$('#customerName').value});
   session=advance(ctx,session);
   session=setDelivery(ctx,session,{mode:'new',label:$('#address').value,location_confirmed:false});
   session=advance(ctx,session);
   session=setPayment(ctx,session,selectedPayment);
   session=advance(ctx,session);render();
  });
  $('#flowBack').onclick=()=>act(()=>{session=back(ctx,session);render()});
  choiceList('#paymentOptions',[
   {id:'pix',title:'PIX'},{id:'cash',title:'Dinheiro'},
   {id:'credit',title:'Cartão de crédito'},{id:'food',title:'Alimentação/refeição'}
  ],selectedPayment,o=>{
    const name=$('#customerName').value,address=$('#address').value;
    selectedPayment=o.id;render();$('#customerName').value=name;$('#address').value=address;
  });
 }else if(step==='REVIEW'){
  const all=view.lines||[];
  const shown=all.filter(x=>x.quantity>0).slice(0,6);
  const list=shown.map(x=>'<div class="native-row" style="min-height:43px"><span class="row-copy"><strong>'+
   esc(x.quantity+'× '+x.name)+'</strong></span></div>').join('');
  const html='<button type="button" class="view-back" id="flowBack">‹ Voltar</button>'+
   '<h2>Confira sua cesta</h2><p>Confirme os produtos e a entrega antes de finalizar.</p>'+
   '<div class="field-label">'+esc(view.basket_name)+'</div>'+list+
   '<div class="caption">'+Math.max(0,all.length-shown.length)+' outros itens da composição</div>'+
   total(view.total_cents,'Total simulado')+
   '<div class="field-label">Entrega</div><p>'+esc(view.delivery?.label||'')+
   '<br>Pagamento: '+esc(selectedPayment==='pix'?'PIX':selectedPayment==='cash'?'Dinheiro':selectedPayment==='credit'?'Crédito':'Alimentação/refeição')+'</p>';
  setScreen('Revisar cesta',html,'Finalizar teste',()=>{
   const result=confirmSimulated(ctx,session,{idempotencyKey:'preview-simulation-'+session.version,orders});
   lastOrder=result.order;session=result.session;render();
  });
  $('#flowBack').onclick=()=>act(checkoutBack);
 }else{
  const html='<div class="result"><div class="tick">✓</div><h2>Simulação concluída</h2>'+
    '<p>Esta compra foi simulada. Nenhuma mensagem foi enviada e nenhum pedido real foi criado.</p>'+
    '<div class="field-label">Referência de teste</div><strong>'+esc(lastOrder?.reference||'SIM-TESTE')+'</strong>'+
    total(view.total_cents,'Total fictício')+'</div>';
  setScreen('Teste concluído',html,'Voltar à conversa',()=>{
    closeFlow();
    appendBubble('✅ <b>Simulação concluída</b><br>Nenhum pedido real foi gerado.');
  });
 }
 $('#flowBody').scrollTop=0;
}
$('#openList').onclick=openList;
$('#closeList').onclick=closeList;
$('#shade').onclick=closeList;
$('#closeFlow').onclick=closeFlow;
buildList();
