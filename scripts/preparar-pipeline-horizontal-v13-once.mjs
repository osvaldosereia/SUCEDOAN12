import fs from 'node:fs';

function mustReplace(source, oldText, newText, label) {
  if (!source.includes(oldText)) throw new Error(`Trecho não encontrado: ${label}`);
  return source.replace(oldText, newText);
}

// --- Personalizador V13 preparado, ainda sem trocar o index público ---
const appSource = 'loja-integrada/personalizar/app.js';
const appTarget = 'loja-integrada/personalizar/app-v13.js';
let app = fs.readFileSync(appSource, 'utf8');
app = app.replace("const BUILD = '20260901-loja-integrada-personalizador-v4-native-cart';", "const BUILD = '20260901-loja-integrada-personalizador-v5-horizontal-2-crops';");
app = mustReplace(app,
`  return {
    active: raw.ativa !== false,
    required: raw.ativa === true && raw.obrigatoria === true,
    fields,
    version: Number(raw.config_version || 0) || 0,
  };`,
`  return {
    active: raw.ativa !== false,
    required: raw.ativa === true && raw.obrigatoria === true,
    fields,
    version: Number(raw.config_version || 0) || 0,
    promptBaseId: text(raw.prompt_base_id || p.personalizacao_prompt_base),
    promptBaseText: text(raw.prompt_base_texto),
    promptSpecific: text(raw.prompt_especifico || p.personalizacao_prompt_especifico),
  };`,
'normalizeConfig prompt');

const cropBlock = `function loadPreviewImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível preparar a prévia da arte personalizada.'));
    image.src = source;
  });
}
function cropCanvasDataUrl(image, sx, sw, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d', { alpha:false });
  if (!ctx) throw new Error('O navegador não conseguiu preparar os recortes da arte.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, sx, 0, sw, height, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', 0.9);
}
async function createTwoCrops(source) {
  const image = await loadPreviewImage(source);
  const width = Number(image.naturalWidth || image.width || 0);
  const height = Number(image.naturalHeight || image.height || 0);
  if (!width || !height) throw new Error('A arte personalizada não possui dimensões válidas.');
  const half = Math.floor(width / 2);
  return {
    left: cropCanvasDataUrl(image, 0, half, height),
    right: cropCanvasDataUrl(image, half, width - half, height),
  };
}
`;
app = mustReplace(app, 'async function collectCustomerValues() {', `${cropBlock}\nasync function collectCustomerValues() {`, 'crop helpers');

app = mustReplace(app,
`      config_version: config.version,
      campos_liberados: config.fields.map(field => ({ id:field.id, rotulo:field.label, tipo:field.type, obrigatorio:field.required }))`,
`      config_version: config.version,
      prompt_base_id: config.promptBaseId,
      prompt_base_texto: config.promptBaseText,
      prompt_especifico: config.promptSpecific,
      campos_liberados: config.fields.map(field => ({ id:field.id, rotulo:field.label, tipo:field.type, obrigatorio:field.required }))`,
'persist snapshot prompt');

const start = app.indexOf('function temporaryProductPayload(code) {');
const end = app.indexOf('\nasync function createTemporaryProduct(code) {', start);
if (start < 0 || end < 0) throw new Error('Bloco temporaryProductPayload não encontrado.');
const replacementPayload = `function temporaryProductPayload(code, crops) {
  const sku = tempSku(code);
  const alias = slug(\`caneca-personalizada-\${code}\`);
  const li = product?.loja_integrada && typeof product.loja_integrada === 'object' ? product.loja_integrada : {};
  if (!text(crops?.left) || !text(crops?.right)) throw new Error('Os dois recortes da arte personalizada não ficaram prontos.');

  const productBody = {
    id_externo: null,
    sku,
    mpn: null,
    ncm: digits(product?.ncm || '69111090') || '69111090',
    gtin: null,
    nome: \`Caneca personalizada · \${text(product?.nome || 'Caneca Fácil')}\`.slice(0,140),
    apelido: alias,
    descricao_completa: \`Caneca personalizada reservada. Código técnico: \${code}. A arte permanece protegida no sistema CanecaFácil.\`,
    ativo: true,
    bloqueado: false,
    destaque: false,
    peso: num(product?.peso_embalado_kg || product?.peso) || 0.45,
    altura: Math.ceil(num(product?.altura_embalada_cm || product?.altura)) || 14,
    largura: Math.ceil(num(product?.largura_embalada_cm || product?.largura)) || 14,
    profundidade: Math.ceil(num(product?.comprimento_embalado_cm || product?.comprimento)) || 14,
    tipo: 'normal',
    usado: false,
    categorias: text(li.categoria_uri) ? [text(li.categoria_uri)] : [],
    marca: text(li.marca_uri) || null,
    removido: false,
    url_video_youtube: null,
  };
  const priceBody = {
    cheio: num(product?.preco) || 19.9,
    custo: num(product?.preco_custo || product?.custo) || 0,
    sob_consulta: false,
    promocional: num(product?.preco_oferta || product?.preco_promocional) || 0,
  };
  const stockBody = { gerenciado:false, quantidade:0, situacao_em_estoque:0, situacao_sem_estoque:0 };
  const seoBody = {
    title: 'Caneca personalizada | Caneca Fácil',
    keyword: '',
    description: 'Item personalizado reservado para conclusão da compra na Caneca Fácil.'
  };
  return {
    action: 'loja_integrada_create_personalized_product',
    request_id: \`LI-TEMP-\${Date.now().toString(36).toUpperCase()}\`,
    product_key: safeKey(code),
    model_id: modelId,
    firebase_url: FIREBASE,
    products_node: CREATIONS_NODE,
    produto_json: JSON.stringify(productBody),
    preco_json: JSON.stringify(priceBody),
    estoque_json: JSON.stringify(stockBody),
    seo_json: JSON.stringify(seoBody),
    alias_json: JSON.stringify({ absolute_path:\`/\${alias}\` }),
    crop_left_base64: crops.left,
    crop_right_base64: crops.right,
    personalizavel: false,
    ativo_loja: true,
    sku,
    source: BUILD,
  };
}`;
app = app.slice(0, start) + replacementPayload + app.slice(end);

app = app.replace('async function createTemporaryProduct(code) {', 'async function createTemporaryProduct(code, crops) {');
app = app.replace('  const payload = temporaryProductPayload(code);', '  const payload = temporaryProductPayload(code, crops);');
app = app.replace("      instruction:'',\n      prompt_art:'Personalize fielmente a arte oficial do modelo usando somente os campos liberados no cadastro privado. Preserve integralmente o restante da composição.',",
`      instruction:config.promptSpecific,
      prompt_art:[config.promptBaseText, config.promptSpecific].filter(Boolean).join('\\n\\n') || 'Personalize fielmente a arte oficial do modelo usando somente os campos liberados no cadastro privado. Preserve integralmente o restante da composição.',`);
app = mustReplace(app,
`    const code = creationCode();
    await persistCreation(code, source, fields, images);
    const tempProductId = await createTemporaryProduct(code);
    goToCart(tempProductId, code);`,
`    setProgress('Arte pronta', 'Preparando as duas imagens da sua personalização…');
    const crops = await createTwoCrops(source);
    const code = creationCode();
    await persistCreation(code, source, fields, images);
    const tempProductId = await createTemporaryProduct(code, crops);
    goToCart(tempProductId, code);`,
'geração para carrinho');
fs.writeFileSync(appTarget, app);

// --- Processador V13 de vitrine: arte horizontal + 2 recortes, sem mockups ---
const cropSource = 'scripts/processar-vitrine-canecas.mjs';
const cropTarget = 'scripts/processar-vitrine-canecas-v13.mjs';
let crops = fs.readFileSync(cropSource, 'utf8');
crops = crops.replace("const VERSION = 'github-sharp-v2';", "const VERSION = 'github-sharp-v3-two-crops';");
crops = crops.replace("function cropsOf(p = {}) { return { left:text(p.vitrine_recorte_esquerda || p.vitrine_recortes?.esquerda), center:text(p.vitrine_recorte_centro || p.vitrine_recortes?.centro), right:text(p.vitrine_recorte_direita || p.vitrine_recortes?.direita) }; }", "function cropsOf(p = {}) { return { left:text(p.vitrine_recorte_esquerda || p.vitrine_recortes?.esquerda), right:text(p.vitrine_recorte_direita || p.vitrine_recortes?.direita) }; }");
crops = crops.replace("function cropReady(p = {}) { const c=cropsOf(p), art=artOf(p), source=text(p.vitrine_recortes?.source_art || p.vitrine_recortes?.arte_origem); return Boolean(art && source===art && isHttp(c.left) && isHttp(c.center) && isHttp(c.right)); }", "function cropReady(p = {}) { const c=cropsOf(p), art=artOf(p), source=text(p.vitrine_recortes?.source_art || p.vitrine_recortes?.arte_origem); return Boolean(art && source===art && isHttp(c.left) && isHttp(c.right)); }");
crops = crops.replace("function sourceReady(p = {}) { return isHttp(p.mockup_1) && isHttp(p.mockup_2) && isHttp(artOf(p)); }", "function sourceReady(p = {}) { return isHttp(artOf(p)); }");
crops = crops.replace("  const leftW=Math.floor(width/2), rightW=width-leftW, square=Math.min(height,width), centerX=Math.max(0,Math.floor((width-square)/2));", "  const leftW=Math.floor(width/2), rightW=width-leftW;");
crops = crops.replace("  const center=await sharp(buffer,{failOn:'none'}).rotate().extract({left:centerX,top:0,width:square,height:square}).webp(opts).toBuffer();\n", '');
crops = crops.replace("  return {left,center,right,meta:{width,height,leftW,rightW,square,centerX}};", "  return {left,right,meta:{width,height,leftW,rightW}};");
crops = crops.replace("    const files={left:`${nameSlug}-vista-esquerda.webp`,center:`${nameSlug}-vista-centro.webp`,right:`${nameSlug}-vista-direita.webp`};", "    const files={left:`${nameSlug}-vista-esquerda.webp`,right:`${nameSlug}-vista-direita.webp`};");
crops = crops.replace("      await Promise.all([fs.writeFile(path.join(dirAbs,files.left),crops.left),fs.writeFile(path.join(dirAbs,files.center),crops.center),fs.writeFile(path.join(dirAbs,files.right),crops.right)]);", "      await Promise.all([fs.writeFile(path.join(dirAbs,files.left),crops.left),fs.writeFile(path.join(dirAbs,files.right),crops.right)]);");
crops = crops.replace("      pending.push({key,art,mockup_1:text(p.mockup_1),mockup_2:text(p.mockup_2),urls,meta:crops.meta,nome:text(p.nome)});", "      pending.push({key,art,urls,meta:crops.meta,nome:text(p.nome)});");
crops = crops.replace("      const checks=await Promise.all([urlExists(item.urls.left),urlExists(item.urls.center),urlExists(item.urls.right)]);", "      const checks=await Promise.all([urlExists(item.urls.left),urlExists(item.urls.right)]);");
crops = crops.replace("        vitrine_recorte_centro:item.urls.center,\n", '');
crops = crops.replace("        imagens_canecafacil:[item.mockup_2,item.mockup_1,item.urls.left,item.urls.right,item.urls.center],", "        imagens_canecafacil:[item.urls.left,item.urls.right],");
crops = crops.replace("        vitrine_recortes:{versao:VERSION,status:'pronto',source_art:item.art,esquerda:item.urls.left,centro:item.urls.center,direita:item.urls.right,source_width:item.meta.width,source_height:item.meta.height,left_width:item.meta.leftW,center_width:item.meta.square,right_width:item.meta.rightW,atualizado_em:now},", "        vitrine_recortes:{versao:VERSION,status:'pronto',source_art:item.art,esquerda:item.urls.left,direita:item.urls.right,source_width:item.meta.width,source_height:item.meta.height,left_width:item.meta.leftW,right_width:item.meta.rightW,atualizado_em:now},");
fs.writeFileSync(cropTarget, crops);

console.log('Pipeline V13 preparado: app-v13.js + processar-vitrine-canecas-v13.mjs');
