import fs from 'node:fs';
import assert from 'node:assert/strict';

const runtime = fs.readFileSync('loja-integrada/canecafacil-personalizacao-only-v1.js', 'utf8');
const snippet = fs.readFileSync('loja-integrada/CODIGO-PERSONALIZACAO-ONLY-LOJA-INTEGRADA.txt', 'utf8');
const commerce = fs.readFileSync('loja-integrada/canecafacil-commerce-runtime-v1.js', 'utf8');
const cart = fs.readFileSync('loja-integrada/personalized-order-bridge-v2.js', 'utf8');
const nativeCart = fs.readFileSync('loja-integrada/personalizar/native-cart-v2.js', 'utf8');
const orderWorker = fs.readFileSync('scripts/sincronizar-pedidos-personalizados-li.mjs', 'utf8');

assert.match(runtime, /loader-personalizador-inline-producao\.js/, 'runtime mínimo deve carregar a infraestrutura da personalização');
assert.equal(runtime.includes('canecafacil-site-runtime-v1.js'), false, 'runtime mínimo não pode carregar o runtime visual completo do site');
assert.equal(runtime.includes('canecafacil-core-v1.css'), false, 'runtime mínimo não pode carregar CSS global próprio');
assert.equal(runtime.includes('canecafacil-storefront-v1'), false, 'runtime mínimo não pode reconstruir a vitrine');
assert.equal(runtime.includes('canecafacil-product-v1'), false, 'runtime mínimo não pode reconstruir a página de produto');
assert.match(runtime, /cfg\.obrigatoria === true/, 'compra deve respeitar personalização obrigatória');
assert.match(runtime, /Personalize para comprar/, 'botão nativo deve explicar a obrigatoriedade sem trocar o tema');
assert.match(runtime, /canecafacil-commerce-runtime-v1\.js/, 'runtime mínimo deve carregar a biblioteca de criações');
assert.match(runtime, /minhas-canecas-scroll-fix-v1\.js/, 'runtime mínimo deve manter a correção da gaveta de Minhas Canecas');
assert.match(snippet, /canecafacil-personalizacao-only-v1\.js/, 'snippet do painel deve apontar para o runtime mínimo');
assert.equal(snippet.includes('<script'), false, 'snippet deve ser JavaScript puro para o campo da Loja Integrada');

assert.match(commerce, /const STORE\s*=\s*'cf_minhas_artes_v1'/, 'lista deve persistir no aparelho');
assert.match(commerce, /const DAYS_WITHOUT_ORDER\s*=\s*15/, 'criação sem pedido deve seguir retenção de 15 dias');
assert.match(commerce, /const DAYS_ORDERED\s*=\s*90/, 'criação encomendada deve seguir retenção de 90 dias');
assert.match(commerce, /cf_arte/, 'biblioteca deve conseguir reabrir/reutilizar criação existente');
assert.match(commerce, /protectedArt/, 'criações ligadas a pedido devem ser protegidas');
assert.match(commerce, /method:'DELETE'/, 'criações abandonadas devem poder ser removidas');
assert.match(cart, /credentials:'same-origin'/, 'carrinho deve usar a sessão original da Loja Integrada');
assert.match(cart, /PERSONALIZADA <span>/, 'carrinho deve identificar o CF-ID');
assert.match(nativeCart, /PENDING_NODE = 'canecas\/encomendas_pendentes'/, 'aprovação deve persistir vínculo antes do checkout');
assert.match(nativeCart, /cf_add_personalizada/, 'aprovação deve fazer handoff para a loja');
assert.match(orderWorker, /canecas\/pedidos/, 'pedido nativo deve ser sincronizado ao Admin Canecas');
assert.match(orderWorker, /personalizada:true/, 'item sincronizado deve ser marcado como personalizado');
assert.match(orderWorker, /canecas\/print_jobs/, 'pagamento deve alimentar a fila de impressão');

console.log('OK CanecaFácil: tema padrão preservado + personalização completa + Minhas Canecas + carrinho/checkout nativos.');
