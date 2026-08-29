import { MUG_NODES, text, norm, fbGet, fbWrite, audit, safeKey, nowIso } from '../shared/mug-commerce-v1.js?v=20260828-1';

const BUILD = '20260829-admin-canecas-loja-integrada-export-v1';
const TEMPLATE_VERSION = 'loja-integrada-49-colunas-v1';
const HEADERS = Object.freeze([
  'id','tipo','sku-pai','sku','ativo','usado','destaque','ncm','gtin','mpn','nome','seo-tag-title','seo-tag-description','descricao-completa','url-video-youtube','estoque-gerenciado','estoque-quantidade','estoque-situacao-em-estoque','estoque-situacao-sem-estoque','preco-sob-consulta','preco-custo','preco-cheio','preco-promocional','marca','peso-em-kg','altura-em-cm','largura-em-cm','comprimento-em-cm','categoria-nome-nivel-1','categoria-nome-nivel-2','categoria-nome-nivel-3','categoria-nome-nivel-4','categoria-nome-nivel-5','imagem-1','imagem-2','imagem-3','imagem-4','imagem-5','grade-genero','grade-produto-com-uma-cor','grade-produto-com-duas-cores','grade-tamanho-de-anelalianca','grade-tamanho-de-calca','grade-tamanho-de-camisacamiseta','grade-tamanho-de-capacete','grade-tamanho-de-tenis','grade-voltagem','grade-tamanho-juvenil-infantil','url-antiga'
]);

const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
const selected = new Set();
let products = new Map();
let loadPromise = null;
let loadedAt = 0;

function numberValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = text(value).replace(/\s/g,'');
  if (!raw) return 0;
  const normalized = raw.includes(',') ? raw.replace(/\./g,'').replace(',','.') : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}
function activeProduct(p={}) {
  if (p.ativo === true) return true;
  if (p.ativo === false) return false;
  return ['a','ativo','ativa','active','1','true','s','sim'].includes(norm(p.situacao || p.status || p.ativo));
}
function isMug(p={}) {
  return norm([p.tipo_produto,p.categoria,p.subcategoria,p.subsubcategoria,p.nome].join(' ')).includes('caneca');
}
function stripHtml(value) {
  return text(value).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim();
}
function offerActive(p={}) {
  const price = numberValue(p.preco_oferta || p.preco_promocional);
  if (!(price > 0)) return false;
  const raw = text(p.validade_oferta || p.oferta_validade);
  if (!raw) return true;
  let d;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) d = new Date(raw.split('/').reverse().join('-') + 'T23:59:59');
  else d = new Date(raw.length === 10 ? raw + 'T23:59:59' : raw);
  return Number.isNaN(d.getTime()) || d.getTime() >= Date.now();
}
function productImages(p={}) {
  const arrays = [p.imagens_site,p.imagens,p.fotos,p.images].filter(Array.isArray).flat();
  const values = [p.mockup_1,p.mockup_2,...arrays,p.url_imagem,p.imagem_url,p.imagem].map(v => typeof v === 'object' ? (v?.url || v?.src || '') : v);
  return [...new Set(values.map(text).filter(v => /^https?:\/\//i.test(v)))].slice(0,5);
}
function categoryLevel(p, level) {
  const explicit = p[`lojaintegrada_categoria_${level}`] || p.lojaintegrada?.[`categoria_${level}`];
  if (explicit) return text(explicit);
  const fields = [p.categoria,p.subcategoria,p.subsubcategoria,p.subsubsubcategoria,p.categoria_nivel_5];
  if (fields[level-1]) return text(fields[level-1]);
  if (level === 1) return 'Canecas';
  if (level === 2) {
    if (p.canecafacil_personalizavel === true || p.personalizavel === true || p.personalizacao_publica === true) return 'Personalizáveis';
    return 'Padronizadas';
  }
  return '';
}
function oldUrl(p={}) {
  return text(p.url_antiga || p.lojaintegrada?.url_antiga || '');
}
function rowFor(p={}) {
  const images = productImages(p);
  const description = text(p.descricao_completa || p.descricao_html || p.descricao || p.description);
  const seoDescription = text(p.seo_tag_description || p.seo_description || p.meta_description || p.descricao_seo) || stripHtml(description).slice(0,160);
  const price = numberValue(p.preco || p.price);
  const promo = offerActive(p) ? numberValue(p.preco_oferta || p.preco_promocional) : '';
  return [
    text(p.lojaintegrada?.id || p.lojaintegrada_id),
    'sem-variacao',
    '',
    text(p.codigo || p.sku),
    activeProduct(p) ? 'S' : 'N',
    p.usado === true ? 'S' : 'N',
    (p.destaque === true || p.canecafacil_destaque === true) ? 'S' : 'N',
    text(p.ncm),
    text(p.gtin || p.ean || p.codigo_barras),
    text(p.mpn),
    text(p.nome),
    text(p.seo_tag_title || p.seo_title || p.meta_title) || text(p.nome),
    seoDescription,
    description,
    text(p.url_video_youtube || p.video_youtube || p.youtube_url),
    p.estoque_gerenciado === false ? 'N' : 'S',
    Math.max(0, numberValue(p.estoque || p.stock)),
    text(p.lojaintegrada?.estoque_situacao_em_estoque || p.estoque_situacao_em_estoque) || 'imediata',
    text(p.lojaintegrada?.estoque_situacao_sem_estoque || p.estoque_situacao_sem_estoque) || (p.venda_sem_estoque === true ? 'manter disponibilidade' : 'indisponivel'),
    p.preco_sob_consulta === true ? 'S' : 'N',
    numberValue(p.preco_custo || p.custo) || '',
    price || '',
    promo,
    text(p.marca) || 'CanecaFácil',
    numberValue(p.peso_embalado_kg || p.peso_kg || p.peso) || '',
    numberValue(p.altura_embalada_cm || p.altura_cm || p.altura) || '',
    numberValue(p.largura_embalada_cm || p.largura_cm || p.largura) || '',
    numberValue(p.comprimento_embalado_cm || p.comprimento_cm || p.comprimento) || '',
    categoryLevel(p,1),categoryLevel(p,2),categoryLevel(p,3),categoryLevel(p,4),categoryLevel(p,5),
    images[0] || '',images[1] || '',images[2] || '',images[3] || '',images[4] || '',
    '', '', '', '', '', '', '', '', '', '',
    oldUrl(p)
  ];
}
function validationFor(p={}) {
  const row = rowFor(p), images = productImages(p);
  const errors = [], warnings = [];
  if (!text(row[3])) errors.push('SKU/código');
  if (!text(row[10])) errors.push('nome');
  if (!(numberValue(row[21]) > 0)) errors.push('preço cheio');
  if (!images.length) errors.push('imagem principal');
  if (images.length < 2) warnings.push('segunda imagem/mockup');
  if (!(numberValue(row[24]) > 0)) warnings.push('peso embalado');
  if (!(numberValue(row[25]) > 0) || !(numberValue(row[26]) > 0) || !(numberValue(row[27]) > 0)) warnings.push('dimensões embaladas');
  if (!text(row[28])) warnings.push('categoria');
  if (!text(row[11]) || !text(row[12])) warnings.push('SEO');
  return { errors, warnings };
}
function exportTimestamp(p={}) { return text(p.lojaintegrada?.ultima_planilha_em); }
function productChangedAt(p={}) {
  const v = p.last_update || p.updated_at || p.atualizado_em || 0;
  if (typeof v === 'number') return v;
  const parsed = Date.parse(v);
  return Number.isFinite(parsed) ? parsed : 0;
}
function exportStatus(p={}) {
  const at = exportTimestamp(p);
  if (!at) return ['Não gerada',''];
  const exp = Date.parse(at) || 0;
  if (productChangedAt(p) > exp + 1000) return ['Alterada depois','warn'];
  return ['Planilha gerada','good'];
}
function fastHash(row) {
  const s = JSON.stringify(row);
  let h = 2166136261;
  for (let i=0;i<s.length;i++) { h ^= s.charCodeAt(i); h = Math.imul(h,16777619); }
  return (h >>> 0).toString(16).padStart(8,'0');
}
async function loadProducts(force=false) {
  if (!force && products.size && Date.now()-loadedAt < 30000) return products;
  if (loadPromise) return loadPromise;
  loadPromise = fbGet(MUG_NODES.products).then(data => {
    products = new Map(Object.entries(data || {}).map(([key,value]) => [key,{__key:key,...(value || {})}]).filter(([,p]) => isMug(p)));
    loadedAt = Date.now();
    return products;
  }).finally(() => { loadPromise = null; });
  return loadPromise;
}

function injectStyle() {
  if ($('#liExportStyles')) return;
  const style = document.createElement('style');
  style.id = 'liExportStyles';
  style.textContent = `
    .li-export-bar{margin:0 0 12px;padding:12px 14px;border:1px solid #dfe2dd;border-radius:12px;background:#fafbf9;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
    .li-export-title{display:grid;gap:2px}.li-export-title strong{font-size:12px}.li-export-title small{font-size:10px;color:#6e756d}
    .li-export-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.li-export-count{font-size:10px;color:#6e756d;min-width:90px;text-align:right}
    .li-check-cell{width:38px;text-align:center!important}.li-check-cell input{width:17px;height:17px;cursor:pointer}.li-status{white-space:nowrap}
    .li-export-warning{margin-top:8px;font-size:10px;color:#8a5b19}
    @media(max-width:760px){.li-export-bar{align-items:stretch}.li-export-actions{display:grid;grid-template-columns:1fr 1fr;width:100%}.li-export-count{grid-column:1/-1;text-align:left}.li-export-actions button{min-height:42px}}
  `;
  document.head.appendChild(style);
}
function setCount() {
  const el = $('#liExportCount');
  if (el) el.textContent = `${selected.size} selecionada(s)`;
}
function syncRows() {
  const root = $('#mugs');
  if (!root) return;
  const table = $('table.table',root);
  if (!table) return;
  const headRow = $('thead tr',table);
  if (headRow && !$('[data-li-select-head]',headRow)) {
    headRow.insertAdjacentHTML('afterbegin','<th class="li-check-cell" data-li-select-head><input id="liSelectVisible" type="checkbox" aria-label="Selecionar canecas visíveis"></th>');
    headRow.insertAdjacentHTML('beforeend','<th data-li-status-head>Loja Integrada</th>');
    $('#liSelectVisible',headRow)?.addEventListener('click',e=>e.stopPropagation());
    $('#liSelectVisible',headRow)?.addEventListener('change',e=>{
      $$('tbody tr[data-mug]:not([hidden])',table).forEach(tr=>{const key=tr.dataset.mug;if(e.target.checked)selected.add(key);else selected.delete(key);const c=$('input[data-li-select]',tr);if(c)c.checked=e.target.checked});setCount();
    });
  }
  $$('tbody tr[data-mug]',table).forEach(tr=>{
    const key = tr.dataset.mug;
    const p = products.get(key);
    if (!$('[data-li-select-cell]',tr)) {
      tr.insertAdjacentHTML('afterbegin',`<td class="li-check-cell" data-li-select-cell><input type="checkbox" data-li-select="${esc(key)}" aria-label="Selecionar ${esc(p?.nome || 'caneca')}" ${selected.has(key)?'checked':''}></td>`);
      const box = $('input[data-li-select]',tr);
      box?.addEventListener('click',e=>e.stopPropagation());
      box?.addEventListener('change',e=>{if(e.target.checked)selected.add(key);else selected.delete(key);setCount()});
    }
    if (!$('[data-li-status-cell]',tr)) {
      const [label,klass] = exportStatus(p || {});
      tr.insertAdjacentHTML('beforeend',`<td data-li-status-cell class="li-status"><span class="badge ${klass}">${esc(label)}</span></td>`);
    }
  });
}
async function enhanceMugs() {
  const root = $('#mugs');
  if (!root || !location.hash.includes('mugs')) return;
  injectStyle();
  await loadProducts().catch(()=>{});
  const toolbar = $('.toolbar',root);
  if (toolbar && !$('.li-export-bar',root)) {
    toolbar.insertAdjacentHTML('afterend',`<div class="li-export-bar"><div class="li-export-title"><strong>Loja Integrada · planilha oficial</strong><small>Exportação .xlsx com as 49 colunas na ordem exata do modelo oficial.</small></div><div class="li-export-actions"><button class="secondary" type="button" id="liExportSelected">Baixar selecionadas</button><button class="secondary" type="button" id="liExportActive">Baixar todas ativas</button><span class="li-export-count" id="liExportCount">0 selecionada(s)</span></div></div>`);
    $('#liExportSelected')?.addEventListener('click',()=>exportProducts([...selected]));
    $('#liExportActive')?.addEventListener('click',()=>exportProducts([...products.entries()].filter(([,p])=>activeProduct(p)).map(([key])=>key)));
  }
  syncRows();
  setCount();
}

function xmlEscape(value) { return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;'); }
function columnName(index) { let n=index+1,out=''; while(n){const r=(n-1)%26;out=String.fromCharCode(65+r)+out;n=Math.floor((n-1)/26)} return out; }
function sheetXml(rows) {
  const body = rows.map((row,ri)=>`<row r="${ri+1}">${row.map((value,ci)=>{
    const ref=`${columnName(ci)}${ri+1}`;
    if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
  }).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}
const CRC_TABLE = (()=>{const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xEDB88320^(c>>>1):c>>>1;table[n]=c>>>0}return table})();
function crc32(bytes){let c=0xFFFFFFFF;for(const b of bytes)c=CRC_TABLE[(c^b)&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0}
function u16(v){return new Uint8Array([v&255,(v>>>8)&255])}
function u32(v){return new Uint8Array([v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255])}
function concat(parts){const total=parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(total);let at=0;for(const p of parts){out.set(p,at);at+=p.length}return out}
function dosDateTime(date=new Date()){const year=Math.max(1980,date.getFullYear());return {time:((date.getHours()&31)<<11)|((date.getMinutes()&63)<<5)|((Math.floor(date.getSeconds()/2))&31),date:(((year-1980)&127)<<9)|(((date.getMonth()+1)&15)<<5)|(date.getDate()&31)}}
function zipStore(files){
  const enc=new TextEncoder(),local=[],central=[];let offset=0;const dt=dosDateTime();
  for(const file of files){
    const name=enc.encode(file.name),data=typeof file.data==='string'?enc.encode(file.data):file.data,crc=crc32(data);
    const lh=concat([u32(0x04034b50),u16(20),u16(0x0800),u16(0),u16(dt.time),u16(dt.date),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data]);
    local.push(lh);
    central.push(concat([u32(0x02014b50),u16(20),u16(20),u16(0x0800),u16(0),u16(dt.time),u16(dt.date),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]));
    offset+=lh.length;
  }
  const cd=concat(central),body=concat(local),end=concat([u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(cd.length),u32(body.length),u16(0)]);
  return concat([body,cd,end]);
}
function xlsxBlob(dataRows){
  const rows=[HEADERS,...dataRows];
  const files=[
    {name:'[Content_Types].xml',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'},
    {name:'_rels/.rels',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
    {name:'xl/workbook.xml',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'},
    {name:'xl/_rels/workbook.xml.rels',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'},
    {name:'xl/worksheets/sheet1.xml',data:sheetXml(rows)}
  ];
  return new Blob([zipStore(files)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
function download(blob,filename){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)}
function dateStamp(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
async function exportProducts(keys){
  await loadProducts(true).catch(e=>{alert(`Não foi possível carregar as canecas: ${e.message||e}`)});
  const unique=[...new Set(keys)].filter(key=>products.has(key));
  if(!unique.length){alert('Selecione ao menos uma caneca para gerar a planilha.');return}
  const checked=unique.map(key=>({key,p:products.get(key),...validationFor(products.get(key))}));
  const invalid=checked.filter(x=>x.errors.length),valid=checked.filter(x=>!x.errors.length);
  if(!valid.length){alert(`Nenhuma caneca está pronta para exportar.\n\n${invalid.slice(0,8).map(x=>`• ${x.p.nome||x.key}: ${x.errors.join(', ')}`).join('\n')}`);return}
  if(invalid.length){const ok=confirm(`${invalid.length} caneca(s) possuem campos críticos e serão ignoradas.\n${valid.length} caneca(s) estão prontas.\n\nContinuar e gerar somente as prontas?`);if(!ok)return}
  const warnings=valid.filter(x=>x.warnings.length);
  if(warnings.length){const ok=confirm(`${warnings.length} caneca(s) possuem avisos não bloqueantes (ex.: segunda imagem, frete ou SEO).\n\nA planilha ainda é válida. Deseja continuar?`);if(!ok)return}
  const rows=valid.map(x=>rowFor(x.p));
  if(rows.some(r=>r.length!==HEADERS.length))throw new Error('Mapeamento Loja Integrada inválido: número de colunas divergente.');
  const filename=`canecafacil-lojaintegrada-${dateStamp()}.xlsx`;
  download(xlsxBlob(rows),filename);
  const exportedAt=nowIso();
  await Promise.all(valid.map(async x=>{
    const row=rowFor(x.p);
    const path=`${MUG_NODES.products}/${safeKey(x.key)}/lojaintegrada`;
    await fbWrite(path,{...(x.p.lojaintegrada||{}),ultima_planilha_em:exportedAt,ultima_planilha_arquivo:filename,ultima_planilha_fingerprint:fastHash(row),template:TEMPLATE_VERSION});
    x.p.lojaintegrada={...(x.p.lojaintegrada||{}),ultima_planilha_em:exportedAt,ultima_planilha_arquivo:filename,ultima_planilha_fingerprint:fastHash(row),template:TEMPLATE_VERSION};
  })).catch(()=>{});
  await audit('lojaintegrada_planilha_gerada',{arquivo:filename,quantidade:valid.length,ignoradas:invalid.length,template:TEMPLATE_VERSION}).catch(()=>{});
  selected.clear();
  await enhanceMugs();
  alert(`Planilha gerada com ${valid.length} caneca(s).${invalid.length?`\n${invalid.length} produto(s) com erro foram ignorados.`:''}${warnings.length?`\n${warnings.length} produto(s) têm avisos para revisão.`:''}`);
}

function boot(){
  const root=$('#mugs');if(!root)return;
  new MutationObserver(()=>queueMicrotask(enhanceMugs)).observe(root,{childList:true,subtree:true});
  window.addEventListener('hashchange',()=>{if(location.hash.includes('mugs')){loadProducts(true).finally(()=>setTimeout(enhanceMugs,0))}});
  if(location.hash.includes('mugs'))setTimeout(enhanceMugs,0);
  document.documentElement.dataset.liExportBuild=BUILD;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
