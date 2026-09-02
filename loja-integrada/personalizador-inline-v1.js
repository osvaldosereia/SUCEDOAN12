(() => {
  'use strict';

  const BUILD='20260902-li-personalizador-inline-v1-readonly';
  const FIREBASE='https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const MAKE_WEBHOOK='https://hook.eu1.make.com/cl3r1f56r9txezvltkkwlsspmnja6sw4';
  const TEST_PARAM = 'cf_personalizador';
  const TEST_VALUE = 'teste';

  if(window.__CF_LI_PERSONALIZADOR_INLINE__===BUILD)return;
  window.__CF_LI_PERSONALIZADOR_INLINE__=BUILD;
  const params=new URLSearchParams(location.search);
  if(params.get(TEST_PARAM)!==TEST_VALUE)return;

  const text=v=>String(v??'').trim();
  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  const defs={
    nome: ['text','Nome',80],
    foto: ['image','Foto',0],
    logo: ['image','Logo',0],
    endereco: ['text','Endereço',180],
    telefone: ['text','Telefone',40],
    site: ['text','Site',120]
  };
  let product=null,config=null;

  function skuFromPage(){
    for(const selector of ['[itemprop="sku"]','[data-sku]','.codigo-produto','.produto-codigo','.sku','[class*="codigo"]']){
      const el=document.querySelector(selector);
      const raw=text(el?.getAttribute?.('content')||el?.dataset?.sku||el?.textContent);
      const cleaned=raw.replace(/^.*?(?:c[oó]digo|sku)\s*[:#-]?\s*/i,'').trim();
      if(/^[A-Za-z0-9._-]{3,40}$/.test(cleaned))return cleaned;
    }
    return '';
  }

  async function fetchJson(url){
    const response=await fetch(url,{cache:'no-store',headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function findProduct(){
    const sku=skuFromPage();
    if(!sku)throw new Error('Não consegui identificar o SKU desta página.');
    const url=new URL(`${FIREBASE}/produtos.json`);
    url.searchParams.set('orderBy',JSON.stringify('codigo'));
    url.searchParams.set('equalTo',JSON.stringify(sku));
    const data=await fetchJson(url);
    const rows=Object.entries(data||{}).map(([key,value])=>({__key:key,...(value||{})}));
    if(rows.length!==1)throw new Error(rows.length?'SKU duplicado no cadastro.':`SKU ${sku} não localizado.`);
    return rows[0];
  }

  function normalizeConfig(p={}){
    const raw=p.personalizacao&&typeof p.personalizacao==='object'?p.personalizacao:{};
    const campos=[];
    for(const [id,[tipo,rotulo,max]] of Object.entries(defs)){
      const item=raw.campos?.[id]||{};
      if(item.ativo!==true)continue;
      campos.push({id,tipo,rotulo:text(item.rotulo)||rotulo,max,obrigatorio:item.obrigatorio===true});
    }
    return {ativa:raw.ativa===true,campos,prompt_base_texto:text(raw.prompt_base_texto),prompt_especifico:text(raw.prompt_especifico)};
  }

  function modelArt(p={}){return text(p.arte_horizontal||p.arte_personalizacao||p.arte_impressao?.url||p.arte_final_url);}
  function fileToDataUrl(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(text(r.result));r.onerror=()=>reject(new Error('Não foi possível ler a imagem.'));r.readAsDataURL(file);});}
  async function urlToDataUrl(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error('Não foi possível carregar a arte-base.');return fileToDataUrl(await r.blob());}

  function buildPrompt(values={},files={}){
    const allowed=config.campos.map(f=>`${f.id} (${f.rotulo})`);
    const data=[];
    for(const field of config.campos){
      if(field.tipo==='image'&&files[field.id])data.push(`${field.rotulo}: arquivo enviado pelo cliente.`);
      else if(text(values[field.id]))data.push(`${field.rotulo}: ${text(values[field.id])}`);
    }
    return [
      'REGRA OBRIGATÓRIA: altere exclusivamente os elementos autorizados abaixo.',
      'Preserve integralmente todos os elementos não autorizados.',
      `ELEMENTOS AUTORIZADOS: ${allowed.join(', ')}.`,
      config.prompt_base_texto?`INSTRUÇÃO PADRÃO:\n${config.prompt_base_texto}`:'',
      config.prompt_especifico?`INSTRUÇÃO ESPECÍFICA:\n${config.prompt_especifico}`:'',
      data.length?`DADOS DO CLIENTE:\n${data.join('\n')}`:''
    ].filter(Boolean).join('\n\n');
  }

  function style(){
    if(document.getElementById('cfInlinePersonalizerStyles'))return;
    const node=document.createElement('style');node.id='cfInlinePersonalizerStyles';node.textContent=`
      #cfInlinePersonalizer{margin:16px 0;border:1px solid #e4e6df;border-radius:14px;background:#fff;overflow:hidden;font-family:Arial,sans-serif}
      #cfInlinePersonalizer *{box-sizing:border-box}.cfip-head,.cfip-body{padding:14px 16px}.cfip-head{background:#fafbf8;border-bottom:1px solid #eceee8}
      .cfip-test{display:inline-block;margin-bottom:7px;padding:4px 8px;border-radius:999px;background:#fff3cd;color:#785b00;font-size:10px;font-weight:800}.cfip-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .cfip-field{font-size:12px;font-weight:700}.cfip-field input{display:block;width:100%;margin-top:5px;padding:10px;border:1px solid #ddd;border-radius:8px}.cfip-field.wide{grid-column:1/-1}
      .cfip-actions{display:flex;gap:8px;margin-top:12px}.cfip-primary,.cfip-secondary{min-height:42px;padding:10px 13px;border:0;border-radius:8px;font-weight:800}.cfip-primary{background:#191c19;color:#fff;flex:1}.cfip-secondary{background:#eee}
      .cfip-status{margin-top:10px;padding:9px;background:#f6f7f4;border-radius:8px;font-size:12px}.cfip-result{margin-top:12px}.cfip-result img{width:100%;border-radius:10px}
      @media(max-width:680px){.cfip-grid{grid-template-columns:1fr}.cfip-field.wide{grid-column:auto}}
    `;document.head.appendChild(node);
  }

  function fieldHtml(field){
    const required=field.obrigatorio?'required':'';
    if(field.tipo==='image')return `<label class="cfip-field">${esc(field.rotulo)}<input data-cf-field="${esc(field.id)}" type="file" accept="image/png,image/jpeg,image/webp" ${required}></label>`;
    return `<label class="cfip-field">${esc(field.rotulo)}<input data-cf-field="${esc(field.id)}" type="text" maxlength="${field.max||180}" ${required}></label>`;
  }

  function render(){
    style();
    const panel=document.createElement('section');panel.id='cfInlinePersonalizer';
    panel.innerHTML=`<div class="cfip-head"><span class="cfip-test">HOMOLOGAÇÃO · SOMENTE COM ?cf_personalizador=teste</span><strong>Personalize esta caneca</strong></div><div class="cfip-body"><form id="cfipForm"><div class="cfip-grid">${config.campos.map(fieldHtml).join('')}</div><div class="cfip-actions"><button class="cfip-primary" type="submit">GERAR MINHA ARTE</button></div><div class="cfip-status" id="cfipStatus">Homologação segura: nenhuma criação ou compra é gravada.</div></form><div class="cfip-result" id="cfipResult" hidden><img id="cfipResultImage" alt="Arte gerada"><strong>Sua arte ficou pronta</strong><div class="cfip-actions"><button class="cfip-secondary" id="cfipAgain" type="button">ALTERAR / GERAR NOVAMENTE</button><button class="cfip-primary" type="button" disabled>APROVAR E COMPRAR · EM BREVE</button></div></div></div>`;
    const buy=document.querySelector('.acoes-produto .comprar, .acoes-produto [class*="comprar"]');
    const anchor=buy?.closest('.comprar')||buy;
    if(anchor?.parentNode)anchor.parentNode.insertBefore(panel,anchor);else(document.querySelector('main')||document.body).appendChild(panel);
    panel.querySelector('#cfipForm').addEventListener('submit',generate);
    panel.querySelector('#cfipAgain').addEventListener('click',()=>{panel.querySelector('#cfipResult').hidden=true;panel.querySelector('#cfipForm').hidden=false;});
  }

  async function generate(event){
    event.preventDefault();
    const form=event.currentTarget;if(!form.reportValidity())return;
    const values={},files={},attachments=[];
    for(const input of form.querySelectorAll('[data-cf-field]')){
      const id=input.dataset.cfField;
      if(input.type==='file'){
        const file=input.files?.[0];if(file){files[id]=true;attachments.push({field_id:id,image_base64:await fileToDataUrl(file)});}
      }else if(text(input.value))values[id]=text(input.value);
    }
    const officialArt=await urlToDataUrl(modelArt(product));
    const prompt=buildPrompt(values,files);
    const status=form.querySelector('#cfipStatus');status.textContent='Gerando prévia de homologação…';
    const response=await fetch(MAKE_WEBHOOK,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({payload:JSON.stringify({action:'personalize_mug_model',mode:'loja_integrada_inline',model_id:product.__key,fields_json:JSON.stringify(values),images_json:JSON.stringify(attachments),image_base64:attachments[0]?.image_base64||officialArt,prompt_art:prompt})})});
    const raw=await response.text();let data={};try{data=raw?JSON.parse(raw):{};}catch{}
    const source=text(data.art_source_url||data.art_url||data.result_url||data.arte_horizontal_url);
    if(!response.ok||!/^https?:\/\//i.test(source))throw new Error('A homologação não recebeu uma arte válida.');
    document.querySelector('#cfipResultImage').src=source;document.querySelector('#cfipResult').hidden=false;form.hidden=true;
  }

  async function init(){
    try{product=await findProduct();config=normalizeConfig(product);if(!config.ativa||!config.campos.length)return;render();}
    catch(error){console.error('[CanecaFácil homologação inline]',error);}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
