import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const failures = [];
const read = relative => {
  const file = path.join(ROOT, relative);
  if (!existsSync(file)) {
    failures.push(`Arquivo ausente: ${relative}`);
    return '';
  }
  return readFileSync(file, 'utf8');
};
const requireText = (source, marker, message) => { if (!source.includes(marker)) failures.push(message); };
const forbidText = (source, marker, message) => { if (source.includes(marker)) failures.push(message); };

const html = read('caneca-print/index.html');
const bat = read('caneca-print/abrir-caneca-print.bat');
const sync = read('scripts/sync-canecas-cache.mjs');
const workflow = read('.github/workflows/sync-canecas-cache.yml');
const snapshot = read('site/canecas-print.json');

requireText(html, "DATA_URL='../site/canecas-print.json'", 'Caneca Print não mantém snapshot de fallback.');
requireText(html, "const FIREBASE_BASE='https://cedar-chemist-310801-default-rtdb.firebaseio.com'", 'Caneca Print não possui fonte ao vivo do Firebase.');
requireText(html, "live.searchParams.set('orderBy',JSON.stringify('categoria'))", 'Consulta ao vivo não está ordenada por categoria.');
requireText(html, "live.searchParams.set('equalTo',JSON.stringify('Canecas'))", 'Consulta ao vivo não está limitada à categoria Canecas.');
requireText(html, "fetch(liveUrl(),{cache:'no-store'", 'Fonte ao vivo não força dados frescos.');
requireText(html, 'state.rows=await fetchSnapshot()', 'Snapshot do GitHub não funciona como fallback.');
requireText(html, '@page{size:98mm 247mm;margin:0}', 'Folha de impressão não está fixada em 98 × 247 mm.');
requireText(html, 'width:230mm!important;height:92mm!important', 'Arte não está limitada à área segura 230 × 92 mm.');
requireText(html, 'rotate(90deg) scaleX(-1)', 'Arte não é rotacionada e espelhada para sublimação.');
requireText(html, 'window.print();', 'Botão de impressão não dispara a impressão do navegador.');
requireText(html, 'r.mockup_1', 'Interface não mostra mockup 1.');
requireText(html, 'r.mockup_2', 'Interface não mostra mockup 2.');
requireText(html, 'r.arte_horizontal', 'Interface não mostra a arte horizontal.');
forbidText(html, "fetch(`${FIREBASE_BASE}/produtos.json`", 'Caneca Print baixa o nó inteiro de produtos em vez da categoria Canecas.');
forbidText(html, 'Date.now()', 'Caneca Print invalida o cache a cada abertura.');

requireText(bat, '--kiosk-printing', 'Atalho do Windows não habilita impressão silenciosa do Chrome.');
requireText(bat, 'https://donaantonia.com.br/caneca-print/?kiosk=1', 'Atalho não abre a rota oficial do Caneca Print.');

requireText(sync, "writeFile('site/canecas-print.json'", 'Sincronização não gera o snapshot de impressão.');
requireText(sync, 'arte_horizontal: horizontal', 'Snapshot não contém a arte horizontal.');
requireText(sync, 'mockup_1: mockup1', 'Snapshot não contém mockup 1.');
requireText(sync, 'mockup_2: mockup2', 'Snapshot não contém mockup 2.');
requireText(sync, 'return Object.fromEntries(rows);', 'Snapshot de impressão ainda parece limitado por paginação artificial.');
requireText(workflow, 'site/canecas-print.json', 'Workflow não publica o snapshot de impressão.');

try { JSON.parse(snapshot || '{}'); }
catch (error) { failures.push(`Snapshot inicial inválido: ${error.message}`); }

if (failures.length) {
  console.error(`Caneca Print: ${failures.length} falha(s).`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exitCode = 1;
} else {
  console.log('Caneca Print validado: Firebase ao vivo filtrado por Canecas + snapshot fallback, 3 imagens, impressão 98×247 mm, arte 230×92 mm, rotação/espelhamento e Chrome kiosk-printing.');
}
