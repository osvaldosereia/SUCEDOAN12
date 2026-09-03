import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd();
const read=(...parts)=>fs.readFileSync(path.join(root,...parts),'utf8');

const adminIndex=read('admin-canecas','index.html');
const mediaAdmin=read('admin-canecas','storefront-media-v4.js');
const mediaQueue=read('scripts','fila-midia-loja-integrada-v1.mjs');
const finalRecovery=read('admin-canecas','generator-finalize-recovery-v2.js');
const personalization=read('admin-canecas','personalization-config-v1.js');
const adminLinks=read('admin-canecas','personalization-test-link-v1.js');
const mediaWorker=read('scripts','processar-midia-loja-integrada-v16.mjs');
const liGalleryMigration=read('scripts','migrar-imagens-loja-integrada-v1.mjs');
const liSyncCompat=read('scripts','sincronizar-loja-integrada-v3.mjs');
const app=read('loja-integrada','personalizar','app-v15.js');
const personalizerIndex=read('loja-integrada','personalizar','index.html');
const nativeCart=read('loja-integrada','personalizar','native-cart-v2.js');
const generationGuard=read('loja-integrada','personalizar','generation-guard-v1.js');
const cartBridge=read('loja-integrada','personalized-order-bridge-v2.js');
const prodLoader=read('loja-integrada','loader-personalizador-inline-producao-v10.js');
const orderWorker=read('scripts','sincronizar-pedidos-personalizados-li.mjs');

for(const id of ['nome','foto','logo','endereco','telefone','site']) assert.match(personalization,new RegExp(`\\['${id}'`),`campo ${id} deve existir no cadastro`);
assert.match(adminIndex,/storefront-media-v4\.js\?v=20260903-2/,'Admin deve carregar mídia LI V16 com fila GitHub direta');
assert.match(adminIndex,/generator-finalize-recovery-v2\.js\?v=20260903-1/,'Admin deve carregar recuperação V2 sem legado de recortes');
assert.doesNotMatch(adminIndex,/storefront-crops-github-v3\.js/,'Admin não deve carregar módulo ativo de recortes');
assert.doesNotMatch(adminIndex,/generator-finalize-recovery-v1\.js/,'Admin não deve carregar recuperação antiga de recortes');

assert.match(mediaAdmin,/return\[m\.m1,m\.m2,mediaOf\(p\)\]/,'ordem oficial deve ser mockup 1, mockup 2 e horizontal quadrada');
assert.match(mediaAdmin,/midia_fila/,'Admin deve solicitar mídia pela fila Firebase/GitHub');
assert.match(mediaAdmin,/solicitado_por:'admin_github_direct'/,'solicitação de mídia deve registrar origem GitHub direta');
assert.doesNotMatch(mediaAdmin,/action:'prepare_mug_storefront_media'/,'Admin não deve mais usar Make como ponte para preparar mídia');
assert.match(mediaAdmin,/vitrine_horizontal_quadrada:images\[2\]/,'payload de contingência deve usar a horizontal quadrada');
assert.match(mediaAdmin,/for\(let i=0;i<5;i\+\+\)/,'update de contingência deve carregar até 5 IDs antigos para limpeza');
assert.doesNotMatch(mediaAdmin,/vitrine_recorte_esquerda:images\[2\]/,'Admin não pode enviar recorte esquerdo como imagem oficial');

assert.match(mediaQueue,/const QUEUE = 'canecas\/integracoes\/loja_integrada\/midia_fila'/,'worker da fila deve usar o mesmo nó Firebase do Admin');
assert.match(mediaQueue,/status: 'processando'/,'fila deve possuir etapa processando');
assert.match(mediaQueue,/status: 'concluido'/,'fila deve possuir etapa concluído');
assert.match(mediaQueue,/via: 'github_actions'/,'fila deve registrar GitHub Actions como executor');

assert.match(finalRecovery,/vitrine_loja_integrada_status = 'pendente_github'/,'finalização deve solicitar mídia LI sem criar recortes');
assert.match(finalRecovery,/cleanLegacyMedia/,'recuperação deve eliminar campos antigos de recorte');

assert.match(mediaWorker,/OUTPUT_SIZE = 1200/,'horizontal da loja deve ter canvas 1200x1200');
assert.match(mediaWorker,/fit:'contain'/,'horizontal da loja deve usar contain sem cortar');
assert.match(mediaWorker,/background:'#ffffff'/,'metadados devem registrar fundo branco');
assert.match(mediaWorker,/quality:OUTPUT_QUALITY/,'arquivo da loja deve ser WEBP compactado');
assert.match(mediaWorker,/const storefront = \[item\.mockup1, item\.mockup2, item\.url\]/,'Firebase deve guardar somente as 3 imagens oficiais');
assert.match(mediaWorker,/vitrine_recorte_esquerda:null/,'migração deve apagar recorte esquerdo');
assert.match(mediaWorker,/vitrine_recorte_direita:null/,'migração deve apagar recorte direito');
assert.match(mediaWorker,/mockup_3:null/,'migração deve apagar mockup 3 legado');
assert.doesNotMatch(mediaWorker,/\.extract\(/,'a horizontal quadrada não pode cortar a arte mestre');

assert.match(liGalleryMigration,/const images = desired\(p\)/,'migração LI deve usar conjunto canônico');
assert.match(liGalleryMigration,/if \(ids\.length !== 3\)/,'Loja Integrada deve receber exatamente 3 imagens');
assert.match(liGalleryMigration,/method:'DELETE'/,'migração deve remover imagens antigas da Loja Integrada');
assert.match(liGalleryMigration,/horizontal_quadrada:images\[2\]/,'Firebase deve registrar a derivada quadrada da loja');

assert.match(liSyncCompat,/imagem duplicada suprimida/,'worker legado deve suprimir a quarta imagem duplicada');
assert.match(liSyncCompat,/delete out\[key\]/,'worker compatível não pode regravar recortes no Firebase');

assert.match(adminLinks,/new URL\(`produto\/\$\{encodeURIComponent\(alias\)\}\.html`,STOREFRONT\)/,'links públicos devem continuar canônicos');
assert.match(personalizerIndex,/app-v15\.js/,'personalizador público deve usar V15');
assert.equal(app.includes('createTemporaryProduct'),false,'V15 não pode criar produto temporário');
assert.match(app,/action:'personalize_mug_model'/,'cliente deve gerar somente a personalização');
assert.match(generationGuard,/PER_MODEL = 2/,'deve limitar duas gerações por modelo/dia/aparelho');
assert.match(nativeCart,/const productId = liProductId\(product\)/,'carrinho deve usar produto original sincronizado');
assert.match(cartBridge,/credentials:'same-origin'/,'adição ao carrinho deve preservar sessão da Loja Integrada');
assert.match(prodLoader,/function personalizable\(/,'loader deve respeitar a configuração individual');
assert.match(orderWorker,/canecas\/print_jobs/,'pedido pago deve gerar fila de impressão');

console.log('OK CanecaFácil V16: mídia pela fila GitHub sem ponte Make, arte mestre preservada, dois mockups, derivada quadrada compactada para LI e galeria de 3 imagens.');
