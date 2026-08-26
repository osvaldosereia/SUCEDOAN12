import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const htmlPath = path.join(root, 'ceneca10', 'index.html');
const appPath = path.join(root, 'ceneca10', 'app-v2.js');
const galleryPath = path.join(root, 'ceneca10', 'gallery-v4.js');
const compatPath = path.join(root, 'ceneca10', 'make-response-compat-v3.js');
const guardPath = path.join(root, 'ceneca10', 'make-client-guard-v5.js');
const lightPath = path.join(root, 'ceneca10', 'light-v4.css');
const html = fs.readFileSync(htmlPath, 'utf8');
const app = fs.readFileSync(appPath, 'utf8');
const gallery = fs.readFileSync(galleryPath, 'utf8');
const compat = fs.readFileSync(compatPath, 'utf8');
const guard = fs.readFileSync(guardPath, 'utf8');
const light = fs.readFileSync(lightPath, 'utf8');
const failures = [];
const requireText = (source, needle, message) => { if (!source.includes(needle)) failures.push(message); };
const forbidText = (source, needle, message) => { if (source.includes(needle)) failures.push(message); };

for (const file of [appPath, galleryPath, compatPath, guardPath]) {
  const syntax = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (syntax.status !== 0) failures.push(`${path.basename(file)} possui erro de sintaxe:\n${syntax.stderr || syntax.stdout}`);
}

requireText(html, 'Gerador interno de canecas', 'A tela não está identificada como gerador interno.');
requireText(html, 'make-client-guard-v5.js?v=20260826-5', 'index.html não carrega a proteção V5 do Make.');
requireText(html, 'app-v2.js?v=20260826-5', 'index.html não carrega o controlador interno.');
requireText(html, 'gallery-v4.js?v=20260826-5', 'index.html não carrega a galeria leve V4.');
requireText(html, 'light-v4.css?v=20260826-5', 'index.html não carrega o tema claro V4.');
requireText(html, 'make-response-compat-v3.js?v=20260826-5', 'index.html não carrega a compatibilidade do retorno do Make.');
requireText(html, 'id="modelsTrack"', 'Caneca10 não mostra os modelos salvos.');
requireText(html, 'id="createdList"', 'Caneca10 não mostra as canecas criadas.');
requireText(html, 'id="createdLoadMore"', 'Histórico não possui botão Carregar mais.');
requireText(html, 'Carregar mais 4', 'Botão não informa o lote de 4 canecas.');
requireText(html, '<option value="inactive">Inativas</option>', 'Caneca10 não permite filtrar canecas inativas.');
requireText(html, '<option value="active">Ativas</option>', 'Caneca10 não permite filtrar canecas ativas.');
forbidText(html, 'personalizar.html', 'A aba pública de teste voltou à entrada do Caneca10.');
forbidText(html, 'settingsDialog', 'A tela voltou a possuir configuração manual de webhook.');

requireText(light, 'color-scheme:light', 'Caneca10 não está forçando a versão clara.');
requireText(light, '--bg:#f6f4ee', 'Tema claro não possui o fundo definido.');
requireText(light, '.generate-button{background:#1d6a43', 'Botão principal do tema claro não foi configurado.');

requireText(guard, 'personalize_mug_model', 'Proteção não normaliza a personalização pública.');
requireText(guard, 'payload.image_base64', 'Proteção não promove a foto do cliente para image_base64.');
requireText(guard, 'Automação Make falhou', 'Proteção não transforma falhas não-JSON em erro legível.');
requireText(app, "const MAKE_WEBHOOK = 'https://hook.eu1.make.com/cl3r1f56r9txezvltkkwlsspmnja6sw4'", 'Webhook fixo da automação não está configurado.');
requireText(app, "action: 'generate_mug_art'", 'Gerador não chama generate_mug_art.');
requireText(app, "mode: 'create_model'", 'Gerador interno não identifica criação de modelo.');
requireText(app, "action: 'analyze_mug_product'", 'Catalogação visual não está integrada.');
requireText(app, 'async function analyzeCatalogSoft', 'Catalogação não possui modo sem trava.');
requireText(app, "action: 'finalize_mug_product'", 'Finalização com mockups não está integrada.');
requireText(app, 'mockup_left_base64', 'Mockup esquerdo não é enviado.');
requireText(app, 'mockup_right_base64', 'Mockup direito não é enviado.');
requireText(app, 'mockup_center_base64', 'Mockup central não é enviado.');
requireText(app, "situacao: 'I'", 'Produto não é salvo inativo.');
requireText(app, 'ativo: false', 'Produto não possui ativo=false.');
requireText(app, 'modelo_caneca: true', 'Nova caneca não vira modelo interno.');
requireText(app, 'modelo_publico: false', 'Nova caneca está sendo publicada automaticamente.');
requireText(app, "const QUALITY = 'high'", 'Qualidade alta fixa não está configurada.');

requireText(gallery, 'const PAGE_SIZE = 4', 'Galeria não inicia com 4 canecas.');
requireText(gallery, "params.set('limitToLast', String(limit))", 'Consulta não limita o volume lido do Firebase.');
requireText(gallery, 'async function loadMore()', 'Galeria não possui carregamento progressivo.');
requireText(gallery, 'state.queryLimit + PAGE_SIZE', 'Carregar mais não avança em lotes de 4.');
requireText(gallery, "const ARCHIVE_NODE = 'produtos_excluidos'", 'Exclusão não utiliza o mesmo arquivo seguro do Produção.');
requireText(gallery, 'function isInactive(product = {})', 'Galeria não reconhece produtos inativos.');
requireText(gallery, 'data-delete-created', 'Caneca criada não possui ação de apagar.');
requireText(gallery, 'async function archiveMug', 'Exclusão segura da caneca não está implementada.');
requireText(gallery, 'async function applyRecipe', 'Modelos do Produção não podem restaurar comandos no mobile.');
requireText(gallery, 'fetchpriority="low"', 'Imagens históricas não estão em prioridade baixa.');
requireText(gallery, 'this.onerror=null', 'Imagens antigas não possuem fallback visual.');

requireText(compat, 'art_source_public_url', 'Compatibilidade do retorno imediato da arte não foi instalada.');
requireText(compat, 'art_source_base64', 'Compatibilidade não preserva a arte Base64 original.');

for (const removed of [
  'ceneca10/personalizar.html',
  'ceneca10/personalizar.js',
  'ceneca10/personalizar-v2.js',
  'ceneca10/personalizar-v3.js',
  'ceneca10/personalizar-v4.js',
  'ceneca10/tabs.css',
]) {
  if (fs.existsSync(path.join(root, removed))) failures.push(`Arquivo antigo de teste ainda existe: ${removed}`);
}

if (failures.length) {
  console.error(`Falhas (${failures.length}):`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exit(1);
}

console.log('Caneca10 V5 validado: tema claro, 4 por vez, Make protegido, modelos, inativas e exclusão segura.');
