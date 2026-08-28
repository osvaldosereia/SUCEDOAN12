import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const files = {
  player: 'producao-v2/js/mug-video-result-player-v5.js',
  bridge: 'producao-v2/js/mug-make-native-openai-bridge.js',
  producao: 'producao/index.html',
  admin: 'admin/index.html',
};
const failures = [];
const read = file => fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : (failures.push(`Arquivo ausente: ${file}`), '');
const player = read(files.player);
const bridge = read(files.bridge);
const producao = read(files.producao);
const admin = read(files.admin);

for (const file of [files.player, files.bridge]) {
  if (!fs.existsSync(file)) continue;
  const checked = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (checked.status !== 0) failures.push(`Erro de sintaxe em ${file}: ${checked.stderr || checked.stdout}`);
}

for (const marker of [
  "product.video_url",
  "product.video_mp4_url",
  "product.video_ia_url",
  "▶ Ver vídeo",
  "data-view-mug-video",
  "video controls playsinline",
  "pollForVideo",
]) if (!player.includes(marker)) failures.push(`Player incompleto: ${marker}`);

if (!bridge.includes("'./mug-video-result-player-v5.js'")) failures.push('Bridge não carrega player V5.');
if (!bridge.includes('20260827-canecas-clean-v24-low-async')) failures.push('Bridge perdeu compatibilidade com build V24/LOW.');
for (const html of [producao, admin]) if (!html.includes('mug-video-result-player-v5')) failures.push('Entrada do Admin não invalida cache para player V5.');

if (failures.length) {
  console.error(`Player de vídeo V5 falhou (${failures.length}):`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exit(1);
}
console.log('Player de vídeo V5 OK: Produção reconhece video_url do Firebase e exibe player MP4.');
