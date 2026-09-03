const FIREBASE = (process.env.FIREBASE_BASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/$/, '');
const QUEUE = 'canecas/integracoes/github_ops/fila';
const text = value => String(value ?? '').trim();

async function get(path) {
  const r = await fetch(`${FIREBASE}/${path}.json`, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Firebase ${r.status}`);
  return r.json();
}

const queue = (await get(QUEUE).catch(() => ({}))) || {};
const rows = Object.entries(queue).map(([id, item]) => ({
  id,
  action: text(item?.action),
  status: text(item?.status) || 'vazio',
  atualizado_em: text(item?.atualizado_em || item?.criado_em || item?.solicitado_em),
}));
const byStatus = {};
const byAction = {};
for (const row of rows) {
  byStatus[row.status] = (byStatus[row.status] || 0) + 1;
  byAction[row.action || '(sem ação)'] = (byAction[row.action || '(sem ação)'] || 0) + 1;
}
const pending = rows.filter(row => ['pendente','erro','vazio'].includes(row.status));
console.log(`GITHUB OPS INVENTORY · total=${rows.length} · pendentes_processaveis=${pending.length}`);
console.log(`GITHUB OPS INVENTORY · status=${JSON.stringify(byStatus)}`);
console.log(`GITHUB OPS INVENTORY · acoes=${JSON.stringify(byAction)}`);
for (const row of pending.slice(0, 20)) console.log(`PENDENTE · id=${row.id} · ação=${row.action || '(vazia)'} · status=${row.status} · em=${row.atualizado_em || '(sem data)'}`);
console.log('GITHUB OPS INVENTORY · somente leitura · nenhuma operação executada · Make não utilizado.');
