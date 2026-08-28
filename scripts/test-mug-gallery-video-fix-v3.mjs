import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const files = {
  addon: 'producao-v2/js/mug-gallery-video-fix-v3.js',
  dedupe: 'producao-v2/js/mug-video-button-dedupe-v4.js',
  bridge: 'producao-v2/js/mug-make-native-openai-bridge.js',
};
const failures = [];
const read = file => existsSync(file) ? readFileSync(file, 'utf8') : (failures.push(`Arquivo ausente: ${file}`), '');
const addon = read(files.addon);
const dedupe = read(files.dedupe);
const bridge = read(files.bridge);

for (const file of Object.values(files)) {
  if (!existsSync(file)) continue;
  const checked = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (checked.status !== 0) failures.push(`Erro de sintaxe em ${file}: ${checked.stderr || checked.stdout}`);
}

for (const marker of [
  "const BUILD = '20260828-mug-gallery-video-fix-v3'",
  "product.arte_horizontal",
  "product.arte_impressao?.url",
  "data-gallery-generate-mug-video",
  "🎥 Gerar vídeo 5s",
  "action: 'generate_mug_video'",
  "aspect-ratio:5/2",
  "object-fit:contain",
  "UMA órbita horizontal completa de 360 graus",
]) if (!addon.includes(marker)) failures.push(`Addon incompleto: ${marker}`);

for (const forbidden of ['product.mockup_1', 'product.mockup_2', 'product.mockup_3']) {
  if (addon.includes(forbidden)) failures.push(`Cards voltaram a depender de mockup: ${forbidden}`);
}

for (const marker of [
  "const BUILD = '20260828-mug-video-button-dedupe-v4'",
  "[data-gallery-generate-mug-video]",
  "[data-generate-mug-video]",
  "button.remove()",
]) if (!dedupe.includes(marker)) failures.push(`Deduplicador incompleto: ${marker}`);

if (!bridge.includes("'./mug-gallery-video-fix-v3.js'")) failures.push('Bridge não carrega a correção de cards/vídeo.');
if (!bridge.includes("'./mug-video-button-dedupe-v4.js'")) failures.push('Bridge não carrega o deduplicador do botão de vídeo.');
if (bridge.indexOf("'./mug-gallery-video-fix-v3.js'") < bridge.indexOf("'./mug-video-generator-v1.js'")) failures.push('Correção deve carregar depois do gerador de vídeo.');
if (bridge.indexOf("'./mug-video-button-dedupe-v4.js'") < bridge.indexOf("'./mug-gallery-video-fix-v3.js'")) failures.push('Deduplicador deve carregar depois da correção dos cards.');

if (failures.length) {
  console.error(`Correção dos cards de caneca: ${failures.length} falha(s).`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exitCode = 1;
} else {
  console.log('Cards de caneca validados: arte horizontal exclusiva + um único botão de vídeo 5s/360°.');
}
