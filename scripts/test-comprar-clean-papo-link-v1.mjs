import fs from 'node:fs';
import assert from 'node:assert/strict';

const migrationPath='supabase/migrations/20260917203500_papo_comprar_link_delivery_v1.sql';
const edgePath='supabase/functions/papo-comprar-webhook-v1/index.ts';

assert.ok(fs.existsSync(migrationPath),'migration da ponte de entrega do link deve existir');
const migration=fs.readFileSync(migrationPath,'utf8');
assert.match(migration,/dona_antonia_papo_comprar_outbound_make_url_v1/,'URL privada da ponte deve ficar no Vault');
assert.match(migration,/dona_antonia_papo_comprar_outbound_make_token_v1/,'token da ponte deve ficar no Vault');
assert.match(migration,/get_dona_antonia_papo_comprar_outbound_bridge_v1/,'backend deve obter configuração da ponte via RPC');
assert.match(migration,/grant execute .* service_role/is,'configuração da ponte deve ser exclusiva do service role');
assert.doesNotMatch(migration,/hook\.eu1\.make\.com\/[A-Za-z0-9_-]{10,}/i,'webhook real do Make nunca pode entrar no repositório');

const edge=fs.readFileSync(edgePath,'utf8');
assert.match(edge,/async function dispatchShoppingLink\s*\(/,'webhook deve possuir entrega isolada do link');
assert.match(edge,/get_dona_antonia_papo_comprar_outbound_bridge_v1/,'webhook deve ler a ponte do Vault');
assert.match(edge,/shopping_url/,'payload de entrega deve conter o link personalizado');
assert.match(edge,/customer_found/,'payload deve declarar identidade encontrada');
assert.match(edge,/matchedCustomerId\?await dispatchShoppingLink/,'somente cliente identificado recebe link automático nesta etapa');
assert.match(edge,/link_delivery/,'resposta deve expor estado da entrega para diagnóstico');
assert.match(edge,/catch\s*\([^)]*\)\s*\{[^}]*bridge_error/s,'falha de entrega não pode derrubar a identificação');

const roadmap=fs.readFileSync('docs/PAPOAI-COMPRAR-EVOLUCAO-ROADMAP-20260917.md','utf8');
assert.match(roadmap,/Etapa 1B .*link personalizado/i,'roadmap deve registrar a entrega do link personalizado');
assert.match(roadmap,/ponte temporária/i,'roadmap deve registrar que a ponte outbound é temporária');

console.log('PASS: PapoAI → Comprar entrega de link V1');
