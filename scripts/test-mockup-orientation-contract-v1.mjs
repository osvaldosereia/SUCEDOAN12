import fs from 'node:fs';
import assert from 'node:assert/strict';

const recovery = fs.readFileSync('admin-canecas/generator-finalize-recovery-v2.js', 'utf8');
const geometry = fs.readFileSync('admin-canecas/generator-mockup-geometry-v1.js', 'utf8');
const index = fs.readFileSync('admin-canecas/index.html', 'utf8');

// Contrato legado de orientação continua válido.
assert.match(recovery, /MOCKUP_PROMPT_HANDLE_LEFT[\s\S]*ALÇA[\s\S]*À ESQUERDA[\s\S]*INÍCIO DA PERSONALIZAÇÃO[\s\S]*LADO ESQUERDO \/ PRIMEIRA METADE/, 'alça à esquerda deve mostrar o início/lado esquerdo da arte');
assert.match(recovery, /MOCKUP_PROMPT_HANDLE_RIGHT[\s\S]*ALÇA[\s\S]*À DIREITA[\s\S]*FINAL DA PERSONALIZAÇÃO[\s\S]*LADO DIREITO \/ SEGUNDA METADE/, 'alça à direita deve mostrar o final/lado direito da arte');
assert.match(recovery, /prompt_mockup_1:\s*MOCKUP_PROMPT_HANDLE_LEFT/, 'mockup 1 deve usar alça à esquerda + início da arte');
assert.match(recovery, /prompt_mockup_2:\s*MOCKUP_PROMPT_HANDLE_RIGHT/, 'mockup 2 deve usar alça à direita + final da arte');
assert.match(recovery, /mockup_orientation_contract:\s*'handle_left=art_start\|handle_right=art_end'/, 'payload deve registrar o contrato de orientação');

// Novo contrato físico: a referência é uma janela do wrap, não uma imagem para recentralizar.
assert.match(geometry, /JANELA DE UMA ARTE HORIZONTAL CONTÍNUA/, 'mockup deve tratar a referência como janela do wrap contínuo');
assert.match(geometry, /NÃO é um logotipo isolado para ser centralizado/, 'mockup deve proibir interpretação da referência como logo isolado');
assert.match(geometry, /preserve rigorosamente a coordenada horizontal/, 'posição horizontal original deve ser preservada');
assert.match(geometry, /NÃO mova o assunto principal para o centro/, 'IA não pode recentralizar personagem, texto ou logo');
assert.match(geometry, /CENTRO horizontal da imagem de referência deve coincidir com o centro da face cilíndrica visível/, 'centro da janela deve mapear para centro da face visível');
assert.match(geometry, /progressivamente comprimido\/foreshortened/, 'bordas devem sofrer perspectiva cilíndrica');
assert.match(geometry, /nenhuma parte da arte pode atravessar a alça/, 'zona da alça deve permanecer sem estampa');
assert.match(geometry, /mockup_forbid_recentering:\s*true/, 'payload deve registrar bloqueio de recentralização');
assert.match(geometry, /mockup_forbid_handle_print:\s*true/, 'payload deve registrar bloqueio de impressão na alça');
assert.match(geometry, /cylindrical_wrap_preserve_absolute_x_no_recentering/, 'payload deve registrar contrato geométrico');
assert.match(geometry, /masterWidthPx:\s*2400/, 'contrato deve conhecer a largura mestre');
assert.match(geometry, /referenceWindowPx:\s*1344/, 'contrato deve conhecer a janela enviada ao mockup');

// Ordem é intencional: generator cria; geometry instala wrapper; recovery fica por fora.
// Na chamada final, recovery corrige orientação e geometry é a última camada antes do fetch nativo,
// substituindo os prompts simples pelos prompts físicos.
const generatorPos = index.indexOf('./generator-v1.js');
const geometryPos = index.indexOf('./generator-mockup-geometry-v1.js');
const recoveryPos = index.indexOf('./generator-finalize-recovery-v2.js');
assert.ok(generatorPos >= 0 && geometryPos > generatorPos, 'geometria deve carregar depois do gerador');
assert.ok(recoveryPos > geometryPos, 'recovery deve carregar depois da geometria para a geometria ser a última camada antes do fetch nativo');

console.log('OK mockup geometry: orientação preservada + wrap cilíndrico sem recentralização + zona da alça protegida.');
