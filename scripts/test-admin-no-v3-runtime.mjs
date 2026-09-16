import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ADMIN = path.join(ROOT, 'admin');
const failures = [];

function fail(message) {
  failures.push(message);
}

function walk(directory) {
  const out = [];
  for (const name of readdirSync(directory)) {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(?:html|js|css)$/i.test(name)) out.push(full);
  }
  return out;
}

const requiredPages = [
  'admin/index.html',
  'admin/imagens-ia.html',
  'admin/pedidos.html',
  'admin/inteligencia.html',
  'admin/aprendizados.html',
  'admin/whatsapp-flow-key.html',
  'admin/atendimento.html',
  'admin/nomes-produtos.html',
];

for (const relative of requiredPages) {
  if (!existsSync(path.join(ROOT, relative))) fail(`Página obrigatória ausente: ${relative}`);
}

const forbidden = [
  { label: 'rota absoluta /admin-v3/', re: /\/admin-v3\//g },
  { label: 'rota relativa ../admin-v3/', re: /\.\.\/admin-v3\//g },
  { label: 'config DA_ADMIN_V3_CONFIG', re: /DA_ADMIN_V3_CONFIG/g },
  { label: 'sessão da_admin_v3_auth', re: /da_admin_v3_auth/g },
  { label: 'rótulo visual Admin V3', re: /Admin V3/g },
  { label: 'caminho inválido .../', re: /\.\.\.\//g },
];

function checkLocalTarget(file, relative, target) {
  const clean = target.split(/[?#]/, 1)[0];
  if (!clean || clean === '.' || clean === './' || clean.startsWith('#')) return;
  if (!/^\.\//.test(clean)) return;
  if (!/\.(?:html|js|css)$/i.test(clean)) return;
  const resolved = path.resolve(path.dirname(file), clean);
  if (!existsSync(resolved)) fail(`${relative}: referência local ausente: ${target}`);
}

if (!existsSync(ADMIN)) fail('Diretório admin/ ausente.');
else {
  for (const file of walk(ADMIN)) {
    const source = readFileSync(file, 'utf8');
    const relative = path.relative(ROOT, file).replace(/\\/g, '/');
    for (const item of forbidden) {
      item.re.lastIndex = 0;
      if (item.re.test(source)) fail(`${relative}: contém ${item.label}`);
    }

    if (/\.html$/i.test(file)) {
      for (const match of source.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
        checkLocalTarget(file, relative, match[1]);
      }
      for (const match of source.matchAll(/import\(["']([^"']+)["']\)/g)) {
        checkLocalTarget(file, relative, match[1]);
      }
    }
  }
}

const namesPath = path.join(ROOT, 'admin/nomes-produtos.html');
if (existsSync(namesPath)) {
  const names = readFileSync(namesPath, 'utf8');
  for (const marker of ['normalizationFilterForm', 'reviewList', 'runNow', 'historyList']) {
    if (!names.includes(marker)) fail(`admin/nomes-produtos.html: tela real ausente (${marker})`);
  }
  if (/http-equiv=["']refresh["'][^>]*nomes-produtos\.html/i.test(names) || /location\.replace\(['"]\.\/nomes-produtos\.html['"]\)/.test(names)) {
    fail('admin/nomes-produtos.html: redireciona para ela mesma');
  }
}

const servicePath = path.join(ROOT, 'admin/atendimento.html');
if (existsSync(servicePath)) {
  const service = readFileSync(servicePath, 'utf8');
  for (const marker of ['strategyApp', 'tabFlow', 'tabRules', 'tabTest']) {
    if (!service.includes(marker)) fail(`admin/atendimento.html: tela ativa incompleta (${marker})`);
  }
}

if (failures.length) {
  console.error('Admin ainda não está independente e íntegro:');
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log('OK: /admin não depende do Admin V3, referências locais existem e as subpáginas ativas estão íntegras.');
