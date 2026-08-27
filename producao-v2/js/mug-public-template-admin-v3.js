(() => {
'use strict';

const BUILD = '20260826-mug-template-admin-v3-stable';
const TAB = 'mug-personalizacao';
const FALLBACK_FB = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
const PRODUCTS_NODE = 'produtos';
const PRIVATE_NODE = 'canecas/modelos_privados';
const MODELS_NODE = 'canecas/modelos_criacao';
const TYPES = { foto:'Foto', texto:'Texto curto', texto_longo:'Texto / frase', data:'Data', numero:'Número', select:'Lista de opções', cor:'Cor' };

if (window.__DA_MUG_TEMPLATE_ADMIN_V3__ === BUILD) return;
window.__DA_MUG_TEMPLATE_ADMIN_V3__ = BUILD;

const state = { key:'', product:null, fields:[], privateCfg:{}, loading:false, saving:false, loadToken:0, loadedKey:'' };
const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
const text = value => String(value ?? '').trim();
const esc = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
const norm = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ');

function localConfig(){ try{return JSON.parse(localStorage.getItem('da_admin_v2_config')||'{}')||{};}catch{return{};} }
function firebaseBase(){ return text(localConfig().firebaseUrl||FALLBACK_FB).replace(/\/+$/,''); }
function productsNode(){ return text(localConfig().productsNode||PRODUCTS_NODE).replace(/^\/+|\/+$/g,'')||PRODUCTS_NODE; }
function slug(value,fallback='campo'){ return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,48)||fallback; }
function isMug(product={}){ return norm([product.categoria,product.subcategoria,product.subsubcategoria,product.tipo_produto,product.origem_cadastro,product.nome].join(' ')).includes('caneca'); }
function art(product={}){ return text(product.arte_horizontal||product.arte_personalizacao||product.arte_impressao?.url||product.arte_final_url||product.configuracao_arte?.arte_horizontal); }
function phrase(product={}){ return text(product.personalizacao_cliente?.frase||product.configuracao_arte?.frase_cliente||product.frase||product.modelo_frase||product.texto_identificado_arte); }
function highlightName(product={}){ return text(product.personalizacao_cliente?.nome_destaque||product.configuracao_arte?.nome_destaque||product.nome_destaque); }
function images(product={}){ const list=[product.mockup_1,product.mockup_2,product.mockup_3,...(Array.isArray(product.imagens_site)?product.imagens_site:[]),...(Array.isArray(product.imagens)?product.imagens:[]),product.url_imagem,product.imagem_url,product.imagem]; return [...new Set(list.map(text).filter(v=>/^https?:\/\//i.test(v)))].slice(0,3); }

async function firebase(path,options={}){
  const url=`${firebaseBase()}/${path}.json${options.method?'':`?_=${Date.now()}`}`;
  const response=await fetch(url,{cache:'no-store',headers:{Accept:'application/json',...(options.headers||{})},...options});
  if(!response.ok) throw new Error(`Firebase respondeu ${response.status}`);
  const raw=await response.text(); return raw?JSON.parse(raw):null;
}

function field(value={},index=0){
  const tipo=TYPES[value.tipo]?value.tipo:'texto';
  const opcoes=Array.isArray(value.opcoes)?value.opcoes.map(text).filter(Boolean):text(value.opcoes).split(/\r?\n|[,;|]/).map(text).filter(Boolean);
  return { id:slug(value.id||value.label||`campo_${index+1}`,`campo_${index+1}`),tipo,label:text(value.label||`Campo ${index+1}`),obrigatorio:value.obrigatorio===true,publico:value.publico!==false,placeholder:text(value.placeholder),valor_padrao:text(value.valor_padrao),ajuda:text(value.ajuda),opcoes,instrucao_ia:text(value.instrucao_ia),ordem:index };
}
function defaultFields(product={}){
  return [
    field({id:'foto_principal',tipo:'foto',label:'Envie sua foto',obrigatorio:true,publico:true,ajuda:'Escolha uma foto nítida e bem iluminada.',instrucao_ia:'Use a foto enviada como referência principal. Preserve identidade, rosto e características reconhecíveis.'},0),
    field({id:'nome',tipo:'texto',label:'Nome na caneca',publico:true,valor_padrao:highlightName(product),placeholder:'Digite o nome',instrucao_ia:'Se houver nome informado, escreva-o exatamente como recebido.'},1),
    field({id:'frase',tipo:'texto_longo',label:'Frase',publico:true,valor_padrao:phrase(product),placeholder:'Digite a frase',instrucao_ia:'Se houver frase informada, escreva-a exatamente como recebida, preservando acentos e pontuação.'},2)
  ];
}
function publicField(item){ return {id:item.id,tipo:item.tipo,label:item.label,obrigatorio:item.obrigatorio,publico:item.publico,placeholder:item.placeholder,valor_padrao:item.valor_padrao,ajuda:item.ajuda,opcoes:item.opcoes,ordem:item.ordem}; }

function installStyles(){
  if($('#mugTemplateStylesV3')) return;
  const style=document.createElement('style'); style.id='mugTemplateStylesV3';
  style.textContent=`
  [data-editor-tab="${TAB}"]{white-space:nowrap}.mug-v3{display:grid;gap:14px;padding:2px 0 24px}.mug-v3-box{padding:15px;border:1px solid #dde1d9;border-radius:14px;background:#fff;display:grid;gap:12px}.mug-v3-box.private{background:#fbf8ff;border-color:#d9cee9}.mug-v3-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.mug-v3-head strong{display:block;font-size:14px}.mug-v3-head small{display:block;color:#71776d;font-size:11px;margin-top:3px}.mug-v3-badge{font-size:10px;font-weight:800;padding:5px 7px;border-radius:999px;background:#edf3e9;color:#31512d}.mug-v3-switches,.mug-v3-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.mug-v3-switch{display:flex;align-items:flex-start;gap:8px;padding:10px;border:1px solid #e4e6e0;border-radius:11px;background:#fafbf9}.mug-v3-switch strong{display:block;font-size:11px}.mug-v3-switch small{display:block;color:#73786f;font-size:10px;margin-top:2px}.mug-v3-fields{display:grid;gap:10px}.mug-v3-field{padding:11px;border:1px solid #e3e5df;border-radius:12px;background:#fafbf8;display:grid;gap:8px}.mug-v3-field-head{display:flex;justify-content:space-between;gap:8px;align-items:center}.mug-v3-actions{display:flex;gap:4px}.mug-v3-actions button{width:30px;height:30px;border:1px solid #d4d8d0;border-radius:8px;background:#fff;cursor:pointer}.mug-v3-grid label,.mug-v3-field label{display:grid;gap:4px;font-size:10px;font-weight:700}.mug-v3-grid input,.mug-v3-grid textarea,.mug-v3-grid select,.mug-v3-field input,.mug-v3-field textarea,.mug-v3-field select{box-sizing:border-box;width:100%;border:1px solid #d7dbd3;border-radius:9px;padding:9px;font:inherit;background:#fff}.mug-v3-grid textarea,.mug-v3-field textarea{min-height:74px;resize:vertical}.mug-v3-span{grid-column:1/-1}.mug-v3-add{display:flex;flex-wrap:wrap;gap:6px}.mug-v3-add button{padding:8px 10px;border:1px dashed #aeb7aa;border-radius:9px;background:#f7f9f5;font-size:10px;cursor:pointer}.mug-v3-save{min-height:44px;border:0;border-radius:11px;background:#252822;color:#fff;font-weight:800;cursor:pointer}.mug-v3-save:disabled{opacity:.55}.mug-v3-status{padding:12px;border-radius:11px;background:#f4f6f1;font-size:11px}.mug-v3-status.error{background:#fff0ef;color:#8b2b2b}.mug-v3-art{font-size:10px;color:#6c7168;overflow-wrap:anywhere}.mug-v3-toast{position:fixed;z-index:99999;bottom:22px;left:50%;transform:translateX(-50%);background:#222;color:#fff;padding:10px 13px;border-radius:10px;font-size:12px;max-width:88vw}.mug-v3-toast.error{background:#8b2b2b}@media(max-width:700px){.mug-v3-switches,.mug-v3-grid{grid-template-columns:1fr}.mug-v3-head{display:grid}}
  `;
  document.head.appendChild(style);
}
function ensureUi(){
  installStyles(); const tabs=$('#editorTabs'),form=$('#productForm'); if(!tabs||!form) return false;
  let button=tabs.querySelector(`[data-editor-tab="${TAB}"]`); if(!button){button=document.createElement('button');button.type='button';button.dataset.editorTab=TAB;button.textContent='Personalização';button.title='Campos personalizáveis da caneca';tabs.appendChild(button);}
  let section=form.querySelector(`[data-editor-section="${TAB}"]`); if(!section){section=document.createElement('section');section.className='editor-section';section.dataset.editorSection=TAB;form.appendChild(section);} else section.classList.add('editor-section');
  return true;
}
function setTabVisible(visible){ const button=$(`[data-editor-tab="${TAB}"]`); if(button)button.hidden=!visible; }
function toast(message,error=false){ let node=$('#mugTemplateToastV3'); if(!node){node=document.createElement('div');node.id='mugTemplateToastV3';document.body.appendChild(node);} node.textContent=message;node.className=`mug-v3-toast${error?' error':''}`;node.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.hidden=true,error?5200:3000); }
function status(message,error=false){ ensureUi(); const section=$(`[data-editor-section="${TAB}"]`); if(section)section.innerHTML=`<div class="mug-v3-status${error?' error':''}">${esc(message)}</div>`; }

function recoverKey(){
  if(state.key) return state.key;
  const editor=$('#productEditor'); if(!editor?.classList.contains('open')) return '';
  const title=norm($('#editorTitle')?.textContent); const subtitle=text($('#editorSubtitle')?.textContent); const code=norm(subtitle.split('·')[0]);
  const candidates=$$('[data-product-key]');
  let match=candidates.find(node=>{const row=norm(node.closest('tr')?.textContent||node.parentElement?.textContent);return code&&row.includes(code);});
  if(!match&&title) match=candidates.find(node=>norm(node.closest('tr')?.textContent||node.parentElement?.textContent).includes(title));
  if(match?.dataset.productKey) state.key=text(match.dataset.productKey);
  return state.key;
}

function fieldCard(item,index){ return `<article class="mug-v3-field" data-mug-v3-field data-index="${index}"><div class="mug-v3-field-head"><strong>${esc(item.label||`Campo ${index+1}`)}</strong><div class="mug-v3-actions"><button type="button" data-v3-up>↑</button><button type="button" data-v3-down>↓</button><button type="button" data-v3-remove>×</button></div></div><div class="mug-v3-grid"><label>ID<input data-v3-x="id" value="${esc(item.id)}"></label><label>Tipo<select data-v3-x="tipo">${Object.entries(TYPES).map(([v,l])=>`<option value="${v}" ${v===item.tipo?'selected':''}>${l}</option>`).join('')}</select></label><label>Texto exibido no site<input data-v3-x="label" value="${esc(item.label)}"></label><label>Valor do modelo<input data-v3-x="padrao" value="${esc(item.valor_padrao)}"></label><label class="mug-v3-span">Placeholder<input data-v3-x="placeholder" value="${esc(item.placeholder)}"></label><label class="mug-v3-span">Ajuda ao cliente<input data-v3-x="ajuda" value="${esc(item.ajuda)}"></label><label class="mug-v3-span" ${item.tipo==='select'?'':'hidden'} data-v3-options>Opções<textarea data-v3-x="opcoes">${esc((item.opcoes||[]).join('\n'))}</textarea></label><label class="mug-v3-span">Instrução privada para a IA<textarea data-v3-x="ia">${esc(item.instrucao_ia)}</textarea></label><label><span><input data-v3-x="obrigatorio" type="checkbox" ${item.obrigatorio?'checked':''}> Obrigatório</span></label><label><span><input data-v3-x="publico" type="checkbox" ${item.publico?'checked':''}> Mostrar no site</span></label></div></article>`; }
function readFields(){ return $$('.mug-v3-field').map((card,index)=>field({id:$('[data-v3-x="id"]',card)?.value,tipo:$('[data-v3-x="tipo"]',card)?.value,label:$('[data-v3-x="label"]',card)?.value,placeholder:$('[data-v3-x="placeholder"]',card)?.value,valor_padrao:$('[data-v3-x="padrao"]',card)?.value,ajuda:$('[data-v3-x="ajuda"]',card)?.value,opcoes:$('[data-v3-x="opcoes"]',card)?.value,instrucao_ia:$('[data-v3-x="ia"]',card)?.value,obrigatorio:$('[data-v3-x="obrigatorio"]',card)?.checked,publico:$('[data-v3-x="publico"]',card)?.checked},index)); }
function makeNew(type){ const n=state.fields.length+1; const defaults={foto:['foto','Envie uma foto'],texto:['texto','Nome / texto'],texto_longo:['frase','Frase'],data:['data','Data'],numero:['numero','Número'],select:['opcao','Escolha uma opção'],cor:['cor','Escolha uma cor']}; const [id,label]=defaults[type]||['campo','Campo']; return field({id:`${id}_${n}`,tipo:type,label,publico:true},state.fields.length); }

function render(){
  ensureUi(); const section=$(`[data-editor-section="${TAB}"]`); if(!section)return;
  if(state.loading){status('Carregando os campos personalizáveis desta caneca…');return;}
  if(!state.key){status('Identificando a caneca aberta…');return;}
  if(!state.product){status('Não foi possível carregar o cadastro desta caneca.',true);return;}
  const mug=isMug(state.product); setTabVisible(mug); if(!mug){status('Este cadastro não foi identificado como caneca.');return;}
  const cfg=state.product.personalizacao_config_publica||{};
  section.innerHTML=`<div class="mug-v3"><section class="mug-v3-box"><div class="mug-v3-head"><div><strong>Personalização desta caneca</strong><small>O formulário aparece no site assim que você salvar e publicar o modelo.</small></div><span class="mug-v3-badge">CANECAS V3</span></div><div class="mug-v3-switches"><label class="mug-v3-switch"><input id="mugV3Enabled" type="checkbox" ${state.product.modelo_caneca===true?'checked':''}><span><strong>Usar como modelo</strong><small>Reutiliza esta arte.</small></span></label><label class="mug-v3-switch"><input id="mugV3Public" type="checkbox" ${state.product.modelo_publico===true?'checked':''}><span><strong>Modelo público</strong><small>Disponibiliza no site.</small></span></label><label class="mug-v3-switch"><input id="mugV3Customization" type="checkbox" ${state.product.personalizacao_publica===true?'checked':''}><span><strong>Campos personalizáveis no site</strong><small>Ativa o formulário para o cliente.</small></span></label><label class="mug-v3-switch"><input id="mugV3Whatsapp" type="checkbox" ${cfg.whatsapp_obrigatorio!==false?'checked':''}><span><strong>WhatsApp obrigatório</strong><small>Identifica cada criação.</small></span></label></div><div class="mug-v3-art"><strong>Arte:</strong> ${esc(art(state.product)||'não encontrada')}</div></section><section class="mug-v3-box"><div class="mug-v3-head"><div><strong>Campos personalizáveis</strong><small>Adicione, remova ou reordene os campos.</small></div><span class="mug-v3-badge">${state.fields.length} campo${state.fields.length===1?'':'s'}</span></div><div class="mug-v3-fields">${state.fields.map(fieldCard).join('')||'<div class="mug-v3-status">Nenhum campo.</div>'}</div><div class="mug-v3-add">${Object.entries(TYPES).map(([v,l])=>`<button type="button" data-v3-add="${v}">+ ${l}</button>`).join('')}</div></section><section class="mug-v3-box private"><div class="mug-v3-head"><div><strong>Regras privadas da IA</strong><small>O cliente não vê estas instruções.</small></div></div><div class="mug-v3-grid"><label class="mug-v3-span">Regra geral<textarea id="mugV3PrivatePrompt">${esc(state.privateCfg.prompt_privado||'')}</textarea></label><label class="mug-v3-span">Observação interna<input id="mugV3PrivateNote" value="${esc(state.privateCfg.observacao||'')}"></label></div></section><button class="mug-v3-save" id="mugV3Save" type="button">Salvar personalização desta caneca</button></div>`;
}

async function loadProduct(key,{force=false}={}){
  const normalized=text(key||recoverKey()); if(!normalized)return;
  if(!force&&state.loadedKey===normalized&&state.product){render();return;}
  state.key=normalized; state.loading=true; state.product=null; state.fields=[]; state.privateCfg={}; const token=++state.loadToken; render();
  try{
    const [product,privateCfg]=await Promise.all([firebase(`${productsNode()}/${encodeURIComponent(normalized)}`),firebase(`${PRIVATE_NODE}/${encodeURIComponent(normalized)}`).catch(()=>null)]);
    if(token!==state.loadToken)return;
    state.product=product&&typeof product==='object'?product:null; state.privateCfg=privateCfg&&typeof privateCfg==='object'?privateCfg:{}; state.loadedKey=normalized;
    if(!state.product) throw new Error('Produto não encontrado no Firebase.');
    const cfg=state.product.personalizacao_config_publica||{}; const privateFields=Array.isArray(state.privateCfg.campos)?state.privateCfg.campos:[];
    state.fields=Array.isArray(cfg.campos)&&cfg.campos.length?cfg.campos.map((item,index)=>field({...item,instrucao_ia:privateFields.find(x=>text(x.id)===text(item.id))?.instrucao_ia||''},index)):defaultFields(state.product);
  }catch(error){ if(token===state.loadToken){console.error('[Canecas V3]',error);toast(error?.message||String(error),true);} }
  finally{ if(token===state.loadToken){state.loading=false;render();} }
}

async function save(){
  if(state.saving||!state.key||!state.product)return; state.fields=readFields(); const ids=new Set();
  for(const item of state.fields){if(!item.label)throw new Error('Todo campo precisa de um texto.');if(ids.has(item.id))throw new Error(`ID repetido: ${item.id}`);ids.add(item.id);}
  const now=new Date().toISOString(); const enabled=$('#mugV3Enabled')?.checked===true; const publicModel=$('#mugV3Public')?.checked===true; const customization=$('#mugV3Customization')?.checked===true; const whatsapp=$('#mugV3Whatsapp')?.checked!==false;
  const publicCfg={versao:4,ativo:customization,whatsapp_obrigatorio:whatsapp,arte_referencia:art(state.product),campos:state.fields.filter(x=>x.publico).map(publicField),atualizado_em:now};
  const privatePayload={versao:4,product_key:state.key,prompt_privado:text($('#mugV3PrivatePrompt')?.value),observacao:text($('#mugV3PrivateNote')?.value),campos:state.fields.map(x=>({id:x.id,instrucao_ia:x.instrucao_ia})),atualizado_em:now};
  const patch={modelo_caneca:enabled,modelo_publico:publicModel,personalizacao_publica:customization,personalizacao_template_versao:4,personalizacao_config_publica:publicCfg,updated_at:now,last_update:Date.now()};
  const media=images(state.product); const model={product_key:state.key,id:state.product.id||state.key,nome:state.product.nome||'Modelo de caneca',imagem:media[0]||art(state.product),mockup_1:media[0]||'',mockup_2:media[1]||'',mockup_3:media[2]||'',arte_horizontal:art(state.product),modelo_publico:publicModel,personalizacao_publica:customization,personalizacao_config_publica:publicCfg,atualizado_em:now};
  state.saving=true; const button=$('#mugV3Save'); if(button){button.disabled=true;button.textContent='Salvando…';}
  try{
    const tasks=[firebase(`${productsNode()}/${encodeURIComponent(state.key)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)}),firebase(`${PRIVATE_NODE}/${encodeURIComponent(state.key)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(privatePayload)})];
    if(enabled)tasks.push(firebase(`${MODELS_NODE}/${encodeURIComponent(state.key)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(model)}));
    await Promise.all(tasks); state.product={...state.product,...patch};state.privateCfg=privatePayload;toast('Personalização salva no Firebase.');window.dispatchEvent(new CustomEvent('admin-v2-products-invalidated',{detail:{source:BUILD,key:state.key}}));window.dispatchEvent(new CustomEvent('mug-template-saved',{detail:{source:BUILD,key:state.key}}));
  }finally{state.saving=false;render();}
}

let syncTimer=0;
function scheduleSync(delay=0,force=false){ clearTimeout(syncTimer); syncTimer=setTimeout(()=>{ensureUi();const editor=$('#productEditor');if(!editor?.classList.contains('open'))return;const key=recoverKey();if(key)loadProduct(key,{force});else status('Identificando a caneca aberta…');},delay); }
function rememberFromTarget(target){const node=target?.closest?.('[data-product-key]');if(!node?.dataset.productKey)return false;state.key=text(node.dataset.productKey);return true;}

function bind(){
  document.addEventListener('pointerdown',event=>{if(rememberFromTarget(event.target)){state.loadedKey='';scheduleSync(0,true);}},true);
  document.addEventListener('click',event=>{
    if(rememberFromTarget(event.target)){state.loadedKey='';[0,80,220].forEach(ms=>setTimeout(()=>scheduleSync(0,true),ms));}
    if(event.target.closest(`[data-editor-tab="${TAB}"]`)){scheduleSync(0);return;}
    const add=event.target.closest('[data-v3-add]');if(add){state.fields=readFields();state.fields.push(makeNew(add.dataset.v3Add));render();return;}
    const card=event.target.closest('[data-mug-v3-field]');if(card){const index=Number(card.dataset.index);state.fields=readFields();if(event.target.closest('[data-v3-remove]'))state.fields.splice(index,1);else if(event.target.closest('[data-v3-up]')&&index>0)[state.fields[index-1],state.fields[index]]=[state.fields[index],state.fields[index-1]];else if(event.target.closest('[data-v3-down]')&&index<state.fields.length-1)[state.fields[index+1],state.fields[index]]=[state.fields[index],state.fields[index+1]];else return;render();return;}
    if(event.target.closest('#mugV3Save'))save().catch(error=>{console.error('[Canecas V3] save',error);toast(error?.message||String(error),true);});
  },true);
  document.addEventListener('change',event=>{const select=event.target.closest('[data-v3-x="tipo"]');if(!select)return;const options=$('[data-v3-options]',select.closest('[data-mug-v3-field]'));if(options)options.hidden=select.value!=='select';});
  const observer=new MutationObserver(()=>scheduleSync(30)); observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-hidden']});
  window.addEventListener('admin-v2-products-invalidated',()=>scheduleSync(120,true));
  window.addEventListener('mug-template-saved',()=>scheduleSync(120,true));
  [0,120,400,1000].forEach(ms=>setTimeout(()=>scheduleSync(0),ms));
}

bind();
console.info(`Canecas · ${BUILD}`);
})();
