import assert from 'node:assert/strict';
import fs from 'node:fs';

const strategy=fs.readFileSync('vitrine/admin/marketing/strategy-center.js','utf8');
const css=fs.readFileSync('vitrine/admin/marketing/strategy-center.css','utf8');
const config=fs.readFileSync('supabase/config.toml','utf8');
const migration=fs.readFileSync('supabase/migrations/20261021000200_marketing_repurchase_dispatch_v1.sql','utf8');
const apiPath='supabase/functions/admin-marketing-journeys-v1/index.ts';

assert.equal(fs.existsSync(apiPath),true,'a Estrategia precisa de uma API de diagnostico somente leitura');
const api=fs.readFileSync(apiPath,'utf8');

assert.match(api,/marketing_journeys_health_status_v1/,'a API deve delegar ao RPC agregado sem expor contatos');
assert.match(api,/admin_users/,'a API deve autorizar apenas administradores ativos');
assert.match(api,/req\.method!=="GET"/,'o diagnostico nao deve aceitar mutacoes');
assert.match(api,/Cache-Control":"no-store"/,'o estado operacional nao deve ficar em cache');
assert.match(api,/action"\)!=="status"/,'a API deve limitar a acao ao status');
assert.doesNotMatch(api,/phone_e164|customer_id|order_id/,'a resposta do diagnostico nao deve montar PII');

assert.match(config,/\[functions\.admin-marketing-journeys-v1\][\s\S]*?verify_jwt\s*=\s*true/,'o gateway deve exigir JWT para a API de diagnostico');
assert.match(migration,/create or replace function public\.marketing_journeys_health_status_v1\(\)/i,'a migration deve fornecer o estado real das jornadas');
assert.match(migration,/'post_sale_20d'/,'o RPC deve reportar D+20 separadamente');
assert.match(migration,/'repurchase_28d'/,'o RPC deve reportar D+28 separadamente');

assert.match(strategy,/admin-marketing-journeys-v1/,'a Estrategia deve consultar a API canonica');
assert.match(strategy,/data-strategy-journeys/,'a tela deve reservar um status acessivel para as jornadas');
assert.match(strategy,/data-strategy-journeys-refresh/,'a tela deve permitir atualizar o diagnostico');
assert.match(strategy,/Carrossel das 5 cestas/,'a tela deve identificar a jornada D+20');
assert.match(strategy,/Reposi(?:c|ç)(?:a|ã)o mensal fixa/,'a tela deve identificar a jornada D+28');
assert.match(strategy,/Runtime desligado/,'o estado seguro desligado deve ficar explicito');
assert.match(strategy,/Templates? Meta/,'o bloqueio de template deve aparecer no diagnostico');
assert.match(strategy,/Cron n(?:a|ã)o cadastrado/,'cron ausente nao pode parecer saudavel');
assert.match(strategy,/Promise\.allSettled\(\[populateAccounts\(\),refreshJourneyHealth\(\)\]\)/,'falha no diagnostico nao deve impedir o restante da Estrategia');
assert.doesNotMatch(strategy,/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEYS/,'a UI nao pode receber credenciais privilegiadas');
assert.match(css,/\.strategy-journey-cards/,'os dois estados precisam de layout proprio');
assert.match(css,/@media\(max-width:760px\)[^{]*\{[^}]*\.strategy-journey-cards\{grid-template-columns:1fr\}/,'o diagnostico deve empilhar no celular');

console.log('marketing journey health UI contract: ok');
