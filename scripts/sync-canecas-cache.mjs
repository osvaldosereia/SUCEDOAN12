import { writeFile } from 'node:fs/promises';

const FIREBASE = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';

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

function normalizeMugs(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const normalize = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const rows = Object.entries(data)
    .filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value))
    .filter(([, value]) => normalize(value.categoria) === 'canecas'
      || normalize(value.tipo_produto).includes('caneca')
      || normalize(value.origem_cadastro).includes('caneca'))
    .map(([key, value]) => {
      const firebaseKey = text(value.firebaseKey || value.id || value.codigo || key);
      return [firebaseKey, {
        firebaseKey,
        id: text(value.id || firebaseKey),
        codigo: text(value.codigo || value.sku || value.id || firebaseKey),
        nome: text(value.nome || value.titulo || 'Caneca'),
        categoria: text(value.categoria || 'Canecas'),
        subcategoria: text(value.subcategoria),
        tipo_produto: text(value.tipo_produto),
        origem_cadastro: text(value.origem_cadastro),
        situacao: text(value.situacao || value.status || 'I'),
        ativo: value.ativo,
        mockup_1: text(value.mockup_1),
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

  rows.sort(([, a], [, b]) => {
    const at = Number(a.last_update || a.timestamp || Date.parse(a.updated_at || a.criado_em || a.created_at || '') || 0);
    const bt = Number(b.last_update || b.timestamp || Date.parse(b.updated_at || b.criado_em || b.created_at || '') || 0);
    return bt - at;
  });
  return Object.fromEntries(rows.slice(0, 120));
}

const commands = normalizeCommands(await fetchJson(`${FIREBASE}/canecas/comandos_criacao.json`));

const mugUrl = new URL(`${FIREBASE}/produtos.json`);
mugUrl.searchParams.set('orderBy', JSON.stringify('categoria'));
mugUrl.searchParams.set('equalTo', JSON.stringify('Canecas'));
mugUrl.searchParams.set('limitToLast', '200');
let mugs;
try {
  mugs = normalizeMugs(await fetchJson(mugUrl.href));
} catch (error) {
  console.warn('Consulta indexada de canecas falhou; usando leitura completa somente no GitHub Actions.', error.message);
  mugs = normalizeMugs(await fetchJson(`${FIREBASE}/produtos.json`, 30000));
}

await writeFile('site/canecas-comandos.json', `${JSON.stringify(commands, null, 2)}\n`, 'utf8');
await writeFile('site/canecas-galeria.json', `${JSON.stringify(mugs, null, 2)}\n`, 'utf8');

console.log(`Snapshots atualizados: ${Object.keys(commands).length} comando(s) e ${Object.keys(mugs).length} caneca(s).`);
