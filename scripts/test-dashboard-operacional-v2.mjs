import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const index = read('admin-canecas', 'index.html');
const dashboard = read('admin-canecas', 'dashboard-operations-v2.js');
const production = read('admin-canecas', 'production-release-status-v1.js');

assert.match(index, /dashboard-operations-v2\.js\?v=20260903-1/, 'Admin deve carregar Dashboard operacional V2');
assert.match(index, /production-release-status-v1\.js\?v=20260903-1/, 'Admin deve carregar produção baseada em snapshot compartilhado');

for (const pathName of [
  'canecas/pedidos',
  'canecas/personalizadas',
  'canecas/print_jobs',
  'canecas/integracoes/loja_integrada/fila',
  'canecas/integracoes/loja_integrada/midia_fila',
  'canecas/integracoes/github_ops/prontidao_corte_make',
]) assert.ok(dashboard.includes(pathName), `Dashboard deve carregar ${pathName}`);

assert.match(dashboard, /paidOrder\(order = \{\}\)/, 'Dashboard deve identificar pagamento separadamente');
assert.match(dashboard, /releasedOrder\(order = \{\}\)/, 'Dashboard deve exigir liberação de produção');
assert.match(dashboard, /paidAwaitingRelease/, 'Dashboard deve separar pagos aguardando liberação');
assert.match(dashboard, /releasedNoPrint/, 'Dashboard deve detectar liberados sem fila de impressão');
assert.match(dashboard, /Criações e conversão/, 'Dashboard deve apresentar funil de criações');
assert.match(dashboard, /Arte → pedido/, 'Dashboard deve calcular conversão de arte para pedido');
assert.match(dashboard, /Arte → pagamento/, 'Dashboard deve calcular conversão de arte para pagamento');
assert.match(dashboard, /Atenção necessária/, 'Dashboard deve priorizar tarefas acionáveis');
assert.match(dashboard, /Produtos · Loja Integrada/, 'Dashboard deve mostrar fila de produto Loja Integrada');
assert.match(dashboard, /Mídia da vitrine/, 'Dashboard deve mostrar fila de mídia');
assert.match(dashboard, /GitHub \$\{core\.total/, 'Dashboard deve exibir prontidão GitHub');
assert.match(dashboard, /admin-canecas:ops-snapshot/, 'Dashboard deve publicar snapshot operacional compartilhado');
assert.match(dashboard, /window\.__CF_ADMIN_OPS_SNAPSHOT__/, 'snapshot deve ficar disponível para módulos relacionados');
assert.match(dashboard, /observer\.observe\(root, \{ childList: true \}\)/, 'observer do Dashboard deve ficar restrito ao próprio #dashboard');
assert.equal(/observer\.observe\(document\.(body|documentElement)/.test(dashboard), false, 'Dashboard não pode observar o documento inteiro');

assert.match(production, /admin-canecas:ops-snapshot/, 'produção deve consumir snapshot do Dashboard');
assert.match(production, /dashboard_snapshot/, 'produção deve registrar origem do snapshot compartilhado');
assert.match(production, /fallbackOrders/, 'produção deve possuir fallback quando o Dashboard não foi carregado');
assert.match(production, /setInterval\(refreshAlerts, 30_000\)/, 'somente alertas devem manter atualização rápida');
assert.match(production, /120_000/, 'fallback de pedidos deve ser lento e controlado');
assert.match(production, /ordersObserver\.observe\(root, \{ childList:true \}\)/, 'observer de pedidos deve ficar restrito a #orders');
assert.equal(/observer\.observe\(document\.(body|documentElement)/.test(production), false, 'produção não pode observar o documento inteiro');
assert.equal(/setInterval\(refresh\s*,\s*30000\)/.test(production), false, 'produção não pode reler pedidos completos a cada 30 segundos');
assert.equal(/Promise\.all\(\[get\(ORDERS\)/.test(production), false, 'alertas não devem disparar leitura acoplada de pedidos');

console.log('OK Dashboard Operacional V2: prioridades, produção, funil, filas GitHub e snapshot compartilhado sem observer global.');
