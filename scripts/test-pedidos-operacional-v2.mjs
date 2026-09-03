import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = path => fs.readFileSync(path,'utf8');
const index = read('admin-canecas/index.html');
const manager = read('admin-canecas/orders-manager-v2.js');
const print = read('caneca-print/index.html');
const link = read('loja-integrada/personalized-order-link-hardening-v1.js');
const loader = read('loja-integrada/loader-personalizador-inline-producao.js');
const personalized = read('scripts/sincronizar-pedidos-personalizados-li.mjs');
const allMugs = read('scripts/sincronizar-pedidos-canecas-li-v2.mjs');
const workflow = read('.github/workflows/sincronizar-pedidos-personalizados-li.yml');

assert.match(index,/orders-manager-v2\.js\?v=20260903-1/,'Admin deve carregar Pedidos V2');
assert.match(manager,/function\s+liOrder\s*\(/,'Pedidos V2 deve distinguir pedido Loja Integrada');
assert.match(manager,/Fonte autoritativa: Loja Integrada/,'Pagamento LI deve ser somente leitura');
assert.match(manager,/if\(liOrder\(o\)\) return toast\('Pagamento da Loja Integrada não pode ser confirmado manualmente\.'/,'Confirmação manual deve bloquear pedido LI');
assert.match(manager,/CONFIRMAR PAGAMENTO/,'Pedido manual deve ter ação única de confirmação');
assert.match(manager,/buildPrintJob\(/,'Confirmação manual deve validar e gerar fila pela regra compartilhada');
assert.match(manager,/Novo pedido manual/,'Admin deve permitir pedido manual funcional');
assert.match(manager,/tipo_pedido/,'Pedido manual deve guardar tipo');
assert.match(manager,/orderTotal\(/,'Lista deve exibir valor do pedido');

assert.match(print,/function\s+jobReleased\s*\(j=\{\}\)\{return norm\(j\.pagamento_status\)==='pago'&&j\.liberado_producao===true\}/,'Caneca Print deve exigir pago + liberação');
assert.match(print,/PRODUÇÃO BLOQUEADA: este pedido não possui pagamento confirmado e liberação de produção/,'Clique de impressão deve revalidar gate');
assert.match(print,/status:'pronto_envio'/,'Conclusão de todos os jobs deve promover pedido a pronto para envio');
assert.match(print,/status:'producao'/,'Início/reimpressão deve colocar pedido em produção');

assert.match(link,/CanecaFácil PERSONALIZADA:/,'Checkout deve persistir CF-ID em observação quando disponível');
assert.match(link,/pedido_id_hint/,'Confirmação deve registrar pedido_id_hint no Firebase');
assert.match(link,/canecas\/encomendas_pendentes/,'Hint deve chegar à encomenda pendente');
assert.match(loader,/personalized-order-link-hardening-v1\.js/,'Loader de produção deve carregar hardening de vínculo');

assert.match(personalized,/function\s+mergeNonBlank/,'Worker personalizado não deve sobrescrever dados bons com vazio');
assert.match(personalized,/pagamento_autoritativo:true/,'Pedido LI deve marcar pagamento autoritativo');
assert.match(personalized,/liberado_producao:released/,'Worker personalizado deve liberar produção na mesma passagem');
assert.match(personalized,/origem_liberacao:'loja_integrada_pagamento_aprovado'/,'Print job personalizado deve nascer com origem de liberação');
assert.match(personalized,/FALLBACK_EMAIL_PRODUTO/,'Fallback ambíguo deve ficar visível no log');

assert.match(allMugs,/CATALOGO_CANECAS/,'Worker geral deve mapear catálogo de canecas');
assert.match(allMugs,/tipo_pedido:personalized\.length \? \(standard\.length\?'misto':'personalizado'\) : 'padronizado'/,'Worker deve classificar pedido padronizado/personalizado/misto');
assert.match(allMugs,/function\s+personalizedOrderLikely/,'Worker geral deve proteger personalização pendente');
assert.match(allMugs,/PROTEGIDO_PERSONALIZACAO_PENDENTE/,'Pedido possivelmente personalizado não pode virar padrão silenciosamente');
assert.match(allMugs,/preservedPersonalized/,'Itens personalizados existentes devem ser preservados');
assert.match(allMugs,/ensureStandardJobs/,'Caneca padronizada paga deve alimentar impressão');
assert.match(allMugs,/pagamento_autoritativo:true/,'Pedido geral da LI deve manter autoridade de pagamento');
assert.match(allMugs,/mergeNonBlank/,'Worker geral deve preservar dados locais válidos');

assert.match(workflow,/sincronizar-pedidos-canecas-li-v2\.mjs/,'Workflow deve sincronizar todo pedido com caneca');
assert.match(workflow,/Garantir pagamento e liberação antes da produção/,'Reconciliação de liberação deve permanecer como reparo');
assert.match(workflow,/if: always\(\)/,'Reconciliação deve executar mesmo se worker anterior falhar');

console.log('OK Pedidos V2: pagamento LI autoritativo, impressão bloqueada, CF-ID forte, pedidos padronizados e ciclo produção→envio protegidos.');