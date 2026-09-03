import fs from 'node:fs';
import assert from 'node:assert/strict';

const contract = fs.readFileSync('admin-canecas/generator-finalize-recovery-v2.js', 'utf8');
const index = fs.readFileSync('admin-canecas/index.html', 'utf8');

assert.match(contract, /MOCKUP_PROMPT_HANDLE_LEFT[\s\S]*ALÇA[\s\S]*À ESQUERDA[\s\S]*INÍCIO DA PERSONALIZAÇÃO[\s\S]*LADO ESQUERDO \/ PRIMEIRA METADE/, 'alça à esquerda deve mostrar o início/lado esquerdo da arte');
assert.match(contract, /MOCKUP_PROMPT_HANDLE_RIGHT[\s\S]*ALÇA[\s\S]*À DIREITA[\s\S]*FINAL DA PERSONALIZAÇÃO[\s\S]*LADO DIREITO \/ SEGUNDA METADE/, 'alça à direita deve mostrar o final/lado direito da arte');
assert.match(contract, /prompt_mockup_1:\s*MOCKUP_PROMPT_HANDLE_LEFT/, 'mockup 1 deve usar alça à esquerda + início da arte');
assert.match(contract, /prompt_mockup_2:\s*MOCKUP_PROMPT_HANDLE_RIGHT/, 'mockup 2 deve usar alça à direita + final da arte');
assert.match(contract, /mockup_orientation_contract:\s*'handle_left=art_start\|handle_right=art_end'/, 'payload deve registrar o contrato de orientação');
assert.match(contract, /const forwardedInit = rewriteFinalizeRequest\(init, payload\)/, 'o payload corrigido deve ser serializado antes do envio');
assert.match(contract, /innerFetch\(input, forwardedInit\)/, 'o Make deve receber o request já corrigido');

const generatorPos = index.indexOf('./generator-v1.js');
const contractPos = index.indexOf('./generator-finalize-recovery-v2.js');
assert.ok(generatorPos >= 0 && contractPos > generatorPos, 'o contrato deve carregar após o gerador para interceptar a finalização');

console.log('OK mockup orientation: alça esquerda=início; alça direita=final; request corrigido antes do Make.');
