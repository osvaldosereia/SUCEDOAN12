import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const htmlPath = path.join(root, 'ceneca10', 'index.html');
const jsPath = path.join(root, 'ceneca10', 'app-v2.js');
const html = fs.readFileSync(htmlPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');
const failures = [];
const requireText = (source, needle, message) => { if (!source.includes(needle)) failures.push(message); };
const forbidText = (source, needle, message) => { if (source.includes(needle)) failures.push(message); };

const syntax = spawnSync(process.execPath, ['--check', jsPath], { encoding: 'utf8' });
if (syntax.status !== 0) failures.push(`app-v2.js possui erro de sintaxe:\n${syntax.stderr || syntax.stdout}`);

requireText(html, 'Gerador interno de canecas', 'A tela não está identificada como gerador interno.');
requireText(html, 'app-v2.js?v=20260826-2', 'index.html não carrega o controlador interno V2.');
forbidText(html, 'personalizar.html', 'A aba pública de teste ainda aparece na entrada do Caneca10.');
forbidText(html, 'settingsDialog', 'A tela ainda possui configuração manual de webhook.');
forbidText(html, 'webhookInput', 'A tela ainda pede webhook ao operador.');

requireText(js, "const MAKE_WEBHOOK = 'https://hook.eu1.make.com/cl3r1f56r9txezvltkkwlsspmnja6sw4'", 'Webhook fixo da automação não está configurado.');
requireText(js, "action: 'generate_mug_art'", 'Gerador não chama generate_mug_art.');
requireText(js, "mode: 'create_model'", 'Gerador interno não identifica criação de modelo.');
requireText(js, "action: 'analyze_mug_product'", 'Catalogação visual não está integrada.');
requireText(js, 'async function analyzeCatalogSoft', 'Catalogação não possui modo sem trava.');
requireText(js, "action: 'finalize_mug_product'", 'Finalização com mockups não está integrada.');
requireText(js, 'mockup_left_base64', 'Mockup esquerdo não é enviado.');
requireText(js, 'mockup_right_base64', 'Mockup direito não é enviado.');
requireText(js, 'mockup_center_base64', 'Mockup central não é enviado.');
requireText(js, "situacao: 'I'", 'Produto não é salvo inativo.');
requireText(js, 'ativo: false', 'Produto não possui ativo=false.');
requireText(js, 'modelo_caneca: true', 'Nova caneca não vira modelo interno.');
requireText(js, 'modelo_publico: false', 'Nova caneca está sendo publicada automaticamente.');
requireText(js, "const MODELS_NODE = 'canecas/modelos_criacao'", 'Registro de modelos internos não está configurado.');
requireText(js, 'await syncModelRecord', 'Caneca criada não é sincronizada como modelo interno.');
requireText(js, "const QUALITY = 'high'", 'Qualidade alta fixa não está configurada.');
requireText(js, "const COMMANDS_NODE = 'canecas/comandos_criacao'", 'Comandos salvos do Produção não são compartilhados.');

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

console.log('Caneca10 interno V2 validado: webhook fixo, fluxo do Produção, 3 mockups, Firebase inativo e sem aba pública de teste.');
