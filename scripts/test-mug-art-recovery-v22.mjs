import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const files = {
  bridge: 'producao-v2/js/mug-make-native-openai-bridge.js',
  recovery: 'producao-v2/js/mug-make-art-recovery-v22.js',
  admin: 'producao-v2/admin-produtivo.html',
};
const src = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, 'utf8')]));
const failures = [];
const need = (key, token, message) => { if (!src[key].includes(token)) failures.push(message); };
const reject = (key, token, message) => { if (src[key].includes(token)) failures.push(message); };

for (const file of [files.bridge, files.recovery]) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) failures.push(`${file}: ${result.stderr || result.stdout}`);
}

need('bridge', "'./mug-make-art-recovery-v22.js'", 'Bridge não carrega a recuperação da arte.');
const recoveryPos = src.bridge.indexOf('./mug-make-art-recovery-v22.js');
const clientPos = src.bridge.indexOf('./mug-personalizer-v15-clean.js');
if (recoveryPos < 0 || clientPos <= recoveryPos) failures.push('Recuperação da arte precisa ser carregada antes do controlador V15.');

need('recovery', "inner?.action === 'generate_mug_art'", 'Recuperação não está restrita à geração da arte.');
need('recovery', "RESULT_NODE = 'canecas/geracoes'", 'Nó temporário de recuperação não está definido.');
need('recovery', 'waitForArt(payload)', 'Recuperação não acompanha o Firebase após queda da resposta síncrona.');
need('recovery', 'art_source_base64', 'Recuperação não aceita a arte em Base64.');
need('recovery', 'art_source_url', 'Recuperação não aceita a arte por URL.');
need('recovery', "cache: 'no-store'", 'Polling da arte pode ler cache antigo.');
need('recovery', "if (error?.name === 'AbortError') throw error", 'Recuperação não preserva cancelamento explícito do controlador.');
reject('recovery', 'finalize_mug_product', 'Recuperação da etapa 2 não pode interceptar a finalização 5/6.');
need('admin', '20260827-canecas-clean-v22-art-recovery', 'Admin não invalida cache para a V22.');

if (failures.length) {
  console.error(`Recuperação de arte V22 FALHOU (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('Recuperação de arte V22 OK: generate_mug_art pode sobreviver ao limite síncrono do Make usando Firebase, sem interferir na finalização.');
