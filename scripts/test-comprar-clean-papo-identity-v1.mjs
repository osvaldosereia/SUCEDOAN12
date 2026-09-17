import fs from 'node:fs';
import assert from 'node:assert/strict';

const roadmap=fs.readFileSync('docs/PAPOAI-COMPRAR-EVOLUCAO-ROADMAP-20260917.md','utf8');
assert.match(roadmap,/Etapa 1 — Identidade PapoAI → Comprar/);
for(const n of [2,3,4,5,6]) assert.match(roadmap,new RegExp(`Etapa ${n} .*FUTURA`),`Etapa ${n} deve permanecer futura`);

const migrationPath='supabase/migrations/20260917160500_papo_comprar_identity_v1.sql';
const edgePath='supabase/functions/papo-comprar-webhook-v1/index.ts';
const uiPath='comprar/papo-identity-ui.js';
assert.ok(fs.existsSync(migrationPath),'migration segura do webhook PapoAI deve existir');
assert.ok(fs.existsSync(edgePath),'Edge Function do webhook PapoAI deve existir');
assert.ok(fs.existsSync(uiPath),'camada de identidade visual do PapoAI deve existir');

const migration=fs.readFileSync(migrationPath,'utf8');
assert.match(migration,/dona_antonia_papo_comprar_webhook_token_v1/,'segredo deve ficar no Vault');
assert.match(migration,/get_dona_antonia_papo_comprar_webhook_token_v1/,'deve existir getter service-role do segredo');
assert.match(migration,/grant execute .* service_role/is,'getter deve ser exclusivo do backend');

const edge=fs.readFileSync(edgePath,'utf8');
assert.match(edge,/get_dona_antonia_papo_comprar_webhook_token_v1/,'webhook deve validar segredo do Vault');
assert.match(edge,/lookup_customer_by_phone/,'identidade comercial deve ser consultada por telefone');
assert.match(edge,/room_start_for_conversation_v1/,'webhook deve reutilizar a infraestrutura oficial de sala');
assert.match(edge,/whatsapp_accounts/,'webhook deve usar a conta WhatsApp ativa do banco');
assert.match(edge,/customer_found/,'resposta deve indicar se o cliente foi identificado');
assert.match(edge,/shopping_url/,'resposta deve devolver URL opaca para o Comprar');
assert.doesNotMatch(edge,/lookup_customer_by_name|\.eq\(['"]name['"]/i,'nome não pode ser usado como chave de identidade');

const ui=fs.readFileSync(uiPath,'utf8');
assert.match(ui,/function\s+customerFirstName\s*\(/,'Comprar deve ter helper de primeiro nome');
assert.match(ui,/Oi, \$\{firstName\}/,'saudação deve usar primeiro nome quando conhecido');
assert.match(ui,/originalStart/,'camada deve preservar o start original');
const root=fs.readFileSync('index.html','utf8'),nested=fs.readFileSync('comprar/index.html','utf8');
assert.match(root,/\/comprar\/papo-identity-ui\.js\?v=/,'raiz deve carregar identidade PapoAI');
assert.match(nested,/\.\/papo-identity-ui\.js\?v=/,'/comprar deve carregar identidade PapoAI');

const app=fs.readFileSync('comprar/app.js','utf8');
assert.match(app,/Olá! Como posso ajudar na sua compra\?/,'fallback genérico deve permanecer');

const conversation=fs.readFileSync('comprar/conversation.js','utf8');
const checkoutStart=conversation.indexOf('async function openCheckoutConversation');
const checkoutEnd=conversation.indexOf('async function renderIdentificationStep');
const checkout=conversation.slice(checkoutStart,checkoutEnd);
assert.match(checkout,/state\.checkout\?\.customer\|\|state\.customer/,'checkout deve reaproveitar cliente vindo da sessão');
assert.match(checkout,/if\(checkoutFlow\.profile\?\.customer_id\)await renderAddressStep\(\);else await renderIdentificationStep\(\)/,'cliente conhecido deve pular digitação de telefone');

console.log('PASS: PapoAI → Comprar identidade V1');