import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const htmlPath = path.join(root, 'caneca10', 'index.html');
const appPath = path.join(root, 'caneca10', 'app-v4-clean.js');
const galleryPath = path.join(root, 'caneca10', 'gallery-v4.js');
const recoveryPath = path.join(root, 'caneca10', 'art-recovery-v1.js');
const transportPath = path.join(root, 'shared', 'mug-make-fast-ack-v1.js');
const lightPath = path.join(root, 'caneca10', 'light-v4.css');
const html = fs.readFileSync(htmlPath, 'utf8');
const app = fs.readFileSync(appPath, 'utf8');
const gallery = fs.readFileSync(galleryPath, 'utf8');
const recovery = fs.readFileSync(recoveryPath, 'utf8');
const transport = fs.readFileSync(transportPath, 'utf8');
const light = fs.readFileSync(lightPath, 'utf8');
const failures = [];
const requireText = (source, needle, message) => { if (!source.includes(needle)) failures.push(message); };
const forbidText = (source, needle, message) => { if (source.includes(needle)) failures.push(message); };

for (const file of [appPath, galleryPath, recoveryPath, transportPath]) {
  const syntax = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (syntax.status !== 0) failures.push(`${path.basename(file)} possui erro de sintaxe:\n${syntax.stderr || syntax.stdout}`);
}

if (fs.existsSync(path.join(root, 'ceneca10'))) failures.push('A pasta com grafia antiga ceneca10 ainda existe.');
for (const removed of [
  'caneca10/gallery-v3.js',
  'caneca10/gallery-refresh-v5.js',
  'caneca10/resultado.html',
  'caneca10/resultado.js',
  'caneca10/resultado.css',
]) {
  if (fs.existsSync(path.join(root, removed))) failures.push(`Arquivo legado ainda existe: ${removed}`);
}

requireText(html, 'Gerador interno de canecas', 'A tela não está identificada como gerador interno.');
requireText(html, '20260827-caneca10-v7', 'Caneca10 não usa a build V7 atual.');
requireText(html, '../shared/mug-make-fast-ack-v1.js', 'Caneca10 não carrega o transporte LOW compartilhado.');
requireText(html, './art-recovery-v1.js', 'Caneca10 não carrega a recuperação da arte.');
requireText(html, './app-v4-clean.js', 'Caneca10 não carrega o controlador principal.');
requireText(html, './gallery-v4.js', 'Caneca10 não carrega a galeria ativa.');
forbidText(html, 'gallery-refresh-v5.js', 'Caneca10 voltou a carregar refresh duplicado da galeria.');
forbidText(html, 'make-client-guard', 'Caneca10 voltou a carregar guard legado.');
forbidText(html, 'make-response-compat', 'Caneca10 voltou a carregar compatibilizador legado.');

const transportPos = html.indexOf('../shared/mug-make-fast-ack-v1.js');
const recoveryPos = html.indexOf('./art-recovery-v1.js');
const appPos = html.indexOf('./app-v4-clean.js');
const galleryPos = html.indexOf('./gallery-v4.js');
if (!(transportPos >= 0 && recoveryPos > transportPos && appPos > recoveryPos && galleryPos > appPos)) {
  failures.push('A ordem do runtime deve ser transporte LOW -> recovery -> app -> galeria.');
}

requireText(html, 'id="modelsTrack"', 'Caneca10 não mostra os modelos salvos.');
requireText(html, 'id="createdList"', 'Caneca10 não mostra as canecas criadas.');
requireText(html, 'id="createdLoadMore"', 'Histórico não possui botão Carregar mais.');
requireText(html, 'Carregar mais 4', 'Histórico não carrega em lotes de 4.');
requireText(html, '<option value="inactive">Inativas</option>', 'Caneca10 não filtra inativas.');
requireText(html, '<option value="active">Ativas</option>', 'Caneca10 não filtra ativas.');

requireText(light, 'color-scheme:light', 'Caneca10 não está forçando o tema claro.');
requireText(light, '--bg:#f6f4ee', 'Tema claro não possui o fundo esperado.');
requireText(light, '.generate-button{background:#1d6a43', 'Botão principal não possui o acabamento esperado.');

requireText(app, "const MAKE_WEBHOOK = 'https://hook.eu1.make.com/cl3r1f56r9txezvltkkwlsspmnja6sw4'", 'Webhook oficial não está configurado.');
requireText(app, "action:'generate_mug_art'", 'Gerador não chama generate_mug_art.');
requireText(app, "mode:'create_model'", 'Gerador não identifica criação de modelo.');
requireText(app, "action:'analyze_mug_product'", 'Catalogação visual não está integrada.');
requireText(app, 'async function analyzeCatalogSoft', 'Catalogação não possui fallback sem bloqueio.');
requireText(app, "action:'finalize_mug_product'", 'Finalização com mockups não está integrada.');
requireText(app, 'mockup_left_base64', 'Mockup esquerdo não é enviado.');
requireText(app, 'mockup_right_base64', 'Mockup direito não é enviado.');
requireText(app, 'mockup_center_base64', 'Mockup central não é enviado.');
requireText(app, 'waitFinalProduct', 'Caneca10 não acompanha finalização Accepted no Firebase.');
requireText(app, 'FINAL_WAIT_MS = 180000', 'Caneca10 não possui limite explícito de 3 minutos.');
requireText(app, "situacao:'I'", 'Produto não é salvo inativo.');
requireText(app, 'ativo:false', 'Produto não possui ativo=false.');
requireText(app, 'modelo_caneca:true', 'Nova caneca não vira modelo interno.');
requireText(app, 'modelo_publico:false', 'Nova caneca está sendo publicada automaticamente.');

requireText(recovery, "const RESULT_NODE = 'canecas/geracoes'", 'Recovery não usa o nó temporário oficial.');
requireText(recovery, "inner?.action === 'generate_mug_art'", 'Recovery não identifica generate_mug_art.');
requireText(recovery, 'async function waitForArt', 'Recovery não possui polling da arte.');
requireText(recovery, "cache: 'no-store'", 'Recovery pode ler resultado em cache.');
requireText(recovery, "document.getElementById('progressDetail')", 'Recovery não atualiza o progresso mobile.');
requireText(recovery, 'X-DA-Caneca10-Art-Recovered', 'Recovery não marca a resposta recuperada.');

requireText(transport, "const MUG_ACTIONS = new Set(['generate_mug_art', 'finalize_mug_product', 'personalize_mug_model'])", 'Transporte não cobre todas as ações de imagem.');
requireText(transport, "inner.quality = 'low'", 'Transporte não força LOW antes do Make.');
requireText(transport, "payload.action !== 'finalize_mug_product'", 'ACK rápido não está restrito à finalização.');
requireText(transport, 'ACK_AFTER_MS = 10000', 'Finalização não possui ACK de contingência de 10 s.');

requireText(gallery, 'const PAGE_SIZE = 4', 'Galeria não inicia com 4 canecas.');
requireText(gallery, "params.set('limitToLast', String(limit))", 'Consulta não limita o volume lido do Firebase.');
requireText(gallery, 'async function loadMore()', 'Galeria não possui carregamento progressivo.');
requireText(gallery, "const ARCHIVE_NODE = 'produtos_excluidos'", 'Exclusão não usa o arquivo seguro do Produção.');
requireText(gallery, 'async function archiveMug', 'Exclusão segura não está implementada.');
requireText(gallery, 'async function applyRecipe', 'Modelos não podem restaurar a receita no mobile.');
requireText(gallery, 'fetchpriority="low"', 'Imagens históricas não estão em prioridade baixa.');
requireText(gallery, 'this.onerror=null', 'Imagens antigas não possuem fallback visual.');

if (failures.length) {
  console.error(`Caneca10 V7 FALHOU (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('Caneca10 V7 OK: nome corrigido, runtime LOW assíncrono, recovery Firebase, 3 mockups, histórico leve e exclusão segura validados.');
