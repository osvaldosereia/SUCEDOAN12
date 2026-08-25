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
requireText(html, "const CATEGORY='Caneca de Porcelana'", 'Caneca Print não fixa a categoria oficial Caneca de Porcelana.');
requireText(html, "const CATEGORY_LEGACY='Canecas de Porcelana'", 'Caneca Print não preserva leitura da categoria legada.');
requireText(html, "function isCanecasCategory(value){return CATEGORIES.some(category=>norm(value?.categoria)===norm(category));}", 'Filtro não aceita categoria oficial e legada.');
requireText(html, 'function isActive(value)', 'Caneca Print não valida o status ativo.');
requireText(html, 'function allowed(value){return isCanecasCategory(value)&&isActive(value);}', 'Categoria e status não são aplicados juntos.');
requireText(html, "live.searchParams.set('orderBy',JSON.stringify('categoria'))", 'Consulta ao vivo não está ordenada por categoria.');
requireText(html, "live.searchParams.set('equalTo',JSON.stringify(category))", 'Consulta ao vivo não recebe a categoria individualmente.');
requireText(html, "Promise.all(CATEGORIES.map(async category=>", 'Caneca Print não consulta categoria oficial e legada em paralelo.');
requireText(html, ".filter(value=>value&&typeof value==='object'&&allowed(value))", 'Fallback do GitHub não elimina canecas inativas ou de outra categoria.');
requireText(html, 'state.rows=await fetchSnapshot()', 'Snapshot do GitHub não funciona como fallback.');
requireText(html, '@page{size:106mm 247mm;margin:0}', 'Folha de impressão não está fixada em 106 × 247 mm.');
requireText(html, '.print-viewport{position:absolute!important;left:0!important;top:6mm!important;width:106mm!important;height:235mm!important', 'Viewport físico não está contido em uma única folha 106 × 247 mm.');
requireText(html, 'left:53mm!important;top:117.5mm!important;width:235mm!important;height:106mm!important', 'Arte não está em 235 × 106 mm e centralizada dentro do viewport de impressão.');
requireText(html, 'object-fit:cover!important;object-position:center center!important', 'Arte não preenche a área de 235 × 106 mm preservando o centro.');
requireText(html, 'contain:strict!important', 'Layout de impressão não isola o conteúdo para impedir paginação extra.');
requireText(html, 'break-after:avoid!important;page-break-after:avoid!important', 'Layout não bloqueia quebra de página após a folha de impressão.');
requireText(html, 'rotate(90deg) scaleX(-1)', 'Arte não é rotacionada e espelhada para sublimação.');
requireText(html, '<div class="print-viewport"><div class="print-art-box">', 'Arte não está dentro do viewport físico de página única.');
requireText(html, 'window.print();', 'Botão de impressão não dispara a impressão do navegador.');
requireText(html, 'r.mockup_1', 'Interface não mostra mockup 1.');
requireText(html, 'r.mockup_2', 'Interface não mostra mockup 2.');
requireText(html, 'r.mockup_3', 'Interface não mostra mockup 3 central.');
requireText(html, 'r.arte_horizontal', 'Interface não mostra a arte horizontal.');
requireText(html, 'data-download-mockups', 'Cada card não possui o botão para baixar os três mockups.');
requireText(html, 'BAIXAR 3 IMAGENS', 'Botão de download dos mockups não está identificado corretamente.');
requireText(html, 'const hasAllMockups=mockupUrls(r).length===3;', 'Botão de download não valida a presença dos três mockups.');
requireText(html, "${hasAllMockups?'':'disabled'}", 'Botão não fica ativo automaticamente quando os três mockups existem.');
requireText(html, "if(download){downloadMockups(state.rows.find(r=>r.firebaseKey===download.dataset.downloadMockups),download);return;}", 'Clique do botão não chama a rotina de download dos três mockups.');
requireText(html, 'files.forEach((file,index)=>setTimeout(()=>saveBlob(file.blob,file.name),index*180))', 'Os três mockups não são baixados como arquivos individuais.');
requireText(html, '${base}-mockup-${index+1}', 'Arquivos individuais não recebem nomes distintos por mockup.');
forbidText(html, "const CATEGORY='Canecas';", 'Caneca Print ainda usa a categoria antiga Canecas.');
forbidText(html, 'application/zip', 'Caneca Print voltou a compactar os mockups em ZIP.');
forbidText(html, 'buildZip(', 'Caneca Print ainda contém gerador de ZIP para os mockups.');
forbidText(html, 'PREPARANDO ZIP', 'Interface ainda indica criação de ZIP.');
forbidText(html, '@page{size:98mm 247mm;margin:0}', 'Caneca Print ainda contém o tamanho antigo de papel 98 × 247 mm.');
forbidText(html, 'width:98mm!important;height:235mm!important', 'Caneca Print ainda contém viewport de 98 mm.');
forbidText(html, 'width:235mm!important;height:100mm!important', 'Caneca Print ainda contém a antiga arte 235 × 100 mm.');
forbidText(html, 'width:230mm!important;height:92mm!important', 'Caneca Print ainda contém a antiga área segura 230 × 92 mm.');
forbidText(html, "fetch(`${FIREBASE_BASE}/produtos.json`", 'Caneca Print baixa o nó inteiro de produtos em vez da categoria filtrada.');
forbidText(html, 'Date.now()', 'Caneca Print invalida o cache a cada abertura.');

requireText(bat, '--kiosk-printing', 'Atalho do Windows não habilita impressão silenciosa do Chrome.');
requireText(bat, 'https://donaantonia.com.br/caneca-print/?kiosk=1', 'Atalho não abre a rota oficial do Caneca Print.');

requireText(sync, "writeFile('site/canecas-print.json'", 'Sincronização não gera o snapshot de impressão.');
requireText(sync, "PRINT_CATEGORY_NAMES.some(category => normalized(value.categoria) === normalized(category))", 'Snapshot não aceita categoria oficial e legada de porcelana.');
requireText(sync, '&& isActive(value);', 'Snapshot de impressão não exige produto ativo.');
requireText(sync, '.filter(([, value]) => isPrintableMug(value))', 'Filtro de impressão não é aplicado ao snapshot.');
requireText(sync, 'arte_horizontal: horizontal', 'Snapshot não contém a arte horizontal.');
requireText(sync, 'mockup_1: mockup1', 'Snapshot não contém mockup 1.');
requireText(sync, 'mockup_2: mockup2', 'Snapshot não contém mockup 2.');
requireText(sync, 'mockup_3: mockup3', 'Snapshot não contém mockup 3 central.');
requireText(sync, 'return Object.fromEntries(rows);', 'Snapshot de impressão ainda parece limitado por paginação artificial.');
requireText(workflow, 'site/canecas-print.json', 'Workflow não publica o snapshot de impressão.');

try { JSON.parse(snapshot || '{}'); }
catch (error) { failures.push(`Snapshot inicial inválido: ${error.message}`); }

if (failures.length) {
  console.error(`Caneca Print: ${failures.length} falha(s).`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exitCode = 1;
} else {
  console.log('Caneca Print validado: categoria Caneca de Porcelana + legado, botão dos 3 mockups ativo quando completo, downloads individuais, Firebase ao vivo + fallback e impressão em uma única página.');
}
