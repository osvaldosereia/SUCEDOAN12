const requested = Number(process.env.LI_ORDER_LIMIT || 50) || 50;
const safeLimit = Math.max(10, Math.min(50, Math.trunc(requested)));
process.env.LI_ORDER_LIMIT = String(safeLimit);
console.log(`LIMITE_PEDIDOS_PERSONALIZADOS solicitado=${requested} · aplicado=${safeLimit}`);
await import('./sincronizar-pedidos-personalizados-li.mjs');
