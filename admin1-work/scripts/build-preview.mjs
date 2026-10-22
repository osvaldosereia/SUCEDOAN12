import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = projectRoot;
const output = path.join(projectRoot, 'dist');

await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, 'admin1'), { recursive: true });
const publicOutput = path.join(output, 'admin1');
await mkdir(path.join(publicOutput, 'src'), { recursive: true });
await cp(path.join(source, 'index.html'), path.join(publicOutput, 'index.html'));
await cp(path.join(source, 'styles.css'), path.join(publicOutput, 'styles.css'));
for (const file of ['admin1-data.js','api.js','app.js','baskets.js','product-availability.js','product-drafts.js','product-images.js','product-management.js','product-workspace.js','products.js','public-api.js']) await cp(path.join(source, 'src', file), path.join(publicOutput, 'src', file));
await writeFile(path.join(output, 'index.html'), `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>Admin1 · Dona Antônia</title></head><body><p>Abrindo o painel de produtos…</p><script>location.replace('/admin1/')</script><a href="/admin1/">Abrir o Admin1</a></body></html>\n`);
console.log('Prévia Admin1 gerada em dist/.');
