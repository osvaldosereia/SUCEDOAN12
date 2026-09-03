const FIREBASE = (process.env.FIREBASE_BASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/$/, '');
const text = value => String(value ?? '').trim();
const norm = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const categoryId = value => {
  if (value && typeof value === 'object' && text(value.id)) return text(value.id);
  const uri = typeof value === 'object' ? text(value?.resource_uri || value?.uri) : text(value);
  return uri.match(/\/categoria\/(\d+)/i)?.[1] || '';
};
async function get(path) {
  const response = await fetch(`${FIREBASE}/${path}.json`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Firebase ${response.status}`);
  return (await response.json()) || {};
}
function liMeta(p = {}) { return p.loja_integrada && typeof p.loja_integrada === 'object' ? p.loja_integrada : {}; }
function typeOf(p = {}) {
  const direct = text(p.loja_integrada_categoria_tipo || liMeta(p).categoria_tipo || p.canecafacil_categoria_tipo);
  if (direct) return direct;
  const personal = p.personalizavel === true || p.loja_integrada_personalizavel === true || p.canecafacil_personalizavel === true || p.personalizacao_publica === true;
  return personal ? 'personalizaveis' : 'padronizadas';
}
function exactCategory(p = {}) {
  const meta = liMeta(p);
  return {
    id: text(p.loja_integrada_categoria_id || meta.categoria_id) || categoryId(p.loja_integrada_categoria_uri || meta.categoria_uri),
    nome: text(p.loja_integrada_categoria_nome || meta.categoria_nome),
    uri: text(p.loja_integrada_categoria_uri || meta.categoria_uri),
  };
}

const [products, refs] = await Promise.all([get('produtos'), get('canecas/integracoes/loja_integrada/catalog_refs')]);
const categories = Object.values(refs?.categorias_lista || {}).filter(item => item && item.ativo !== false && text(item.nome));
const counts = new Map();
const unresolved = [];
const empresaRows = [];
let linked = 0;
let exact = 0;

for (const [key, p] of Object.entries(products || {})) {
  if (!p || typeof p !== 'object') continue;
  const type = typeOf(p);
  counts.set(type, (counts.get(type) || 0) + 1);
  const linkedId = text(liMeta(p).produto_id || p.loja_integrada_product_id);
  if (linkedId) linked += 1;
  const cat = exactCategory(p);
  if (cat.id || cat.uri || cat.nome) exact += 1;
  const mapped = refs?.tipos?.[type];
  const hasExact = Boolean(cat.id || cat.uri || cat.nome);
  if (type === 'empresas') {
    empresaRows.push({ key, sku: text(p.codigo || p.sku), nome: text(p.nome), linked: Boolean(linkedId), ...cat });
  }
  if (linkedId && !hasExact && (!mapped || mapped.resolvido === false || !text(mapped.resource_uri))) {
    unresolved.push({ key, sku: text(p.codigo || p.sku), nome: text(p.nome), type });
  }
}

console.log(`TYPE AUDIT · produtos=${Object.keys(products || {}).length} · vinculados_li=${linked} · com_categoria_exata=${exact} · catalogo=${categories.length}`);
for (const [type, count] of [...counts.entries()].sort((a,b) => a[0].localeCompare(b[0]))) {
  const mapping = refs?.tipos?.[type];
  const mapText = mapping?.resolvido !== false && text(mapping?.resource_uri)
    ? `${text(mapping.nome)} id=${categoryId(mapping) || categoryId(mapping.resource_uri)}`
    : 'sem mapeamento lógico';
  console.log(`TIPO · ${type} · produtos=${count} · ${mapText}`);
}
console.log(`EMPRESAS · produtos=${empresaRows.length} · vinculados=${empresaRows.filter(x => x.linked).length} · com_categoria_exata=${empresaRows.filter(x => x.id || x.uri || x.nome).length}`);
for (const row of empresaRows.slice(0, 20)) {
  console.log(`EMPRESA ITEM · ${row.sku || row.key} · linked=${row.linked} · categoria=${row.nome || '(vazia)'} · id=${row.id || '(vazio)'}`);
}
console.log(`RISCO · vinculados sem categoria exata e sem fallback resolvido=${unresolved.length}`);
for (const row of unresolved.slice(0, 20)) console.log(`RISCO ITEM · ${row.sku || row.key} · tipo=${row.type} · ${row.nome}`);

const possibleBusiness = categories.filter(item => /empresa|corporativ|brinde|negocio|negócio|b2b/i.test(norm(item.nome)));
console.log(`CATALOGO · candidatos semânticos para empresas=${possibleBusiness.length}`);
for (const item of possibleBusiness) console.log(`CATALOGO EMPRESA? · ${item.nome} · id=${categoryId(item)} · ${text(item.resource_uri)}`);
console.log('TYPE AUDIT · somente leitura · Make não utilizado.');
