import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const failures = [];
const read = file => existsSync(file) ? readFileSync(file, 'utf8') : (failures.push(`Arquivo ausente: ${file}`), '');
const need = (source, marker, message) => { if (!source.includes(marker)) failures.push(message); };
const reject = (source, marker, message) => { if (source.includes(marker)) failures.push(message); };

const file = 'producao-v2/js/mug-video-generator-v1.js';
const video = read(file);
const loader = read('producao-v2/js/mug-make-native-openai-bridge.js');

if (video) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) failures.push(`Erro de sintaxe em ${file}: ${check.stderr || check.stdout}`);
}

need(loader, './mug-video-generator-v1.js', 'Loader do Criador não carrega o gerador de vídeo.');
for (const marker of [
  "const BUILD = '20260828-mug-video-generator-v1'",
  "action: 'generate_mug_video'",
  "prompt_video: VIDEO_PROMPT",
  'exatamente 5 segundos',
  'UMA órbita horizontal completa de 360 graus',
  "product.arte_horizontal",
  'data-generate-mug-video',
  "button.textContent = 'Gerar vídeo 5s'",
  "window.addEventListener('da:mug-created'",
  'installRecentButtons()',
  'callMake(currentWebhook()',
]) need(video, marker, `Gerador de vídeo incompleto: ${marker}`);

reject(video, 'setInterval(', 'Gerador de vídeo não pode manter polling contínuo.');
reject(video, 'google-vertex-ai', 'Produção não deve acoplar o botão ao módulo Vertex legado.');

if (failures.length) {
  console.error(`Vídeo das canecas: ${failures.length} falha(s).`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exitCode = 1;
} else {
  console.log('Vídeo das canecas validado: botão nas artes recentes, 5s e exatamente 1 giro 360°.');
}
