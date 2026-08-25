import { writeFile } from 'node:fs/promises';

const FIREBASE = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
const PRINT_CATEGORY_NAMES = ['Caneca de Porcelana', 'Canecas de Porcelana'];

async function fetchJson(url, timeout = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(`${url} retornou ${response.status}: ${await response.text().catch(() => '')}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function text(value) {
  return String(value ?? '').trim();
}

function normalized(value) {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function isMug(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && (normalized(value.categoria).includes('caneca')
      || normalized(value.tipo_produto).includes('caneca')
      || normalized(value.origem_cadastro).includes('caneca'));
}

function isActive(value) {
  if (value?.ativo === true) return true;
  if (value?.ativo === false) return false;
  const raw = normalized(value?.situacao || value?.status || value?.ativo);
  return ['a', 'ativo', 'ativa', 'active', '1', 'true'].includes(raw);
}

function isPrintableMug(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && PRINT_CATEGORY_NAMES.some(category => normalized(value.categoria) === normalized(category))
    && isActive(value);
}

function firstUrl(...values) {
  for (const value of values.flat(Infinity)) {
    const url = text(value);
    if (/^https?:\/\//i.test(url)) return url;
  }
  return '';
}

function artUrl(value) {
  const print = value?.arte_impressao;
  return firstUrl(
    value?.arte_horizontal,
    value?.arte_personalizacao,
    print && typeof print === 'object' ? print.url : print,
    Array.isArray(value?.midias_admin) ? value.midias_admin[3] : '',
    Array.isArray(value?.midias_admin) ? value.midias_admin[2] : '',
  );
}

function timestampOf(value) {
  return Number(value?.last_update || value?.timestamp || Date.parse(value?.updated_at || value?.criado_em || value?.created_at || '') || 0);
}

function normalizeCommands(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  return Object.fromEntries(Object.entries(data)
    .filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value))
    .map(([key, value]) => {
      const id = text(value.id || key);
      return [id, {
        id,
        nome: text(value.nome),
        texto: text(value.texto),
        iniciar_ativo: value.iniciar_ativo === true,
        criado_em: text(value.criado_em),
        atualizado_em: text(value.atualizado_em),
      }];
    })
    .filter(([, value]) => value.id && value.nome && value.texto));
}

function mugRows(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  return Object.entries(data)
    .filter(([, value]) => isMug(value))
    .map(([key, value]) => [key, value])
    .sort(([, a], [, b]) => timestampOf(b) - timestampOf(a));
}

function normalizeMugs(data) {
  const rows = mugRows(data).map(([key, value]) => {
    const firebaseKey = text(value.firebaseKey || value.id || value.codigo || key);
    return [firebaseKey, {
      firebaseKey,
      id: text(value.id || firebaseKey),
      codigo: text(value.codigo || value.sku || value.id || firebaseKey),
      nome: text(value.nome || value.titulo || 'Caneca'),
      categoria: text(value.categoria || 'Caneca de Porcelana'),
      subcategoria: text(value.subcategoria),
      tipo_produto: text(value.tipo_produto),
      origem_cadastro: text(value.origem_cadastro),
      situacao: text(value.situacao || value.status || 'I'),
      ativo: value.ativo,
      mockup_1: text(value.mockup_1),
      mockup_2: text(value.mockup_2),
      mockup_3: text(value.mockup_3),
      url_imagem: text(value.url_imagem),
      imagem_url: text(value.imagem_url),
      imagem: text(value.imagem),
      imagens_site: Array.isArray(value.imagens_site) ? value.imagens_site.slice(0, 3) : [],
      imagens: Array.isArray(value.imagens) ? value.imagens.slice(0, 3) : [],
      last_update: value.last_update || 0,
      timestamp: value.timestamp || 0,
      updated_at: text(value.updated_at),
      criado_em: text(value.criado_em),
      created_at: text(value.created_at),
    }];
  });
  return Object.fromEntries(rows.slice(0, 120));
}

function normalizePrintMugs(data) {
  const rows = mugRows(data)
    .filter(([, value]) => isPrintableMug(value))
    .map(([key, value]) => {
      const firebaseKey = text(value.firebaseKey || value.id || value.codigo || key);
      const siteImages = Array.isArray(value.imagens_site) ? value.imagens_site : [];
      const images = Array.isArray(value.imagens) ? value.imagens : [];
      const adminMedia = Array.isArray(value.midias_admin) ? value.midias_admin : [];
      const mockup1 = firstUrl(value.mockup_1, value.url_imagem, value.imagem_url, value.imagem, siteImages[0], images[0], adminMedia[0]);
      const mockup2 = firstUrl(value.mockup_2, siteImages[1], images[1], adminMedia[1]);
      const mockup3 = firstUrl(value.mockup_3, siteImages[2], images[2], adminMedia.length >= 4 ? adminMedia[2] : '');
      const horizontal = artUrl(value);
      return [firebaseKey, {
        firebaseKey,
        id: text(value.id || firebaseKey),
        codigo: text(value.codigo || value.sku || value.id || firebaseKey),
        nome: text(value.nome || value.titulo || 'Caneca'),
        categoria: text(value.categoria),
        subcategoria: text(value.subcategoria),
        situacao: text(value.situacao || value.status),
        ativo: true,
        mockup_1: mockup1,
        mockup_2: mockup2,
        mockup_3: mockup3,
        arte_horizontal: horizontal,
        dimensao_impressao: text(value.dimensao_impressao || value?.arte_impressao?.dimensao_real || '24 × 9,5 cm'),
        last_update: timestampOf(value),
        updated_at: text(value.updated_at || value.criado_em || value.created_at),
        pronto_impressao: Boolean(horizontal),
      }];
    });
  return Object.fromEntries(rows);
}

const commands = normalizeCommands(await fetchJson(`${FIREBASE}/canecas/comandos_criacao.json`));

async function fetchMugCategories() {
  const merged = {};
  for (const category of ['Caneca de Porcelana', 'Canecas de Porcelana', 'Canecas']) {
    const mugUrl = new URL(`${FIREBASE}/produtos.json`);
    mugUrl.searchParams.set('orderBy', JSON.stringify('categoria'));
    mugUrl.searchParams.set('equalTo', JSON.stringify(category));
    const data = await fetchJson(mugUrl.href, 30000);
    if (data && typeof data === 'object') Object.assign(merged, data);
  }
  return merged;
}

let mugSource;
try {
  mugSource = await fetchMugCategories();
} catch (error) {
  console.warn('Consulta indexada de canecas falhou; usando leitura completa somente no GitHub Actions.', error.message);
  mugSource = await fetchJson(`${FIREBASE}/produtos.json`, 30000);
}

const mugs = normalizeMugs(mugSource);
const printMugs = normalizePrintMugs(mugSource);

await writeFile('site/canecas-comandos.json', `${JSON.stringify(commands, null, 2)}\n`, 'utf8');
await writeFile('site/canecas-galeria.json', `${JSON.stringify(mugs, null, 2)}\n`, 'utf8');
await writeFile('site/canecas-print.json', `${JSON.stringify(printMugs, null, 2)}\n`, 'utf8');

console.log(`Snapshots atualizados: ${Object.keys(commands).length} comando(s), ${Object.keys(mugs).length} caneca(s) na galeria e ${Object.keys(printMugs).length} caneca(s) ativa(s) da categoria Caneca de Porcelana (com compatibilidade legada) para impressão.`);
