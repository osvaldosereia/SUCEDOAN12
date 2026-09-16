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
];

if (!existsSync(ADMIN)) fail('Diretório admin/ ausente.');
else {
  for (const file of walk(ADMIN)) {
    const source = readFileSync(file, 'utf8');
    const relative = path.relative(ROOT, file).replace(/\\/g, '/');
    for (const item of forbidden) {
      item.re.lastIndex = 0;
      if (item.re.test(source)) fail(`${relative}: contém ${item.label}`);
    }
  }
}

if (failures.length) {
  console.error('Admin ainda depende do legado V3:');
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log('OK: /admin é independente de referências runtime ao Admin V3.');
