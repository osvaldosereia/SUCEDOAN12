import {makeFakeCatalog,makeFakeStock,fakeExtraCatalog} from '../fixtures/fake-catalog.mjs';
import {createLabSession,chooseMode,chooseProduct,advance,back,addExtras,setCustomer,setDelivery,setPayment,publicView,confirmSimulated} from '../src/session.mjs';
const catalog=makeFakeCatalog(),inventory=makeFakeStock(catalog),ctx={catalog,inventory,extrasCatalog:fakeExtraCatalog};
const $=s=>document.querySelector(s),format=n=>(n/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
let session=null,lastOrder=null;const completedOrders=new Map();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const choices=[...catalog.models].filter(m=>m.composition===1);
function chatStart(){
 $('#basketChoices').innerHTML=choices.map(m=>'<button type="button" class="choice" data-basket="'+esc(m.id)+'"><span class="mark"></span><span class="label">'+esc(m.name)+'</span><span class="price">Ver cesta</span></button>').join('');
 $('#basketChoices').querySelectorAll('button').forEach(b=>b.onclick=()=>{session=createLabSession({...ctx,modelId:b.dataset.basket});lastOrder=null;openFlow()});
}
function openFlow(){$('#flow').classList.remove('hidden');render()}
function control(text,fn,cls='btn') {const b=document.createElement('button');b.className=cls;b.type='button';b.textContent=text;b.onclick=fn;return b}
function decorate(title,body,backFn=null,nextFn=null,nextText='Continuar'){
 $('#flowTitle').textContent=title;
 $('#screen').innerHTML=body;
 const footer=$('#actions');footer.innerHTML='';
 if(backFn)footer.append(control('Voltar',backFn,'btn secondary'));
 if(nextFn)footer.append(control(nextText,nextFn));
}
function render(){
 if(!session)return;
 const v=publicView(ctx,session);
 const pct=v.step==='PRODUCT'?Math.round((v.step_number-1)/Math.max(1,v.step_total)*70)+10:
  ({MODE:5,UPSELL:81,CUSTOMER:85,DELIVERY:90,PAYMENT:94,REVIEW:98,DONE:100}[v.step]||5);
 $('#progressBar').style.width=pct+'%';
 const tot='<div class="total"><span>Total da cesta</span><b>'+format(v.total_cents)+'</b></div>';
 const goBack=()=>{session=back(ctx,session);render()};
 if(v.step==='MODE'){
  decorate(v.basket_name,
   '<h2>'+esc(v.basket_name)+'</h2><p>Escolha como deseja montar sua cesta. Preços deste laboratório são fictícios.</p>'+
   tot+
   '<button class="choice" data-mode="ready"><span class="mark"></span><span class="label">Quero como está<small>Mais rápido — sem alterações</small></span></button>'+
   '<button class="choice" data-mode="customize"><span class="mark"></span><span class="label">Quero personalizar<small>Escolher marcas, mudar quantidades e retirar itens</small></span></button>',
   null,null);
  $('#screen').querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{session=chooseMode(ctx,session,b.dataset.mode);render()});
 }else if(v.step==='PRODUCT'){
  const p=v.current_position;
  const opts=p.options.map((o,i)=>'<button type="button" class="choice '+(o.id===p.selected_id?'selected':'')+'" data-option="'+esc(o.id)+'"><span class="mark"></span><span class="product-symbol" aria-hidden="true">📦</span><span class="label">'+esc(o.title)+'</span><span class="price">'+format(o.price_cents)+'</span></button>').join('');
  const remove=p.removable?'<button class="choice '+(p.selected_id===null?'selected':'')+'" data-option="remove"><span class="mark"></span><span class="label">Retirar produto</span></button>':'';
  decorate(v.basket_name,
   '<div class="step-count">Produto '+v.step_number+' de '+v.step_total+'</div><h2>'+esc(p.label)+'</h2>'+
   '<p>Toque na marca desejada. O valor será recalculado.</p>'+opts+remove+
   '<div class="qty"><span style="flex:1">Quantidade</span><button data-qty="-1" aria-label="Diminuir">−</button><b>'+p.quantity+'</b><button data-qty="1" aria-label="Aumentar">+</button></div>'+tot+
   (v.quote_status==='unavailable'?'<div class="warning">Falta de estoque nesta simulação.</div>':''),
   goBack,()=>{session=advance(ctx,session);render()},'Próximo produto');
  $('#screen').querySelectorAll('[data-option]').forEach(b=>b.onclick=()=>{
   const id=b.dataset.option==='remove'?null:b.dataset.option;
   session=chooseProduct(ctx,session,{positionId:p.id,productId:id,quantity:id===null?0:undefined});render()
  });
  $('#screen').querySelectorAll('[data-qty]').forEach(b=>b.onclick=()=>{
   const nextQty=Math.max(0,Math.min(100,p.quantity+Number(b.dataset.qty)));
   const prod=p.selected_id;
   if(nextQty>0&&!prod)return;
   session=chooseProduct(ctx,session,{positionId:p.id,productId:nextQty===0?null:prod,quantity:nextQty});render()
  });
 }else if(v.step==='UPSELL'){
  const added=session.draft.extras.find(x=>x.id==='lab-extra-oleo')?.quantity||0;
  const add=(n)=>{const qty=Math.max(0,Math.min(10,added+n));session=addExtras(ctx,session,qty?[{id:'lab-extra-oleo',quantity:qty}]:[]);render()};
  decorate('Acrescentar produtos','<h2>Cesta pronta! ✓</h2><p>Deseja acrescentar mais produtos? É opcional.</p>'+tot+
   '<div class="choice"><span class="product-symbol">🫙</span><span class="label">Óleo 900 ml<small>Item fictício</small></span><span class="price">R$ 7,99</span></div>'+
   '<div class="qty"><span style="flex:1">Quantidade adicional</span><button id="extraMinus">−</button><b>'+added+'</b><button id="extraPlus">+</button></div>'+
   '<p style="margin-top:15px">Você poderá conferir os produtos no resumo do pedido.</p>',
   goBack,()=>{session=advance(ctx,session);render()},'Ir para cadastro');
  $('#extraMinus').onclick=()=>add(-1);$('#extraPlus').onclick=()=>add(1);
 }else if(v.step==='CUSTOMER'){
  decorate('Cadastro','<h2>Quem vai receber?</h2><p>Somente dados fictícios nesta demonstração.</p>'+
   '<label>Tipo de cadastro<select class="select" id="custKind"><option value="existing">Já tenho cadastro</option><option value="new">Primeira compra</option></select></label>'+
   '<label>Nome<input class="select" id="custName" value="Cliente de teste"></label>',goBack,()=>{
    session=setCustomer(ctx,session,{kind:$('#custKind').value,label:$('#custName').value});session=advance(ctx,session);render()
   });
 }else if(v.step==='DELIVERY'){
  decorate('Entrega','<h2>Conferir endereço</h2><p>Na versão real, usaremos o cadastro e o localizador do WhatsApp.</p>'+
   '<label>Endereço fictício<input class="select" id="addr" value="Rua de teste, 10, Cuiabá/MT"></label>'+
   '<label><input type="checkbox" id="loc"> Localização conferida</label>',goBack,()=>{
    session=setDelivery(ctx,session,{mode:'saved',label:$('#addr').value,location_confirmed:$('#loc').checked});session=advance(ctx,session);render()
   });
 }else if(v.step==='PAYMENT'){
  decorate('Pagamento','<h2>Pagamento na entrega</h2><p>Escolha uma opção.</p>'+
   [['pix','PIX'],['cash','Dinheiro'],['credit','Cartão de crédito'],['food','Alimentação/refeição']].map(([id,label],i)=>'<label class="choice"><input type="radio" name="pay" value="'+id+'" '+(i===0?'checked':'')+'><span class="label">'+label+'</span></label>').join(''),
   goBack,()=>{session=setPayment(ctx,session,$('input[name=pay]:checked').value);session=advance(ctx,session);render()});
 }else if(v.step==='REVIEW'){
  decorate('Confira o pedido','<h2>Está tudo certo?</h2><p>Este pedido é somente uma simulação.</p>'+
   '<b>'+esc(v.basket_name)+'</b><div class="line">Composição '+v.composition+' • '+v.lines.length+' posições</div>'+
   v.lines.filter(x=>x.quantity>0).slice(0,6).map(x=>'<div class="line">'+esc(x.quantity+'× '+x.name)+'</div>').join('')+
   '<div class="line">'+Math.max(0,v.lines.length-6)+' demais posições • '+v.extras.length+' adicionais</div>'+
   tot+'<div class="line">Cliente: '+esc(v.customer?.label)+'</div><div class="line">Endereço: '+esc(v.delivery?.label)+'</div>'+
   (!v.eligible?'<div class="warning">Cotação não confirmável — verifique estoque ou pedido mínimo.</div>':''),
   goBack,()=>{try{const done=confirmSimulated(ctx,session,{idempotencyKey:'preview-lab-'+session.version,orders:completedOrders});lastOrder=done.order;session=done.session;render()}catch(e){window.alert('Não foi possível confirmar: '+e.message)}},'Confirmar simulação');
 }else{
  decorate('Pedido simulado','<h2>✓ Compra simulada</h2><p>Nenhuma mensagem foi enviada e nenhum pedido real foi criado.</p>'+
   '<div class="total"><span>Referência fictícia</span><b>'+esc(lastOrder?.reference||'SIM')+'</b></div>'+
   tot,null,()=>{$('#flow').classList.add('hidden');chatStart()},'Nova simulação');
 }
}
$('#closeFlow').onclick=()=>$('#flow').classList.add('hidden');
chatStart();
