import fs from 'node:fs';

function read(path){ return fs.readFileSync(path,'utf8'); }
function ok(condition,message){ if(!condition) throw new Error(message); console.log('OK · '+message); }

const index=read('admin-canecas/index.html');
const product=read('admin-canecas/product-admin-config-v2.js');
const personal=read('admin-canecas/personalization-settings-v2.js');
const catalog=read('scripts/atualizar-catalogo-loja-integrada-v1.mjs');

ok(index.includes('product-admin-config-v2.js'),'Admin carrega configuração de cadastro/publicação V2');
ok(index.includes('personalization-settings-v2.js'),'Admin carrega configuração global da personalização V2');

ok(product.includes("canecas/integracoes/loja_integrada/catalog_refs"),'Cadastro usa catálogo real da Loja Integrada salvo pelo GitHub');
ok(catalog.includes("listAll('/categoria')") || catalog.includes('listAll("/categoria")'),'Worker GitHub consulta categorias diretamente na Loja Integrada');
ok(catalog.includes('categorias_lista'),'Worker persiste lista estruturada de categorias para o Admin');
ok(product.includes('ativo: true') && product.includes('visivel: true') && product.includes('a_venda: true'),'Ativo, Visível e À venda nascem ligados por padrão');
ok(product.includes('loja_integrada_ativo') && product.includes('canecafacil_ativo'),'Status Ativo é persistido para a sincronização GitHub');
ok(product.includes('loja_integrada_visivel') && product.includes('loja_integrada_a_venda'),'Intenção de Visível e À venda fica registrada por produto');
ok(product.includes("tipo_producao: 'revenda'") && product.includes("origem_mercadoria: '0'") && product.includes("ncm: '69111090'"),'Fiscal padrão centralizado: Revenda, origem 0 e NCM de caneca');
ok(product.includes('API pública da Loja Integrada não oferece esses controles'),'Admin não finge sincronizar Visível/À venda fora do contrato público');
ok(product.includes('endpoint público de produto da Loja Integrada não expõe esses dois campos fiscais'),'Admin informa limitação fiscal da API pública');
ok(!/make\.com|callMake|makeWebhook/.test(product),'Cadastro/publicação V2 não chama Make');

for(const id of ['nome','foto','logo','endereco','telefone','site']) ok(personal.includes(`['${id}'`) || personal.includes(`\"${id}\"`),`Seletor ${id} permanece configurável`);
ok(personal.includes('disponivel') && personal.includes('rotulo') && personal.includes('marcado') && personal.includes('obrigatorio'),'Configurações controlam disponibilidade, rótulo, marcação e obrigatoriedade dos seletores');
ok(personal.includes('correcao_padrao'),'Correção pós-geração possui padrão global editável');
ok(personal.includes('prompt_padrao_id'),'Prompt inicial possui padrão global editável');
ok(personal.includes('personalizacao_prompts_ocultos'),'Prompts padrão podem ser excluídos por tombstone persistente');
ok(personal.includes('dataHidePromptV2') || personal.includes('data.hidePromptV2') || personal.includes('dataset.hidePromptV2'),'Prompts internos recebem ação de exclusão');
ok(personal.includes('Restaurar prompts excluídos'),'Prompts excluídos podem ser restaurados');
ok(!/make\.com|callMake|makeWebhook/.test(personal),'Configuração da personalização V2 não chama Make');

console.log('OK · Configurações Admin Canecas V2 validadas.');
