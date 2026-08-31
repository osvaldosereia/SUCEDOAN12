import {
  PERSONALIZATION_CONTRACT_BUILD,
  normalizePersonalizationConfig,
  validatePersonalizationInput,
  buildPersonalizationPrompt,
  makeUploadDescriptors
} from './personalization-contract-v1.js?v=20260831-1';

const BUILD='20260831-loja-integrada-personalizador-v4-staging';
const FIREBASE='https://cedar-chemist-310801-default-rtdb.firebaseio.com';
const MAKE_WEBHOOK='https://hook.eu1.make.com/cl3r1f56r9txezvltkkwlsspmnja6sw4';
const RESULT_NODE='canecas/geracoes';
const CREATIONS_NODE='canecas/personalizadas';
const WAIT_MS=180000;
const POLL_MS=1800;
const params=new URLSearchParams(location.search);
const modelId=String(params.get('model')||'').trim();
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const text=v=>String(v??'').trim();
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
const safeKey=v=>text(v).replace(/[.#$\[\]/]/g,'_');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const now=()=>new Date().toISOString();
let product=null;
let config=null;
let currentCode='';
let currentSource='';
const uploads={};

function money(value){return Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
function productImage(p={}){const list=[p.mockup_2,p.mockup_1,p.url_imagem,p.imagem_url,p.imagem,...(Array.isArray(p.imagens_site)?p.imagens_site:[]),...(Array.isArray(p.imagens)?p.imagens:[])];return list.map(v=>typeof v==='object'?(v?.url||v?.src||''):v).map(text).find(v=>/^https?:\/\//i.test(v))||'';}
function modelArt(p={}){return text(p.arte_horizontal||p.arte_personalizacao||p.arte_impressao?.url||p.arte_final_url);}
function showError(message){$('#progressBox').hidden=true;$('#errorText').textContent=message;$('#errorBox').hidden=false;}
function hideError(){$('#errorBox').hidden=true;}
async function fetchJson(path){const response=await fetch(`${FIREBASE}/${path}.json?_=${Date.now()}`,{cache:'no-store',headers:{Accept:'application/json'}});if(!response.ok)throw new Error(`Firebase ${response.status}`);return response.json();}
async function writeJson(path,data,method='PUT'){const response=await fetch(`${FIREBASE}/${path}.json`,{method,headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(data)});if(!response.ok)throw new Error(`Firebase ${response.status}`);return response.json().catch(()=>null);}
function fileToDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(text(reader.result));reader.onerror=()=>reject(new Error('Não foi possível ler a imagem.'));reader.readAsDataURL(file);});}
async function urlToDataUrl(url){if(/^data:image\//i.test(url))return url;if(!/^https?:\/\//i.test(url))return'';const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw new Error('Não foi possível carregar a arte-base do modelo.');return fileToDataUrl(await response.blob());}
function imageSource(record){if(!record||typeof record!=='object')return'';const nested=record.result&&typeof record.result==='object'?record.result:{};const value=text(record.art_source_url||record.art_url||record.result_url||record.arte_horizontal_url||record.arte_horizontal||record.art_source_base64||record.image_base64||nested.art_source_url||nested.art_source_base64);if(/^https?:\/\//i.test(value)||/^data:image\//i.test(value))return value;if(/^[A-Za-z0-9+/=\r\n]+$/.test(value)&&value.length>1000)return`data:image/webp;base64,${value.replace(/\s+/g,'')}`;return'';}
async function waitResult(requestId){const started=Date.now();while(Date.now()-started<WAIT_MS){$('#progressText').textContent=`Gerando sua arte · ${Math.max(1,Math.round((Date.now()-started)/1000))}s`;const record=await fetchJson(`${RESULT_NODE}/${safeKey(requestId)}`).catch(()=>null);if(record?.ok===false||record?.error||record?.erro)throw new Error(record.error||record.erro||'A automação não conseguiu gerar a arte.');const source=imageSource(record);if(source)return source;await sleep(POLL_MS);}throw new Error('A personalização demorou mais de 3 minutos. Tente novamente.');}
function creationCode(){const d=new Date(),date=`${String(d.getFullYear()).slice(-2)}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;return`CF-${date}-${Date.now().toString(36).toUpperCase().slice(-6)}`;}

function renderProduct(){const image=productImage(product||{});$('#productBox').innerHTML=`${image?`<img src="${esc(image)}" alt="${esc(product?.nome||'Caneca')}">`:'<div class="skeleton media"></div>'}<div class="product-copy"><h2>${esc(product?.nome||'Caneca')}</h2><p>${config.requiredForPurchase?'Personalização obrigatória':'Personalização disponível'}</p><strong>${money(product?.preco)}</strong></div>`;}
function inputHtml(field){if(field.type==='image')return`<label class="wide-block cf-v4-field" data-field="${esc(field.id)}"><span>${esc(field.label)}${field.required?' *':''}</span><input type="file" data-upload-id="${esc(field.id)}" accept="image/png,image/jpeg,image/webp" ${field.required?'required':''}><small>JPG, PNG ou WEBP. A imagem será usada somente neste campo.</small><div class="photo-preview" data-preview="${esc(field.id)}" hidden></div></label>`;return`<label class="cf-v4-field" data-field="${esc(field.id)}">${esc(field.label)}${field.required?' *':''}<input data-value-id="${esc(field.id)}" ${field.max?`maxlength="${field.max}"`:''} ${field.required?'required':''}></label>`;}
function renderFields(){const root=$('#dynamicFields');root.innerHTML=config.fields.map(inputHtml).join('');$$('[data-upload-id]',root).forEach(input=>input.onchange=async()=>{const id=input.dataset.uploadId,preview=$(`[data-preview="${id}"]`,root);uploads[id]='';preview.hidden=true;preview.innerHTML='';const file=input.files?.[0];if(!file)return;if(!/^image\/(png|jpeg|webp)$/i.test(file.type))return showError('Use uma imagem JPG, PNG ou WEBP.');if(file.size>8*1024*1024)return showError('A imagem deve ter no máximo 8 MB.');hideError();uploads[id]=await fileToDataUrl(file);preview.innerHTML=`<img src="${esc(uploads[id])}" alt="Prévia de ${esc(id)}">`;preview.hidden=false;});}
function collectValues(){const values={};$$('[data-value-id]').forEach(input=>{const value=text(input.value);if(value)values[input.dataset.valueId]=value;});return values;}
function uploadSnapshot(){const out={};for(const [id,value] of Object.entries(uploads))if(value)out[id]=value;return out;}

async function persistCreation(source,values,prompt){const code=creationCode(),at=now();const record={id:code,origem:'loja_integrada_v4_staging',modelo_key:modelId,modelo_nome:text(product?.nome),produto_key:modelId,cliente_email:text($('#customerEmail').value).toLowerCase(),campos:values,uploads:Object.keys(uploadSnapshot()),arte_horizontal:source,arte_personalizacao:source,arte_versao:'v1',arte_versao_aprovada:'',versoes:[{versao:'v1',url:source,criado_em:at,status:'gerada'}],personalizacao_snapshot:{config_version:config.configVersion,prompt_base_id:config.promptBaseId,prompt_base_versao:config.promptBaseVersion,prompt_especifico:config.promptSpecific,campos_liberados:config.fields.map(f=>({id:f.id,label:f.label,type:f.type,required:f.required})),contract:PERSONALIZATION_CONTRACT_BUILD,prompt_final:prompt},status:'arte_pronta',aprovada:false,criado_em:at,atualizado_em:at};await writeJson(`${CREATIONS_NODE}/${safeKey(code)}`,record,'PUT');return code;}

async function generate(event){event.preventDefault();hideError();$('#resultBox').hidden=true;const button=$('#generateButton');button.disabled=true;$('#progressBox').hidden=false;try{const email=text($('#customerEmail').value).toLowerCase();if(!/^\S+@\S+\.\S+$/.test(email))throw new Error('Digite um e-mail válido para salvar sua criação.');const values=collectValues(),customerUploads=uploadSnapshot();const errors=validatePersonalizationInput(config,values,customerUploads);if(errors.length)throw new Error(errors[0]);const artUrl=modelArt(product||{});if(!artUrl)throw new Error('Este modelo não possui arte-base disponível.');const baseArt=await urlToDataUrl(artUrl);if(!baseArt)throw new Error('Não foi possível preparar a arte-base.');const prompt=buildPersonalizationPrompt(config,values,customerUploads);const requestId=`LIV4-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;const payload={action:'personalize_mug_model',request_id:requestId,model_id:modelId,mode:'loja_integrada_v4_staging',origin:'loja_integrada',store_domain:'canecafacil.com.br',customer_name:'',customer_whatsapp:'',customer_email:email,fields_json:JSON.stringify(values),images_json:JSON.stringify(makeUploadDescriptors(config,customerUploads)),image_base64:baseArt,instruction:'',prompt_art:prompt,firebase_url:FIREBASE,products_node:'produtos',quality:'low',client_contract:BUILD};const response=await fetch(MAKE_WEBHOOK,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({payload:JSON.stringify(payload)})});const raw=await response.text();if(!response.ok)throw new Error(`Automação respondeu HTTP ${response.status}.`);let source='';if(raw&&!/^accepted\.?$/i.test(text(raw))){try{const data=JSON.parse(raw);if(data.ok===false)throw new Error(data.error||'A automação recusou a personalização.');source=imageSource(data);}catch(error){if(!(error instanceof SyntaxError))throw error;}}if(!source)source=await waitResult(requestId);currentCode=await persistCreation(source,values,prompt);currentSource=source;$('#progressBox').hidden=true;$('#resultImage').src=source;$('#resultCode').textContent=currentCode;$('#resultBox').hidden=false;$('#personalizerForm').hidden=true;$('#resultBox').scrollIntoView({behavior:'smooth',block:'start'});}catch(error){showError(error?.message||String(error));}finally{button.disabled=false;}}

async function init(){try{if(!modelId)throw new Error('Abra o teste informando ?model=CHAVE_DA_CANECA.');product=await fetchJson(`produtos/${safeKey(modelId)}`);if(!product)throw new Error('Modelo de caneca não encontrado.');config=normalizePersonalizationConfig(product);if(!config.active)throw new Error('Este modelo ainda não está liberado para personalização no Admin.');if(!config.fields.length)throw new Error('Este modelo está marcado como personalizável, mas não possui campos liberados.');renderProduct();renderFields();$('#configSummary').innerHTML=`<b>Campos liberados:</b> ${esc(config.fields.map(f=>f.label).join(', '))}<br><small>Configuração v${config.configVersion||1} · ${esc(config.promptBaseName||config.promptBaseId||'sem prompt padrão')}</small>`;$('#personalizerForm').hidden=false;}catch(error){showError(error?.message||String(error));}}

$('#personalizerForm').addEventListener('submit',generate);
$('#redoButton').onclick=()=>{if(!currentCode)return;$('#resultBox').hidden=true;$('#personalizerForm').hidden=false;window.scrollTo({top:0,behavior:'smooth'});};
$('#copyCode').onclick=async()=>{if(currentCode)await navigator.clipboard?.writeText(currentCode).catch(()=>{});};
$('#backButton').onclick=()=>history.length>1?history.back():location.assign('https://canecafacil.com.br/');
$('#tryAgain').onclick=()=>{hideError();$('#personalizerForm').hidden=false;};

document.documentElement.dataset.cfPersonalizerV4=BUILD;
init();
