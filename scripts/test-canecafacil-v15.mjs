import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd();
const read=(...parts)=>fs.readFileSync(path.join(root,...parts),'utf8');

const adminIndex=read('admin-canecas','index.html');
const personalization=read('admin-canecas','personalization-config-v1.js');
const storefront=read('admin-canecas','storefront-crops-github-v3.js');
const creationStatus=read('admin-canecas','creation-order-status-v1.js');
const app=read('loja-integrada','personalizar','app-v15.js');
const personalizerIndex=read('loja-integrada','personalizar','index.html');
const nativeCart=read('loja-integrada','personalizar','native-cart-v2.js');
const deviceBridge=read('loja-integrada','personalizar','creation-device-bridge-v1.js');
const generationGuard=read('loja-integrada','personalizar','generation-guard-v1.js');
const commerce=read('loja-integrada','canecafacil-commerce-runtime-v1.js');
const cartBridge=read('loja-integrada','personalized-order-bridge-v2.js');
const prodLoader=read('loja-integrada','loader-personalizador-inline-producao.js');
const inlineV1=read('loja-integrada','personalizador-inline-v1.js');
const cropWorker=read('scripts','processar-vitrine-canecas-v13.mjs');
const orderWorker=read('scripts','sincronizar-pedidos-personalizados-li.mjs');

for(const id of ['nome','foto','logo','endereco','telefone','site']) assert.match(personalization,new RegExp(`\\['${id}'`),`campo ${id} deve existir no cadastro`);
assert.match(personalization,/prompt_base_texto/,'Admin deve persistir prompt-base');
assert.match(personalization,/prompt_especifico/,'Admin deve persistir instrução específica');
assert.match(adminIndex,/storefront-crops-github-v3\.js\?v=20260901-2/,'Admin deve carregar vitrine completa sem cache antigo');

assert.match(storefront,/return\[m\.m1,m\.m2,c\.left,c\.right\]/,'ordem pública deve ser mockup1, mockup2, esquerda, direita');
assert.match(storefront,/Vitrine incompleta: o modelo precisa de Mockup 1 \+ Mockup 2 \+ recorte esquerdo \+ recorte direito/,'sincronização deve exigir as 4 imagens');
assert.match(storefront,/mockup_1:images\[0\]/,'mockup 1 deve ser enviado à Loja Integrada');
assert.match(storefront,/mockup_2:images\[1\]/,'mockup 2 deve ser enviado à Loja Integrada');
assert.match(cropWorker,/pending\.push\(\{key,art,urls,meta:crops\.meta,nome:text\(p\.nome\),mockup1:mocks\.m1,mockup2:mocks\.m2\}\)/,'worker de recortes deve preservar mockups');
assert.match(cropWorker,/const storefront=\[item\.mockup1,item\.mockup2,item\.urls\.left,item\.urls\.right\]/,'worker deve gravar somente as 4 imagens oficiais');

assert.match(personalizerIndex,/app-v15\.js/,'personalizador público deve usar V15');
assert.equal(app.includes('createTemporaryProduct'),false,'V15 não pode criar produto temporário');
assert.equal(app.includes('loja_integrada_create_personalized_product'),false,'V15 não pode chamar ação de produto temporário');
assert.match(app,/CREATION_DAYS\s*=\s*30/,'criação deve permanecer recuperável por 30 dias');
assert.match(app,/action:'personalize_mug_model'/,'cliente deve gerar somente a personalização');
assert.match(app,/createTwoCrops/,'prévia deve ser dividida em esquerda e direita no navegador');
assert.match(app,/creationCode\(\)/,'cada arte deve receber CF-ID');
assert.match(app,/creationParam/,'V15 deve reabrir criação existente');
assert.match(personalizerIndex,/id="personalizedQuantity"/,'prévia deve permitir definir quantidade da mesma arte');
assert.match(personalizerIndex,/generation-guard-v1\.js/,'personalizador deve carregar proteção de gerações');
assert.match(generationGuard,/PER_MODEL = 2/,'deve limitar duas gerações por modelo/dia/aparelho');
assert.match(generationGuard,/PER_DEVICE = 6/,'deve existir teto diário global por aparelho');
assert.match(generationGuard,/payload\?\.action !== 'personalize_mug_model'/,'limite deve contar somente geração personalizada');
assert.match(generationGuard,/if \(response\.ok\)/,'geração só deve ser contabilizada se o Make aceitar a chamada');

assert.match(nativeCart,/const productId = liProductId\(product\)/,'carrinho deve usar produto original sincronizado');
assert.match(nativeCart,/PENDING_NODE = 'canecas\/encomendas_pendentes'/,'aprovação deve criar vínculo pendente');
assert.match(nativeCart,/cf_add_personalizada/,'aprovação deve usar handoff na própria loja');
assert.match(nativeCart,/cf_qtd/,'handoff deve transportar quantidade da arte');
assert.match(nativeCart,/quantidade:qty/,'vínculo pendente deve guardar quantidade da arte');
assert.match(nativeCart,/quantidade_encomendada:qty/,'criação deve guardar quantidade encomendada');
assert.match(nativeCart,/loja_integrada_create_personalized_product/,'camada de segurança deve bloquear explicitamente fluxo legado');
assert.match(cartBridge,/credentials:'same-origin'/,'adição ao carrinho deve preservar sessão da Loja Integrada');
assert.match(cartBridge,/addQuantity\(productId, code, qty\)/,'carrinho deve adicionar a quantidade escolhida');
assert.match(cartBridge,/PERSONALIZADA <span>· \$\{entry\.code\} · ×\$\{quantity\(entry\.quantity\)\}<\/span>/,'carrinho deve identificar CF-ID e quantidade');
assert.match(cartBridge,/location\.replace\(CART_URL\)/,'após adicionar deve abrir o carrinho nativo');

assert.match(deviceBridge,/payload\?\.action !== 'personalize_mug_model'/,'bridge deve observar somente geração de personalização');
assert.match(deviceBridge,/creation_code/,'bridge deve capturar CF-ID no início da geração');
assert.match(commerce,/ART_STORAGE = 'cf_minhas_artes_v1'/,'Minhas Artes deve persistir no aparelho');
assert.match(commerce,/MAX_DAYS = 30/,'Minhas Artes deve guardar criações por 30 dias');
assert.match(commerce,/cf_arte/,'link de e-mail deve conseguir reimportar a criação');
assert.match(prodLoader,/canecafacil-commerce-runtime-v1\.js/,'loader de produção deve carregar Minhas Artes e bridge');
assert.equal(prodLoader.includes('temporary-product-privacy-v1.js'),false,'produção não deve depender de produto temporário');

assert.match(inlineV1,/TEST_PARAM = 'cf_personalizador'/,'inline V1 deve continuar restrito a homologação');
assert.equal(inlineV1.includes('/canecas/personalizadas/'),false,'inline de homologação não pode gravar criação');
assert.equal(/method:\s*['"](?:PUT|PATCH|DELETE)['"]/.test(inlineV1),false,'inline V1 deve ser somente leitura no Firebase');
assert.match(inlineV1,/APROVAR E COMPRAR · EM BREVE/,'homologação não pode comprar');

assert.match(orderWorker,/CF-\\d\{6\}-\[A-Z0-9\]/,'sincronizador deve reconhecer CF-ID');
assert.match(orderWorker,/canecas\/personalizadas/,'pedido deve recuperar criação personalizada');
assert.match(orderWorker,/canecas\/pedidos/,'pedido deve entrar no Admin Canecas');
assert.match(orderWorker,/canecas\/print_jobs/,'pedido pago deve gerar fila de impressão');
assert.match(orderWorker,/criacao_id:/,'item deve carregar ID da criação');
assert.match(orderWorker,/personalizada:true/,'item do Admin deve ser marcado como personalizado');
assert.match(orderWorker,/quantidade:qty/,'item personalizado deve preservar a quantidade do CF-ID');
assert.match(orderWorker,/quantidade:item\.quantidade/,'fila de impressão deve receber a quantidade da arte');
assert.match(orderWorker,/quantidade_personalizada_total/,'pedido deve registrar total de unidades personalizadas');
assert.match(creationStatus,/Arte criada · ainda não encomendada/,'Admin deve distinguir arte sem compra');
assert.match(creationStatus,/Paga · pronta para produção/,'Admin deve distinguir encomenda paga');

console.log('OK CanecaFácil V15: Admin completo, cliente sem produto temporário, limite de geração, quantidade por CF-ID, Minhas Artes, produto original no carrinho e CF-ID ligado à produção.');