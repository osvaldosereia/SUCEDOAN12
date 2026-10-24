import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const source = resolve('src');
const failures = [];
const modules = [];
function collect(folder) {
  for (const item of readdirSync(folder, { withFileTypes: true })) {
    const full = join(folder, item.name);
    if (item.isDirectory()) collect(full);
    else if (/\.(tsx?|css)$/.test(item.name)) modules.push(full);
  }
}
collect(source);
const forbiddenDirectIntegrations =
  /\b(?:createClient|SupabaseClient)\s*\(|https:\/\/api\.bling\.com\.br|\.supabase\.co\/rest\//;
for (const file of modules) {
  const name = relative(source, file).split(sep).join('/');
  const data = readFileSync(file, 'utf8');
  const lines = data.split('\n').length;
  if (file.endsWith('.tsx') && lines > 320)
    failures.push(name + ': componente com ' + lines + ' linhas (limite: 320)');
  if (file.endsWith('.css') && Buffer.byteLength(data, 'utf8') > 11500)
    failures.push(name + ': CSS com mais de 11,5 KB (separar por módulo)');
  const publicView =
    name === 'Storefront.tsx' || name.startsWith('features/') || name.startsWith('ui/');
  if (
    publicView &&
    /(?:^|from\s*['"][^'"]*)\/server\/|privateBasketAdjustmentCents|private_adjustment_cents/m.test(
      data,
    )
  ) {
    failures.push(name + ': valor interno do carrinho ou código server-only alcançando a vitrine');
  }
  if ((publicView || name.startsWith('admin/')) && forbiddenDirectIntegrations.test(data)) {
    failures.push(name + ': integração direta em componente; usar adaptador + backend');
  }
}
if (!modules.length) failures.push('Nenhum módulo localizado');
if (failures.length) {
  console.error('Violações de arquitetura:\n' + failures.map((x) => ' - ' + x).join('\n'));
  process.exit(1);
}
console.log(
  'Arquitetura verificada: ' +
    modules.length +
    ' arquivos isolados; componentes, preços privados e integrações protegidos.',
);
