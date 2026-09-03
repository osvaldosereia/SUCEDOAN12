const FIREBASE = (process.env.FIREBASE_BASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/$/, '');
const SKU = String(process.env.DIAG_SKU || 'CANP-QZ11RD').trim();

const text = value => String(value ?? '').trim();
const norm = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

async function get(path) {
  const response = await fetch(`${FIREBASE}/${path}.json`, { headers: { Accept: 'application/json' } });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
  if (!response.ok) throw new Error(`Firebase ${path}: ${response.status} ${raw}`);
  return data;
}

function liMeta(p = {}) {
  return p.loja_integrada && typeof p.loja_integrada === 'object' ? p.loja_integrada : {};
}
function categoryType(p = {}) {
  const direct = text(p.loja_integrada_categoria_tipo || liMeta(p).categoria_tipo || p.canecafacil_categoria_tipo);
  if (['padronizadas','personalizaveis','empresas'].includes(direct)) return direct;
  const personal = p.personalizavel === true || p.loja_integrada_personalizavel === true || p.canecafacil_personalizavel === true || p.personalizacao_publica === true;
  return personal ? 'personalizaveis' : 'padronizadas';
}

const [products, refs] = await Promise.all([
  get('produtos'),
  get('canecas/integracoes/loja_integrada/catalog_refs'),
]);

const entries = Object.entries(products || {}).filter(([, p]) => p && norm(p.codigo || p.sku) === norm(SKU));
if (!entries.length) throw new Error(`SKU ${SKU} não encontrado no Firebase.`);
if (entries.length > 1) throw new Error(`SKU ${SKU} aparece ${entries.length} vezes no Firebase.`);

const [firebaseKey, product] = entries[0];
const li = liMeta(product);
const type = categoryType(product);
const mapping = refs?.tipos?.[type] || null;

const report = {
  sku: SKU,
  firebase_key: firebaseKey,
  nome: text(product.nome),
  personalizavel: product.personalizavel === true || product.loja_integrada_personalizavel === true || product.canecafacil_personalizavel === true || product.personalizacao_publica === true,
  categoria_tipo_calculado: type,
  categoria_tipo_salvo: text(product.loja_integrada_categoria_tipo || li.categoria_tipo || product.canecafacil_categoria_tipo),
  categoria_uri_produto: text(product.loja_integrada_categoria_uri || li.categoria_uri),
  categoria_nome_produto: text(product.loja_integrada_categoria_nome || li.categoria_nome),
  produto_id_li: text(li.produto_id || product.loja_integrada_product_id),
  catalog_mapping: mapping ? {
    resolvido: mapping.resolvido !== false,
    id: text(mapping.id),
    nome: text(mapping.nome),
    resource_uri: text(mapping.resource_uri),
    origem: text(mapping.origem),
    atualizado_em: text(mapping.atualizado_em),
  } : null,
  catalog_via: text(refs?.via),
  catalog_fonte: text(refs?.fonte),
  catalog_atualizado_em: text(refs?.atualizado_em),
  total_categorias: Number(refs?.total_categorias || 0),
};

console.log(`CATEGORY DIAG · ${JSON.stringify(report)}`);
if (!mapping || mapping.resolvido === false || !text(mapping.resource_uri)) {
  throw new Error(`Categoria ${type} não está resolvida no catálogo GitHub.`);
}
console.log(`CATEGORY DIAG · RESOLVIDO · ${type} -> ${text(mapping.nome)} -> ${text(mapping.resource_uri)} · origem=${text(mapping.origem)}`);
console.log('CATEGORY DIAG · somente leitura · Make não utilizado.');
