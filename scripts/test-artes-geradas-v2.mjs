import fs from 'node:fs';
import assert from 'node:assert/strict';

const manager = fs.readFileSync('admin-canecas/creations-manager-v2.js','utf8');
const index = fs.readFileSync('admin-canecas/index.html','utf8');
const generator = fs.readFileSync('admin-canecas/generator-v1.js','utf8');
const personalizer = fs.readFileSync('loja-integrada/personalizar/app.js','utf8');

function has(source, pattern, message) {
  assert.match(source, pattern, message);
}

has(index, /creations-manager-v2\.js/, 'Admin deve carregar o gerenciador V2 de Artes geradas.');
assert.doesNotMatch(index, /src="\.\/creations-manager-v1\.js/, 'Admin não deve carregar V1 e V2 ao mesmo tempo.');

has(manager, /function versions\(/, 'V2 deve interpretar histórico de versões.');
has(manager, /arte_versao_aprovada/, 'V2 deve respeitar versão aprovada persistida.');
has(manager, /arte_aprovada/, 'V2 deve respeitar arte aprovada persistida.');
has(manager, /cliente_contatado_em/, 'V2 deve registrar contato operacional com o cliente.');
has(manager, /const canArchive=!orderCode/, 'Arquivamento deve continuar bloqueado quando existir pedido vinculado.');
has(manager, /\['cart','released','paid','sent'\]/, 'Arquivamento deve proteger estados de compra/produção.');
has(manager, /mugGeneratorNav/, 'Nova criação deve reutilizar o gerador oficial do Admin.');
assert.doesNotMatch(manager, /hook\.[a-z0-9-]+\.make\.com/i, 'Gerenciador de Artes não deve criar webhook Make próprio.');
assert.doesNotMatch(manager, /loja_integrada_create_product|createTemporaryProduct|pedido_manual/i, 'Gerenciador de Artes não deve substituir checkout/pedido da Loja Integrada.');

has(generator, /button\.id = 'mugGeneratorNav'/, 'Gerador oficial deve expor o botão reutilizado pela V2.');
has(personalizer, /versoes:\s*\[/, 'Personalizador deve persistir histórico inicial de versões.');
has(personalizer, /arte_versao_aprovada:\s*'v1'/, 'Personalizador deve persistir versão aprovada.');

console.log('OK · Artes geradas V2: versões, aprovação, contato, arquivamento seguro e gerador único validados.');