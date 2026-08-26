import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const failures = [];
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const need = (source, token, message) => { if (!source.includes(token)) failures.push(message); };

const files = [
  'app-next/src/mug-public-personalization-v2.js',
  'app-next/src/catalog.js',
  'app-next/src/config.js',
  'ceneca10/app-v3.js',
  'ceneca10/gallery-v4.js',
  'ceneca10/gallery-refresh-v5.js',
  'producao-v2/js/mug-make-client-guard-v14.js',
  'producao/catalog-sync-admin.js',
  'scripts/sincronizar-produtos-home-firebase.mjs',
  'scripts/estabilizar-catalogo-publico.mjs',
  'scripts/filtrar-produtos-home-publicos.mjs'
];
for (const file of files) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding:'utf8' });
  if (check.status !== 0) failures.push(`${file}: ${check.stderr || check.stdout}`);
}

const publicClient = read('app-next/src/mug-public-personalization-v2.js');
need(publicClient, 'isImageSource', 'Site público não aceita arte intermediária genérica.');
need(publicClient, 'data:image', 'Site público não aceita arte Base64 da V9.5.');
need(publicClient, "action:'personalize_mug_model'", 'Site público não chama personalize_mug_model.');
need(publicClient, "action:'finalize_mug_product'", 'Site público não finaliza a caneca.');
need(publicClient, 'isHttpUrl(urls.art)', 'Site público não exige URL pública no resultado final.');

const mobileIndex = read('ceneca10/index.html');
const mobile = read('ceneca10/app-v3.js');
need(mobileIndex, 'app-v3.js?v=20260826-6', 'Caneca10 não carrega controlador V3.');
need(mobile, 'isImageSource', 'Caneca10 não aceita arte Base64 intermediária.');
need(mobile, "action:'finalize_mug_product'", 'Caneca10 não finaliza 3 mockups.');
need(mobile, "ceneca10:mug-created", 'Caneca10 não avisa a galeria após criar.');
need(read('ceneca10/gallery-refresh-v5.js'), '#createdRefresh', 'Histórico não atualiza após geração.');

const catalog = read('app-next/src/catalog.js');
need(catalog, 'isPublicMugModel', 'Catálogo do navegador não reconhece modelo público de caneca.');
need(catalog, 'raw.mockup_1', 'Catálogo do navegador não considera mockup_1.');
need(catalog, 'raw.imagens_site', 'Catálogo do navegador não considera imagens_site.');

const sync = read('scripts/sincronizar-produtos-home-firebase.mjs');
need(sync, 'isPublicMugModel', 'Sincronizador Firebase não reconhece modelo público de caneca.');
need(sync, 'produto_sob_encomenda', 'Sincronizador não marca caneca sob encomenda.');
need(sync, 'mockup_3', 'Sincronizador não preserva os 3 mockups.');

const stabilizer = read('scripts/estabilizar-catalogo-publico.mjs');
need(stabilizer, "situacao: madeToOrder ? 'A'", 'Estabilizador não torna modelo sob encomenda disponível no catálogo derivado.');
need(stabilizer, 'Math.max(1, integer(product.estoque))', 'Estabilizador não dá disponibilidade virtual ao modelo sob encomenda.');
need(stabilizer, 'modelo_publico', 'Estabilizador remove flag modelo_publico.');
need(stabilizer, 'arte_horizontal', 'Estabilizador remove arte horizontal.');

// Simula exatamente um modelo público inativo/estoque 0 e um produto comum inativo.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mug-v15-'));
const home = path.join(tmp, 'produtos-home.json');
const admin = path.join(tmp, 'produtos-admin.json');
const version = path.join(tmp, 'catalog-version.json');
const mediaBase = 'https://raw.githubusercontent.com/osvaldosereia/SUCEDOAN12/canecas-media/canecas/imagens/mockups/2026-08-26';
const fixture = {
  'mug-publica': {
    id:'mug-publica', nome:'Caneca Modelo Público', categoria:'Caneca de Porcelana', preco:29.9,
    estoque:0, situacao:'I', ativo:false, visivel:false, modelo_caneca:true, modelo_publico:true, personalizacao_publica:true,
    mockup_1:`${mediaBase}/m1.webp`, mockup_2:`${mediaBase}/m2.webp`, mockup_3:`${mediaBase}/m3.webp`,
    arte_horizontal:'https://raw.githubusercontent.com/osvaldosereia/SUCEDOAN12/canecas-media/canecas/imagens/artes-geradas/2026-08-26/a.webp'
  },
  'produto-comum': { id:'produto-comum', nome:'Produto comum', categoria:'Outros', preco:10, estoque:0, situacao:'I', ativo:false }
};
fs.writeFileSync(home, JSON.stringify(fixture));
fs.writeFileSync(admin, JSON.stringify(fixture));
fs.writeFileSync(version, '{}');
let run = spawnSync(process.execPath, ['scripts/estabilizar-catalogo-publico.mjs'], {
  cwd:root, encoding:'utf8', env:{ ...process.env, PRODUCTS_HOME_PATH:home, PRODUCTS_ADMIN_PATH:admin, CATALOG_VERSION_PATH:version }
});
if (run.status !== 0) failures.push(`Estabilizador falhou no fixture: ${run.stderr || run.stdout}`);
const stabilized = JSON.parse(fs.readFileSync(home, 'utf8'));
const mug = stabilized['mug-publica'];
if (!mug) failures.push('Modelo público sumiu no estabilizador.');
else {
  if (mug.situacao !== 'A') failures.push(`Modelo público deveria sair como A, saiu ${mug.situacao}.`);
  if (Number(mug.estoque) < 1) failures.push('Modelo público deveria ter disponibilidade virtual >=1.');
  if (mug.modelo_publico !== true || mug.personalizacao_publica !== true) failures.push('Flags públicas não foram preservadas.');
  if (!Array.isArray(mug.imagens) || mug.imagens.length !== 3) failures.push('Os três mockups não foram preservados.');
  if (!String(mug.url_imagem || '').includes('/canecas-media/')) failures.push('URL da imagem não preservou a branch canecas-media.');
  if (!String(mug.arte_horizontal || '').includes('/canecas-media/')) failures.push('Arte horizontal não preservou a branch canecas-media.');
}

// O filtro pós-ofertas não pode remover o modelo público, mas deve remover o produto comum indisponível.
fs.writeFileSync(home, JSON.stringify(fixture));
fs.writeFileSync(version, '{}');
run = spawnSync(process.execPath, ['scripts/filtrar-produtos-home-publicos.mjs'], {
  cwd:root, encoding:'utf8', env:{ ...process.env, PRODUCTS_HOME_PATH:home, CATALOG_VERSION_PATH:version }
});
if (run.status !== 0) failures.push(`Filtro pós-ofertas falhou no fixture: ${run.stderr || run.stdout}`);
const filtered = JSON.parse(fs.readFileSync(home, 'utf8'));
if (!filtered['mug-publica']) failures.push('Filtro pós-ofertas removeu modelo público de caneca com estoque 0.');
if (filtered['produto-comum']) failures.push('Filtro pós-ofertas manteve produto comum inativo/sem estoque.');

fs.rmSync(tmp, { recursive:true, force:true });

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Canecas V15 OK: Base64 intermediário, 4 URLs finais, catálogo sob encomenda, 3 mockups, arte horizontal e atualização mobile validados.');
