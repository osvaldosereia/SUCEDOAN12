import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { text } from './core/utils.js';

const BUILD = '20260826-producao-canecas-clean-v15';
const DEFAULT_MAKE_WEBHOOK = 'https://hook.eu1.make.com/cl3r1f56r9txezvltkkwlsspmnja6sw4';
const WEBHOOK_KEY = 'da_admin_v2_mug_make_webhook';
const MASTER_WIDTH = 2400;
const MASTER_HEIGHT = 960;
const SIDE_WIDTH = 1344;
const PRINT_LABEL = '24 × 9,5 cm';
const MUG_CATEGORY = 'Caneca de Porcelana';
const MUG_CAPACITY = '350ml';
const MUG_NCM = '69111090';
const MUG_PRICE = 24.90;
const FINAL_WAIT_MS = 180000;
const POLL_MS = 1800;
const PH = Object.freeze({ art:'__MUG_ART__', m1:'__MUG_MOCKUP_1__', m2:'__MUG_MOCKUP_2__', m3:'__MUG_MOCKUP_3__' });

function loadConfig() {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}') }; }
  catch { return { ...DEFAULT_CONFIG }; }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function isHttpUrl(value) { return /^https?:\/\//i.test(text(value)) && !text(value).startsWith('__MUG_'); }
function isImageSource(value) { return isHttpUrl(value) || /^data:image\/(?:png|jpe?g|webp);base64,/i.test(text(value)); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function requestId() { return `mug-${Date.now()}-${Math.random().toString(36).slice(2,8)}`; }

function fileToDataUrl(file) {
  return new Promise((resolve,reject) => { const reader=new FileReader(); reader.onload=()=>resolve(String(reader.result||'')); reader.onerror=()=>reject(new Error('Não foi possível ler a imagem.')); reader.readAsDataURL(file); });
}

function loadImage(source) {
  return new Promise((resolve,reject) => { const image=new Image(); if (/^https?:/i.test(source)) image.crossOrigin='anonymous'; image.onload=()=>resolve(image); image.onerror=()=>reject(new Error('Não foi possível abrir a imagem gerada.')); image.src=source; });
}

async function normalizeReference(file) {
  const image=await loadImage(await fileToDataUrl(file));
  const scale=Math.min(1,1800/image.naturalWidth,1400/image.naturalHeight);
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(image.naturalWidth*scale)); canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const ctx=canvas.getContext('2d',{alpha:false}); ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(image,0,0,canvas.width,canvas.height);
  return canvas.toDataURL('image/webp',.94);
}

async function cropMaster(source) {
  const image=await loadImage(source);
  const target=MASTER_WIDTH/MASTER_HEIGHT; const ratio=image.naturalWidth/image.naturalHeight;
  let sx=0,sy=0,sw=image.naturalWidth,sh=image.naturalHeight;
  if (ratio>target) { sw=image.naturalHeight*target; sx=(image.naturalWidth-sw)/2; } else { sh=image.naturalWidth/target; sy=(image.naturalHeight-sh)/2; }
  const canvas=document.createElement('canvas'); canvas.width=MASTER_WIDTH; canvas.height=MASTER_HEIGHT;
  const ctx=canvas.getContext('2d',{alpha:false}); ctx.fillStyle='#fff'; ctx.fillRect(0,0,MASTER_WIDTH,MASTER_HEIGHT); ctx.drawImage(image,sx,sy,sw,sh,0,0,MASTER_WIDTH,MASTER_HEIGHT);
  return canvas.toDataURL('image/webp',.96);
}

async function cropReference(master,mode) {
  const image=await loadImage(master);
  const sx=mode===1?0:mode===2?MASTER_WIDTH-SIDE_WIDTH:Math.round((MASTER_WIDTH-SIDE_WIDTH)/2);
  const canvas=document.createElement('canvas'); canvas.width=SIDE_WIDTH; canvas.height=MASTER_HEIGHT;
  const ctx=canvas.getContext('2d',{alpha:false}); ctx.fillStyle='#fff'; ctx.fillRect(0,0,SIDE_WIDTH,MASTER_HEIGHT); ctx.drawImage(image,sx,0,SIDE_WIDTH,MASTER_HEIGHT,0,0,SIDE_WIDTH,MASTER_HEIGHT);
  return canvas.toDataURL('image/webp',.96);
}

function buildArtPrompt(instruction='') {
  const extra=text(instruction);
  return `Crie uma NOVA ARTE COMERCIAL PARA CANECA inspirada na imagem enviada.\n\n${extra?`INSTRUÇÕES DO OPERADOR — prioridade máxima:\n${extra}\n\n`:''}ENTREGA: somente arte plana horizontal ${MASTER_WIDTH}×${MASTER_HEIGHT}px (${PRINT_LABEL}), pronta para sublimação. Preserve proporções e equilíbrio entre esquerda, centro e direita. Não mostre caneca, mãos, mesa, embalagem ou interface. Se houver texto solicitado, reproduza exatamente; se não houver, não invente texto.`;
}

function buildMockupPrompt(mode) {
  const side=mode===1?'PRIMEIRA METADE / LADO ESQUERDO':mode===2?'SEGUNDA METADE / LADO DIREITO':'CENTRO DA ARTE';
  return `Use a arte fornecida como ARTE-MESTRE IMUTÁVEL. Mostre ${side} aplicado em uma caneca branca de porcelana 350ml, fotografia quadrada ultra realista, fundo claro e simples. Não redesenhe, não reescreva, não altere cores, não invente símbolos. Preserve a arte e aplique apenas a curvatura natural da caneca.`;
}

function fallbackCatalog(reason='') {
  return {
    tema:'Arte Criativa', nome:'Caneca de Porcelana Arte Criativa - 350ml', subcategoria:'Arte Criativa',
    descricao:'Caneca de porcelana branca 350ml com arte exclusiva, ideal para uso pessoal ou presente.',
    tags:['caneca de porcelana','caneca 350ml','arte criativa','presente'], seo_title:'Caneca de Porcelana Arte Criativa - 350ml',
    seo_description:'Caneca de porcelana branca 350ml com arte exclusiva, ideal para presente e uso pessoal.', texto_identificado:'', confianca_tema:0,
    source:'fallback', reason:text(reason).slice(0,180)
  };
}

function normalizeCatalog(input) {
  const base=fallbackCatalog();
  if (!input || typeof input!=='object' || Array.isArray(input)) return base;
  const clean=(value,max=180)=>text(value).replace(/[\r\n\t]+/g,' ').replace(/\s{2,}/g,' ').slice(0,max).trim();
  const theme=clean(input.tema||input.theme||'Arte Criativa',90)||'Arte Criativa';
  let name=clean(input.nome||input.product_name||input.name,160);
  if (!name) name=`Caneca de Porcelana ${theme} - 350ml`;
  if (!/^Caneca de Porcelana\s+/i.test(name)) name=`Caneca de Porcelana ${name.replace(/\s*-\s*350ml$/i,'')} - 350ml`;
  if (!/\s-\s350ml$/i.test(name)) name=`${name.replace(/\s*-?\s*350ml$/i,'').trim()} - 350ml`;
  const description=clean(input.descricao||input.description,800)||`Caneca de porcelana branca 350ml com arte temática de ${theme}, ideal para uso pessoal ou presente.`;
  const tags=(Array.isArray(input.tags)?input.tags:base.tags).map(item=>clean(item,60)).filter(Boolean).slice(0,10);
  return { tema:theme,nome:name,subcategoria:clean(input.subcategoria||theme,90)||theme,descricao:description,tags:tags.length?tags:base.tags,seo_title:clean(input.seo_title||name,120),seo_description:clean(input.seo_description||description,155),texto_identificado:clean(input.texto_identificado,260),confianca_tema:Math.max(0,Math.min(1,Number(input.confianca_tema)||0)),source:'ia_visual' };
}

function parseCatalog(result) {
  let raw=result?.catalog??result?.catalog_json??result?.metadata??result?.metadata_json??result?.result??result?.product_name??result?.name;
  if (raw && typeof raw==='object') return normalizeCatalog(raw);
  raw=text(raw).replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'').trim();
  if (!raw) return fallbackCatalog('retorno vazio');
  try { return normalizeCatalog(JSON.parse(raw)); }
  catch { return raw.length<=160?normalizeCatalog({nome:raw}):fallbackCatalog('retorno não JSON'); }
}

function firebaseContext() {
  const config=loadConfig();
  const base=text(config.firebaseUrl||DEFAULT_CONFIG.firebaseUrl).replace(/\/+$/,'');
  const node=text(config.productsNode||DEFAULT_CONFIG.productsNode||'produtos').replace(/^\/+|\/+$/g,'').replace(/\.json$/i,'')||'produtos';
  if (!base) throw new Error('Firebase não está configurado.');
  return {base,node};
}

async function firebaseGetProduct(id) {
  const {base,node}=firebaseContext();
  const response=await fetch(`${base}/${node}/${encodeURIComponent(id)}.json?_=${Date.now()}`,{cache:'no-store',headers:{Accept:'application/json'}});
  if (!response.ok) throw new Error(`Firebase ${response.status}`);
  return response.json();
}

async function firebaseWriteProduct(id,payload,method='PUT') {
  const {base,node}=firebaseContext();
  const response=await fetch(`${base}/${node}/${encodeURIComponent(id)}.json`,{method,headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(payload)});
  if (!response.ok) throw new Error(`Firebase ${response.status}`);
  return response.json().catch(()=>null);
}

function urlsFromProduct(product={}) {
  return { art:text(product.arte_horizontal||product.arte_personalizacao||product.arte_impressao?.url||product.art_url||product.arte_url),m1:text(product.mockup_1||product.url_imagem||product.imagem||product.imagens?.[0]),m2:text(product.mockup_2||product.imagens?.[1]),m3:text(product.mockup_3||product.imagens?.[2]) };
}

async function waitFinalProduct(payload,status) {
  const id=text(payload?.request_id);
  if (!id) throw new Error('O Make aceitou a finalização sem código da caneca.');
  const deadline=Date.now()+FINAL_WAIT_MS; const started=Date.now();
  while (Date.now()<deadline) {
    const elapsed=Math.max(1,Math.round((Date.now()-started)/1000));
    if (status) status.textContent=`5/6 · Make aceitou. Aguardando as 4 imagens no Firebase… ${elapsed}s`;
    try {
      const product=await firebaseGetProduct(id);
      const urls=urlsFromProduct(product||{});
      if ([urls.art,urls.m1,urls.m2,urls.m3].every(isHttpUrl)) return {ok:true,action:'finalize_mug_product',request_id:id,product_saved:true,firebase_key:id,arte_horizontal_url:urls.art,mockup_1_url:urls.m1,mockup_2_url:urls.m2,mockup_3_url:urls.m3,async_recovered:true};
    } catch (error) { console.debug('[Produção canecas] aguardando Firebase:',error?.message||error); }
    await sleep(POLL_MS);
  }
  throw new Error('A finalização foi aceita, mas as 4 imagens não apareceram em até 3 minutos. A tela foi liberada; verifique a execução do Make e tente novamente.');
}

async function callMake(hook,payload,{timeout=180000,status=null}={}) {
  if (!isHttpUrl(hook)) throw new Error('Configure o webhook do Make.');
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),timeout);
  try {
    const response=await fetch(hook,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({payload:JSON.stringify({...payload,client_contract:BUILD})}),signal:controller.signal});
    const raw=await response.text();
    let parsed=null; if (raw) { try { parsed=JSON.parse(raw); } catch {} }
    if (parsed) {
      if (!response.ok || parsed.ok===false) throw new Error(parsed.error||parsed.message||`Make respondeu HTTP ${response.status}.`);
      return parsed;
    }
    if (response.ok && /^accepted\.?$/i.test(text(raw)) && payload.action==='finalize_mug_product') {
      clearTimeout(timer);
      return waitFinalProduct(payload,status);
    }
    const snippet=text(raw).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,180);
    throw new Error(snippet?`Make respondeu conteúdo inválido (${response.status}): ${snippet}`:`Make não devolveu JSON (${response.status}).`);
  } catch (error) {
    if (error?.name==='AbortError') throw new Error('O Make ultrapassou 3 minutos. A operação foi encerrada para não deixar o Produção travado.');
    throw error;
  } finally { clearTimeout(timer); }
}

async function analyzeCatalogSoft(hook,id,master) {
  try {
    const result=await callMake(hook,{action:'analyze_mug_product',request_id:id,image_base64:master,prompt_catalog:'Analise somente a arte final. Retorne JSON com tema, nome comercial natural, subcategoria, descrição, tags, seo_title, seo_description, texto_identificado e confianca_tema. Não use comandos técnicos como nome do produto.'},{timeout:90000});
    return parseCatalog(result);
  } catch (error) {
    console.warn('Catalogação visual falhou; criação seguirá normalmente.',error);
    return fallbackCatalog(error?.message||error);
  }
}

function firebaseTemplate(id,instruction,catalog) {
  const now=new Date().toISOString();
  return {
    id,firebaseKey:id,codigo:`CANP-${id.slice(-6).toUpperCase()}`,gtin:'',ean:'',codigo_barras:'',nome:catalog.nome,categoria:MUG_CATEGORY,subcategoria:catalog.subcategoria,tema:catalog.tema,subsubcategoria:'',ncm:MUG_NCM,
    preco_custo:10,preco:MUG_PRICE,estoque:0,situacao:'I',status:'I',ativo:false,visivel:false,modelo_caneca:true,modelo_publico:false,personalizacao_publica:false,
    material:'Porcelana',capacidade:MUG_CAPACITY,embalagem:`Caneca de porcelana ${MUG_CAPACITY}`,unidade:'UN',dimensao_impressao:PRINT_LABEL,descricao:catalog.descricao,tags:catalog.tags,seo_title:catalog.seo_title,seo_description:catalog.seo_description,texto_identificado_arte:catalog.texto_identificado,confianca_tema:catalog.confianca_tema,
    url_imagem:PH.m1,imagem:PH.m1,imagem_url:PH.m1,imagens:[PH.m1,PH.m2,PH.m3],imagens_site:[PH.m1,PH.m2,PH.m3],mockup_1:PH.m1,mockup_2:PH.m2,mockup_3:PH.m3,arte_personalizacao:PH.art,arte_horizontal:PH.art,arte_impressao:{url:PH.art,ratio:`${MASTER_WIDTH}:${MASTER_HEIGHT}`,width:MASTER_WIDTH,height:MASTER_HEIGHT,dimensao_real:PRINT_LABEL,formato:'webp'},midias_admin:[PH.m1,PH.m2,PH.m3,PH.art],video_youtube:'',
    origem_cadastro:'producao_canecas_clean_v15',tipo_produto:'caneca_porcelana',geracao_status:'concluido',geracao_etapa:'firebase_salvo',geracao_versao:BUILD,catalogacao_origem:catalog.source,catalogacao_validada:catalog.source==='ia_visual',
    configuracao_arte:{modo:'imagem_inspiracao',instrucao_complementar:text(instruction),instruction_priority:Boolean(text(instruction)),width:MASTER_WIDTH,height:MASTER_HEIGHT,dimensao_real:PRINT_LABEL,gerador:BUILD},criado_em:now,updated_at:now,last_update:Date.now()
  };
}

function materialize(template,urls) {
  const product=JSON.parse(JSON.stringify(template));
  product.url_imagem=product.imagem=product.imagem_url=product.mockup_1=urls.m1; product.mockup_2=urls.m2; product.mockup_3=urls.m3;
  product.imagens=[urls.m1,urls.m2,urls.m3]; product.imagens_site=[urls.m1,urls.m2,urls.m3]; product.midias_admin=[urls.m1,urls.m2,urls.m3,urls.art];
  product.arte_personalizacao=product.arte_horizontal=urls.art; product.arte_impressao.url=urls.art; product.updated_at=new Date().toISOString(); product.last_update=Date.now();
  return product;
}

async function ensureFinalProduct(id,product,makeSaved) {
  if (!makeSaved) return firebaseWriteProduct(id,product,'PUT');
  return firebaseWriteProduct(id,product,'PATCH');
}

function installStyles() {
  if (document.getElementById('mugCleanV15Styles')) return;
  const style=document.createElement('style'); style.id='mugCleanV15Styles';
  style.textContent=`#mugAutomationPanel.mugv7{display:grid;gap:14px;padding:18px}.mugv7-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.mugv7-head h2{margin:3px 0 5px}.mugv7-head p{margin:0;color:#686c65;max-width:760px}.mugv7-main{display:grid;grid-template-columns:minmax(260px,420px) 1fr;gap:16px;align-items:stretch}.mugv7-upload,.mugv7-info{border:1px solid #e2e4de;border-radius:18px;padding:16px;background:#fff}.mugv7-upload{display:grid;gap:12px}.mugv7-drop{min-height:250px;border:2px dashed #cfd3ca;border-radius:16px;background:#fafbf8;display:grid;place-items:center;overflow:hidden;cursor:pointer;text-align:center;padding:14px}.mugv7-drop img{width:100%;height:100%;max-height:330px;object-fit:contain}.mugv7-drop strong{display:block;font-size:18px}.mugv7-drop small{display:block;margin-top:5px;color:#71756e}.mugv7-instruction{display:grid;gap:6px}.mugv7-instruction textarea{width:100%;box-sizing:border-box;min-height:90px;resize:vertical;border:1px solid #ccd0c8;border-radius:12px;padding:11px;background:#fff;font:inherit}.mugv7-instruction small{color:#6e726b}.mugv7-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.mugv7-status{font-weight:700;line-height:1.35}.mugv7-settings{border-top:1px solid #eceee9;padding-top:10px}.mugv7-settings summary{cursor:pointer;font-weight:700}.mugv7-settings-grid{display:grid;grid-template-columns:2fr 1fr;gap:10px;margin-top:10px}.mugv7-settings input,.mugv7-settings select{width:100%;box-sizing:border-box;border:1px solid #ccd0c8;border-radius:10px;padding:10px;background:#fff}.mugv7-result{display:grid;grid-template-columns:2fr repeat(3,minmax(0,1fr));gap:10px}.mugv7-result figure{margin:0}.mugv7-result img{width:100%;border:1px solid #ddd;border-radius:14px;display:block;background:#f7f7f5}.mugv7-result .art img{aspect-ratio:${MASTER_WIDTH}/${MASTER_HEIGHT};object-fit:contain}.mugv7-result .mock img{aspect-ratio:1;object-fit:contain}.mugv7-result figcaption{font-size:12px;margin-top:5px;color:#666}.mugv15-catalog{grid-column:1/-1;border:1px solid #e1e4dc;border-radius:14px;padding:12px;background:#fbfcf9;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.mugv15-catalog div{font-size:11px}.mugv15-catalog strong{display:block;font-size:10px;text-transform:uppercase;color:#777;margin-bottom:2px}@media(max-width:760px){#mugAutomationPanel.mugv7{padding:10px}.mugv7-main{grid-template-columns:1fr}.mugv7-drop{min-height:200px}.mugv7-info{display:none}.mugv7-settings-grid{grid-template-columns:1fr}.mugv7-result{grid-template-columns:1fr 1fr}.mugv7-result .art{grid-column:1/-1}.mugv7-head .badge{display:none}.mugv15-catalog{grid-template-columns:1fr}}`;
  document.head.appendChild(style);
}

function renderResult(container,urls,catalog) {
  container.innerHTML=`<div class="mugv7-result"><figure class="art"><img src="${escapeHtml(urls.art)}" alt="Arte horizontal"><figcaption>${escapeHtml(catalog.nome)} · ${MASTER_WIDTH}×${MASTER_HEIGHT}px · ${PRINT_LABEL}</figcaption></figure><figure class="mock"><img src="${escapeHtml(urls.m1)}" alt="Mockup lado esquerdo"><figcaption>Mockup · lado esquerdo</figcaption></figure><figure class="mock"><img src="${escapeHtml(urls.m2)}" alt="Mockup lado direito"><figcaption>Mockup · lado direito</figcaption></figure><figure class="mock"><img src="${escapeHtml(urls.m3)}" alt="Mockup centro"><figcaption>Mockup · centro</figcaption></figure><div class="mugv15-catalog"><div><strong>Tema</strong>${escapeHtml(catalog.tema)}</div><div><strong>Subcategoria</strong>${escapeHtml(catalog.subcategoria)}</div><div><strong>Origem do nome</strong>${catalog.source==='ia_visual'?'IA visual':'fallback sem bloqueio'}</div><div><strong>Nome</strong>${escapeHtml(catalog.nome)}</div><div><strong>Tags</strong>${escapeHtml((catalog.tags||[]).join(', '))}</div><div><strong>Descrição</strong>${escapeHtml(catalog.descricao)}</div></div></div>`;
  container.hidden=false;
}

async function generate(panel) {
  if (panel.dataset.generating==='1') return;
  const file=panel.querySelector('#mugv7Image')?.files?.[0];
  const hook=text(panel.querySelector('#mugv7Webhook')?.value)||DEFAULT_MAKE_WEBHOOK;
  const instruction=text(panel.querySelector('#mugv7Instruction')?.value);
  const quality=panel.querySelector('#mugv7Quality')?.value||'high';
  const button=panel.querySelector('#mugv7Generate'); const status=panel.querySelector('#mugAutomationStatus'); const resultBox=panel.querySelector('#mugv7Result');
  if (!file) { status.textContent='Escolha uma imagem de inspiração.'; return; }
  if (!file.type.startsWith('image/')) { status.textContent='O arquivo escolhido não é uma imagem.'; return; }
  panel.dataset.generating='1'; button.disabled=true; resultBox.hidden=true;
  const id=requestId();
  try {
    localStorage.setItem(WEBHOOK_KEY,hook);
    status.textContent='1/6 · Preparando imagem de inspiração...';
    const reference=await normalizeReference(file);
    status.textContent=instruction?'2/6 · Criando arte com os comandos selecionados...':'2/6 · Criando a nova arte...';
    const artResult=await callMake(hook,{action:'generate_mug_art',mode:'create_model',request_id:id,image_base64:reference,instruction,prompt_art:buildArtPrompt(instruction),quality,origin:'producao_canecas_clean_v15'});
    const artSource=text(artResult.art_source_url||artResult.art_url||artResult.result_url||artResult.art_source_base64);
    if (!isImageSource(artSource)) throw new Error('O Make não devolveu uma arte utilizável.');

    status.textContent=`3/6 · Fechando ${MASTER_WIDTH}×${MASTER_HEIGHT} e definindo o cadastro...`;
    const master=await cropMaster(artSource);
    const catalog=await analyzeCatalogSoft(hook,id,master);

    status.textContent='4/6 · Preparando lado esquerdo, direito e centro...';
    const [left,right,center]=await Promise.all([cropReference(master,1),cropReference(master,2),cropReference(master,3)]);
    const template=firebaseTemplate(id,instruction,catalog);
    const {base,node}=firebaseContext();

    status.textContent='5/6 · Gerando os três mockups...';
    const final=await callMake(hook,{action:'finalize_mug_product',request_id:id,image_base64:master,mockup_left_base64:left,mockup_right_base64:right,mockup_center_base64:center,instruction,product_name:catalog.nome,prompt_mockup_1:buildMockupPrompt(1),prompt_mockup_2:buildMockupPrompt(2),prompt_mockup_3:buildMockupPrompt(3),quality:'high',firebase_url:base,products_node:node,firebase_template_json:JSON.stringify(template),origin:'producao_canecas_clean_v15'},{timeout:180000,status});
    const urls={art:text(final.arte_horizontal_url||final.art_url||final.arte_url),m1:text(final.mockup_1_url),m2:text(final.mockup_2_url),m3:text(final.mockup_3_url)};
    if (![urls.art,urls.m1,urls.m2,urls.m3].every(isHttpUrl)) throw new Error('A finalização terminou sem publicar arte + 3 mockups em URLs públicas.');

    status.textContent='6/6 · Confirmando cadastro e imagens no Firebase...';
    const product=materialize(template,urls);
    await ensureFinalProduct(id,product,final.product_saved===true);
    renderResult(resultBox,urls,catalog);
    status.textContent=`Concluído · ${catalog.nome} cadastrada por R$ 24,90 como inativa.`;
    window.dispatchEvent(new CustomEvent('admin-v2-products-invalidated',{detail:{source:BUILD,key:text(final.firebase_key||id)}}));
    window.dispatchEvent(new CustomEvent('da:mug-created',{detail:{source:BUILD,key:text(final.firebase_key||id)}}));
  } catch (error) {
    console.error('Falha no Criador de Canecas limpo:',error);
    status.textContent=`Erro: ${error?.message||error}`;
  } finally {
    panel.dataset.generating='0'; button.disabled=false;
  }
}

function renderPanel(panel) {
  installStyles();
  delete panel.dataset.commandLibraryBuild;
  panel.className='mug-automation-panel mugv7'; panel.dataset.mugController=BUILD;
  panel.innerHTML=`<div class="mugv7-head"><div><span class="eyebrow">Criador de Canecas</span><h2>Arte → cadastro → 3 mockups</h2><p>Um único controlador conduz toda a criação. A catalogação é opcional e nunca interrompe a caneca.</p></div><span class="badge warning">Cadastro inativo</span></div><div class="mugv7-main"><section class="mugv7-upload"><label class="mugv7-drop" for="mugv7Image"><div id="mugv7Empty"><strong>Escolher imagem</strong><small>PNG, JPG ou WEBP · referência visual</small></div><img id="mugv7Preview" alt="Imagem de inspiração" hidden></label><input id="mugv7Image" type="file" accept="image/*" hidden><label class="mugv7-instruction"><strong>Instrução complementar <span class="muted">(opcional)</span></strong><textarea id="mugv7Instruction" maxlength="800" placeholder="Ex.: escreva exatamente ‘Eis-me aqui Senhor.’; use tons de azul..."></textarea><small>Os comandos selecionados e esta instrução servem apenas para criar a arte.</small></label><div class="mugv7-actions"><button class="button primary" id="mugv7Generate" type="button">Gerar caneca</button><button class="button secondary" id="mugv7Clear" type="button">Trocar imagem</button><span id="mugAutomationStatus" class="mugv7-status"></span></div></section><section class="mugv7-info"><h3>Fluxo único</h3><ul><li>cria a arte horizontal;</li><li>fecha em ${MASTER_WIDTH}×${MASTER_HEIGHT}px;</li><li>tenta nomear pela arte sem bloquear;</li><li>prepara 3 vistas;</li><li>gera 3 mockups;</li><li>se o Make responder Accepted, acompanha o Firebase com tempo limite;</li><li>confirma as 4 URLs e salva o produto inativo.</li></ul><details class="mugv7-settings"><summary>Configuração</summary><div class="mugv7-settings-grid"><label>Webhook Make<input id="mugv7Webhook" type="url"></label><label>Qualidade<select id="mugv7Quality"><option value="high" selected>Alta</option><option value="medium">Média</option><option value="low">Teste</option></select></label></div></details></section></div><div id="mugv7Result" hidden></div>`;

  const input=panel.querySelector('#mugv7Image'); const preview=panel.querySelector('#mugv7Preview'); const empty=panel.querySelector('#mugv7Empty'); const webhook=panel.querySelector('#mugv7Webhook');
  webhook.value=localStorage.getItem(WEBHOOK_KEY)||DEFAULT_MAKE_WEBHOOK; localStorage.setItem(WEBHOOK_KEY,webhook.value); webhook.addEventListener('change',()=>localStorage.setItem(WEBHOOK_KEY,text(webhook.value)||DEFAULT_MAKE_WEBHOOK));
  input.addEventListener('change',()=>{ const file=input.files?.[0]; if (!file) { preview.hidden=true; empty.hidden=false; return; } if (!file.type.startsWith('image/')) { input.value=''; return; } preview.src=URL.createObjectURL(file); preview.hidden=false; empty.hidden=true; panel.querySelector('#mugAutomationStatus').textContent=''; });
  panel.querySelector('#mugv7Clear').addEventListener('click',()=>{ if (panel.dataset.generating==='1') return; input.value=''; preview.removeAttribute('src'); preview.hidden=true; empty.hidden=false; panel.querySelector('#mugv7Instruction').value=''; panel.querySelector('#mugv7Result').hidden=true; panel.querySelector('#mugAutomationStatus').textContent=''; });
  panel.querySelector('#mugv7Generate').addEventListener('click',()=>generate(panel));
}

function install() {
  const panel=document.getElementById('mugAutomationPanel');
  if (!panel) return false;
  if (panel.dataset.mugController===BUILD && panel.querySelector('#mugv7Generate')) return true;
  renderPanel(panel); return true;
}

function activate() {
  if (window.adminV2CurrentRoute?.()!=='mug-studio') return;
  if (!install()) setTimeout(activate,80);
}

window.addEventListener('admin-v2-route-ready',event=>{ if (event.detail?.route==='mug-studio') setTimeout(activate,0); });
window.addEventListener('admin-v2-route',event=>{ if (event.detail?.route==='mug-studio') setTimeout(activate,0); });
if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(activate,0),{once:true}); else setTimeout(activate,0);

export { BUILD, install, generate, callMake, waitFinalProduct, cropMaster, normalizeCatalog };
