/* CANECAFÁCIL · EXPERIÊNCIA PÚBLICA V1
 * Protótipo funcional de UX: vitrine visual + busca forte + criador conversacional simulado.
 * Nenhuma chamada OpenAI/Make é feita nesta etapa. O objetivo é ajustar o site e o fluxo primeiro.
 */
(function(){
'use strict';

var BUILD='20260904-public-experience-v1';
if(window.__CF_PUBLIC_EXPERIENCE__===BUILD)return;
window.__CF_PUBLIC_EXPERIENCE__=BUILD;

var BASE='https://donaantonia.com.br/loja-integrada/';
var LISTING=['pagina-inicial','pagina-categoria','pagina-busca'];
var state={step:'idea',idea:'',name:'',email:'',photoName:'',started:false};

function q(s,r){return (r||document).querySelector(s)}
function qa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
function tx(v){return String(v==null?'':v).replace(/\s+/g,' ').trim()}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]})}
function hasBody(c){return !!(document.body&&document.body.classList.contains(c))}
function isListing(){return LISTING.some(hasBody)}
function isHome(){return hasBody('pagina-inicial')}
function firstName(){return tx(state.name).split(/\s+/)[0]||''}
function shortIdea(){var s=tx(state.idea);return s.length>88?s.slice(0,85)+'…':s}

function loadCss(){
  if(q('link[data-cf-public-experience]'))return;
  var l=document.createElement('link');
  l.rel='stylesheet';
  l.href=BASE+'canecafacil-public-experience-v1.css?v=20260904-1';
  l.setAttribute('data-cf-public-experience',BUILD);
  document.head.appendChild(l);
}

function nativeSearch(){
  var form=q('#cabecalho .busca form')||q('#cabecalho form[action*="buscar"]')||q('form[action*="buscar"]');
  if(!form)return null;
  var input=q('input[type="search"],input[name="q"],input[name="palavra_busca"],input[type="text"]',form);
  return input?{form:form,input:input}:null;
}
function submitSearch(value){
  value=tx(value);
  if(!value)return false;
  var native=nativeSearch();
  if(!native)return false;
  native.input.value=value;
  native.input.dispatchEvent(new Event('input',{bubbles:true}));
  native.input.dispatchEvent(new Event('change',{bubbles:true}));
  if(typeof native.form.requestSubmit==='function')native.form.requestSubmit();
  else native.form.submit();
  return true;
}

function categoryItems(){
  var src=qa('#cf-chip-nav a');
  if(!src.length)src=qa('#cabecalho .menu.superior .nivel-um>li>a');
  var out=[],seen={};
  src.forEach(function(a){
    var label=tx(a.textContent),href=a.href||'';
    if(!label||!href||seen[label.toLowerCase()]||out.length>=6)return;
    if(/^(in[ií]cio|home|todos|mais)$/i.test(label))return;
    seen[label.toLowerCase()]=1;
    out.push({label:label,href:href});
  });
  return out;
}

function speech(input,button,status){
  var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){button.hidden=true;return null}
  try{
    var r=new SR();
    r.lang='pt-BR';r.continuous=false;r.interimResults=false;r.maxAlternatives=1;
    r.onstart=function(){button.classList.add('is-listening');if(status){status.hidden=false;status.textContent='Ouvindo… fale naturalmente.'}};
    r.onend=function(){button.classList.remove('is-listening')};
    r.onerror=function(){button.classList.remove('is-listening');if(status){status.hidden=false;status.textContent='Não consegui ouvir. Você pode tentar de novo ou digitar.'}};
    r.onresult=function(e){var t=tx(e.results&&e.results[0]&&e.results[0][0]&&e.results[0][0].transcript);if(t){input.value=t;input.focus();if(status){status.hidden=false;status.textContent='Confira o que entendi e continue.'}}};
    return r;
  }catch(e){button.hidden=true;return null}
}

function homeAnchor(){
  var chips=q('#cf-chip-nav');
  if(chips&&chips.parentNode)return{node:chips,after:true};
  var banner=q('.secao-banners');
  if(banner&&banner.parentNode)return{node:banner,after:false};
  var body=q('#corpo');
  if(body&&body.parentNode)return{node:body,after:false};
  return null;
}

function hero(){
  if(!isHome()||q('#cfPublicHero'))return;
  var at=homeAnchor();if(!at)return;
  var s=document.createElement('section');
  s.id='cfPublicHero';s.className='cf-public-hero';
  s.innerHTML='\
    <div class="cf-public-find">\
      <span class="cf-public-kicker">VIU UMA CANECA E QUER ACHAR?</span>\
      <h1>Encontre a sua. <em>Ou crie uma só sua.</em></h1>\
      <p>Procure por frase, tema, esporte, profissão ou ocasião. Se quiser algo único, conte a ideia e a CanecaFácil cria com você.</p>\
      <form id="cfPublicSearch" class="cf-public-search" role="search">\
        <label class="cf-sr" for="cfPublicSearchInput">O que você procura?</label>\
        <input id="cfPublicSearchInput" type="search" maxlength="120" autocomplete="off" placeholder="Ex.: beach tennis, academia, presente para mãe…">\
        <button id="cfPublicSearchMic" type="button" class="cf-public-round" aria-label="Falar o que procura">🎙️</button>\
        <button type="submit" class="cf-public-search-go">Buscar</button>\
      </form>\
      <p id="cfPublicSearchStatus" class="cf-public-status" hidden></p>\
      <nav id="cfPublicCategories" class="cf-public-categories" aria-label="Categorias"></nav>\
    </div>\
    <button type="button" class="cf-public-create-card" data-cf-open-create>\
      <span class="cf-create-icon">✦</span>\
      <small>CRIAR COM IA</small>\
      <strong>Quero criar minha caneca</strong>\
      <span>Fale do seu jeito. Pode usar texto, voz e foto. A gente transforma sua história em arte.</span>\
      <b>Começar agora <i>→</i></b>\
    </button>';
  if(at.after)at.node.insertAdjacentElement('afterend',s);else at.node.parentNode.insertBefore(s,at.node);

  var form=q('#cfPublicSearch',s),input=q('#cfPublicSearchInput',s),mic=q('#cfPublicSearchMic',s),status=q('#cfPublicSearchStatus',s),cats=q('#cfPublicCategories',s);
  categoryItems().forEach(function(item){var a=document.createElement('a');a.href=item.href;a.textContent=item.label;cats.appendChild(a)});
  var rec=speech(input,mic,status);
  mic.onclick=function(){if(rec)try{rec.start()}catch(e){}};
  form.onsubmit=function(e){e.preventDefault();if(!submitSearch(input.value)){status.hidden=false;status.textContent=tx(input.value)?'A busca está carregando. Tente novamente em um instante.':'Digite ou fale o que você está procurando.'}};
}

function compactCreateBar(){
  if(isHome()||!isListing()||q('#cfCompactCreate'))return;
  var listing=q('#listagemProdutos');if(!listing||!listing.parentNode)return;
  var b=document.createElement('section');b.id='cfCompactCreate';b.className='cf-compact-create';
  b.innerHTML='<div><small>NÃO ACHOU O QUE QUERIA?</small><strong>Crie uma caneca só sua conversando com a gente.</strong></div><button type="button" data-cf-open-create>✦ Criar minha caneca</button>';
  listing.parentNode.insertBefore(b,listing);
}

function creatorShell(){
  if(q('#cfCreatorSheet'))return;
  var overlay=document.createElement('div');overlay.id='cfCreatorOverlay';overlay.className='cf-creator-overlay';overlay.hidden=true;
  var sheet=document.createElement('section');sheet.id='cfCreatorSheet';sheet.className='cf-creator-sheet';sheet.hidden=true;sheet.setAttribute('aria-label','Criador de caneca');
  sheet.innerHTML='\
    <header class="cf-creator-head">\
      <div><small>CANECAFÁCIL IA · SIMULAÇÃO</small><strong>Conte sua ideia. A gente cria.</strong></div>\
      <button type="button" id="cfCreatorClose" aria-label="Fechar">×</button>\
    </header>\
    <div class="cf-creator-body">\
      <div id="cfCreatorMessages" class="cf-creator-messages" role="log" aria-live="polite"></div>\
      <div id="cfCreatorPreview" class="cf-creator-preview" hidden>\
        <div class="cf-preview-mug" aria-hidden="true"><span></span></div>\
        <small>PRÉVIA SIMULADA</small><strong>Sua ideia está pronta para virar arte.</strong>\
        <p>Quando ligarmos a automação, este ponto receberá a arte real do GPT‑Image‑2 Low.</p>\
        <div><button type="button" class="cf-secondary" data-cf-revise>Quero alterar</button><button type="button" class="cf-primary" data-cf-simulate-buy>Gostei</button></div>\
      </div>\
    </div>\
    <footer class="cf-creator-compose" id="cfCreatorCompose">\
      <div id="cfCreatorQuick" class="cf-creator-quick"></div>\
      <div class="cf-creator-row">\
        <button type="button" id="cfCreatorPhoto" class="cf-creator-tool" aria-label="Enviar foto">📷</button>\
        <input id="cfCreatorFile" type="file" accept="image/png,image/jpeg,image/webp" hidden>\
        <textarea id="cfCreatorInput" rows="1" maxlength="700" placeholder="Digite sua resposta…"></textarea>\
        <button type="button" id="cfCreatorMic" class="cf-creator-tool" aria-label="Responder por voz">🎙️</button>\
        <button type="button" id="cfCreatorSend" class="cf-creator-send" aria-label="Enviar">↑</button>\
      </div>\
      <p id="cfCreatorStatus" class="cf-public-status" hidden></p>\
      <p id="cfCreatorPrivacy" class="cf-creator-privacy" hidden>Seu e-mail será usado para salvar a criação e avisar quando ela ficar pronta. Promoções exigirão autorização separada.</p>\
    </footer>';
  document.body.appendChild(overlay);document.body.appendChild(sheet);
  bindCreator();
}

function creatorMessages(){return q('#cfCreatorMessages')}
function bubble(role,message,html){
  var root=creatorMessages();if(!root)return;
  var row=document.createElement('div');row.className='cf-msg cf-msg-'+role;
  row.innerHTML='<div>'+ (html?message:esc(message)) +'</div>';
  root.appendChild(row);root.scrollTop=root.scrollHeight;
}
function assistant(message){bubble('ai',message,false)}
function user(message){bubble('user',message,false)}
function quicks(items){
  var root=q('#cfCreatorQuick');if(!root)return;root.innerHTML='';
  (items||[]).forEach(function(label){var b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=function(){q('#cfCreatorInput').value=label;sendCreator()};root.appendChild(b)});
}
function resetCreator(){
  state={step:'idea',idea:'',name:'',email:'',photoName:'',started:true};
  q('#cfCreatorPreview').hidden=true;q('#cfCreatorCompose').hidden=false;q('#cfCreatorPrivacy').hidden=true;
  q('#cfCreatorInput').type='';q('#cfCreatorInput').value='';q('#cfCreatorInput').placeholder='Digite sua resposta…';
  creatorMessages().innerHTML='';
  assistant('Oi! Me conta como você imagina sua caneca. Pode falar para quem ela é, a ocasião, o que a pessoa gosta, uma mania, profissão, hobby ou história divertida.');
  assistant('Não precisa saber exatamente o que quer. Fale naturalmente que eu vou organizando a ideia.');
  quicks(['É um presente','É para mim','Vi uma caneca no Instagram']);
}
function openCreator(){
  creatorShell();
  var overlay=q('#cfCreatorOverlay'),sheet=q('#cfCreatorSheet');overlay.hidden=false;sheet.hidden=false;document.body.classList.add('cf-creator-open');
  if(!state.started)resetCreator();
  setTimeout(function(){q('#cfCreatorInput').focus()},60);
}
function closeCreator(){var o=q('#cfCreatorOverlay'),s=q('#cfCreatorSheet');if(o)o.hidden=true;if(s)s.hidden=true;document.body.classList.remove('cf-creator-open')}

function validEmail(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tx(v))}
function updateComposerForStep(){
  var input=q('#cfCreatorInput'),privacy=q('#cfCreatorPrivacy');if(!input)return;
  input.value='';input.type='';input.inputMode='';privacy.hidden=true;
  if(state.step==='idea'){input.placeholder='Conte sua ideia…'}
  else if(state.step==='name'){input.placeholder='Seu nome';input.maxLength=100}
  else if(state.step==='email'){input.placeholder='voce@email.com';input.inputMode='email';input.maxLength=160;privacy.hidden=false}
  else if(state.step==='confirm'){input.placeholder='Se quiser, acrescente algum detalhe';input.maxLength=500}
}
function sendCreator(){
  var input=q('#cfCreatorInput'),status=q('#cfCreatorStatus');if(!input)return;var value=tx(input.value);if(!value)return;
  status.hidden=true;
  if(state.step==='idea'){
    state.idea=value;user(value);quicks([]);state.step='name';updateComposerForStep();
    setTimeout(function(){assistant('Entendi. Já consigo imaginar uma direção. Antes de continuar, como posso te chamar?')},180);
  }else if(state.step==='name'){
    state.name=value;user(value);state.step='email';updateComposerForStep();
    setTimeout(function(){assistant('Prazer, '+esc(firstName())+'! Vou guardar sua ideia. Antes de gerar a arte, qual e-mail você quer usar para salvar a criação e receber o aviso quando ela ficar pronta?')},180);
  }else if(state.step==='email'){
    if(!validEmail(value)){status.hidden=false;status.textContent='Digite um e-mail válido, por exemplo nome@email.com.';return}
    state.email=value.toLowerCase();user(state.email);state.step='confirm';updateComposerForStep();
    setTimeout(function(){assistant('Perfeito. Sua ideia é: “'+esc(shortIdea())+'”.'+(state.photoName?' E já tenho a foto de referência.':'')+' Posso criar a primeira versão?');quicks(['✨ Criar primeira versão','Quero acrescentar um detalhe'])},180);
  }else if(state.step==='confirm'){
    user(value);
    if(/^✨?\s*criar/i.test(value))showSimulatedPreview();
    else {state.idea=state.idea+' '+value;setTimeout(function(){assistant('Ótimo, acrescentei esse detalhe. Quando quiser, posso criar a primeira versão.');quicks(['✨ Criar primeira versão'])},180)}
  }
  input.value='';
}
function showSimulatedPreview(){
  quicks([]);q('#cfCreatorCompose').hidden=true;
  assistant('Combinado. Nesta etapa visual, vou simular o ponto em que a geração real entrará.');
  setTimeout(function(){q('#cfCreatorPreview').hidden=false;q('#cfCreatorPreview').scrollIntoView({behavior:'smooth',block:'nearest'})},260);
}
function bindCreator(){
  var input=q('#cfCreatorInput'),send=q('#cfCreatorSend'),mic=q('#cfCreatorMic'),status=q('#cfCreatorStatus'),file=q('#cfCreatorFile'),photo=q('#cfCreatorPhoto');
  q('#cfCreatorClose').onclick=closeCreator;q('#cfCreatorOverlay').onclick=closeCreator;
  send.onclick=sendCreator;input.onkeydown=function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendCreator()}};
  var rec=speech(input,mic,status);mic.onclick=function(){if(rec)try{rec.start()}catch(e){}};
  photo.onclick=function(){file.click()};
  file.onchange=function(){var f=file.files&&file.files[0];if(!f)return;state.photoName=f.name||'Foto enviada';bubble('user','📷 '+state.photoName,false);setTimeout(function(){assistant('Foto recebida. No fluxo final ela será usada como referência somente quando fizer sentido para a arte.')},150)};
  qa('[data-cf-revise]',q('#cfCreatorSheet')).forEach(function(b){b.onclick=function(){q('#cfCreatorPreview').hidden=true;q('#cfCreatorCompose').hidden=false;state.step='confirm';updateComposerForStep();assistant('Claro. Me diga o que você quer mudar ou acrescentar.');q('#cfCreatorInput').focus()}});
  qa('[data-cf-simulate-buy]',q('#cfCreatorSheet')).forEach(function(b){b.onclick=function(){q('#cfCreatorPreview').innerHTML='<div class="cf-sim-success"><span>✓</span><strong>Fluxo visual aprovado até aqui</strong><p>Depois conectaremos geração, frete e pagamento sem mudar esta experiência.</p></div>'}});
}

function bindOpeners(){
  if(document.__cfPublicOpeners)return;document.__cfPublicOpeners=1;
  document.addEventListener('click',function(e){
    var open=e.target&&e.target.closest&&e.target.closest('[data-cf-open-create],.cf-bottom-create');
    if(!open)return;
    if(!isListing())return;
    e.preventDefault();openCreator();
  },true);
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&document.body.classList.contains('cf-creator-open'))closeCreator()});
  window.addEventListener('canecafacil:open-create',openCreator);
}

function queryIntent(){
  try{if(new URLSearchParams(location.search).get('cf_criar')==='1')setTimeout(openCreator,350)}catch(e){}
}

function init(){
  if(!isListing())return;
  loadCss();hero();compactCreateBar();creatorShell();bindOpeners();queryIntent();
  document.body.classList.add('cf-public-experience');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
window.addEventListener('load',init,{once:true});
setTimeout(init,350);setTimeout(init,1000);
console.info('CanecaFácil · Experiência Pública '+BUILD);
})();