import type { OrderRecord, OrderStatus } from './types.ts';

const STATUS_LABELS: Record<OrderStatus, string> = {
  confirmed: 'Pedido confirmado',
  separating: 'Em separação',
  ready: 'Pronto para sair',
  on_route: 'Saiu para entrega',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

const TIMELINE: OrderStatus[] = [
  'confirmed',
  'separating',
  'ready',
  'on_route',
  'delivered',
];

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function money(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100).replace(/\u00a0/g, ' ');
}

function reached(order: OrderRecord, status: OrderStatus): boolean {
  return order.history.some((entry) => entry.status === status);
}

export function renderOrderTracking(order: OrderRecord | null): string {
  if (!order) {
    return `
      <div class="order-tracking order-empty" data-order-tracking>
        <small>Homologação</small>
        <h2>Nenhum pedido de teste</h2>
        <p>Confirme um pedido fictício para testar o acompanhamento.</p>
        <button type="button" data-route-target="cart">Voltar ao pedido</button>
      </div>
    `.trim();
  }

  const terminal = order.status === 'delivered' || order.status === 'cancelled';

  return `
    <div class="order-tracking" data-order-tracking="${escapeHtml(order.id)}">
      <div class="order-tracking-heading">
        <div>
          <small>Homologação · Pedido fictício</small>
          <h2>${escapeHtml(order.id)}</h2>
        </div>
        <strong>${money(order.totalCents)}</strong>
      </div>

      <div class="order-current-status">
        <span>Status atual</span>
        <strong>${STATUS_LABELS[order.status]}</strong>
      </div>

      <ol class="order-timeline">
        ${order.status === 'cancelled'
          ? `
            <li class="is-reached"><span></span><div><strong>Pedido confirmado</strong></div></li>
            <li class="is-cancelled"><span></span><div><strong>Cancelado</strong></div></li>
          `
          : TIMELINE.map((status) => `
            <li class="${reached(order, status) ? 'is-reached' : ''}">
              <span></span>
              <div><strong>${STATUS_LABELS[status]}</strong></div>
            </li>
          `).join('')}
      </ol>

      <div class="order-tracking-actions">
        ${!terminal ? `
          <button
            type="button"
            class="order-demo-advance"
            data-order-advance="${escapeHtml(order.id)}"
          >
            Avançar status de teste
          </button>
        ` : ''}

        <button
          type="button"
          class="order-support"
          data-order-support="${escapeHtml(order.id)}"
        >
          Preciso de ajuda
        </button>
      </div>

      <p class="homologation-note">
        A atualização desta timeline é simulada. Nenhuma entrega real é afetada.
      </p>
    </div>
  `.trim();
}
