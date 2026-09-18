import { calculateCartTotal } from '../cart/cartMath.ts';
import type {
  CheckoutSnapshot,
  PaymentMethod,
} from './types.ts';

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

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  pix: 'PIX',
  cash: 'Dinheiro',
  credit_card: 'Cartão de crédito',
  meal_card: 'Alimentação/refeição',
};

export function renderCheckout(snapshot: CheckoutSnapshot): string {
  const summary = calculateCartTotal(snapshot.cart);

  if (snapshot.step === 'blocked') {
    return `
      <div class="checkout-view checkout-blocked" data-checkout-view>
        <span class="environment-badge">Homologação</span>
        <h2>Seu pedido está vazio</h2>
        <p>Adicione uma cesta ou produto antes de continuar.</p>
        <button type="button" data-route-target="catalog">Ver produtos</button>
      </div>
    `.trim();
  }

  if (snapshot.step === 'customer') {
    return `
      <div class="checkout-view" data-checkout-view>
        <span class="environment-badge">Homologação</span>
        <small>Etapa 1 de 4</small>
        <h2>Quem vai receber?</h2>
        <form data-checkout-customer>
          <label>Nome<input name="name" autocomplete="name" required /></label>
          <label>Telefone<input name="phone" inputmode="tel" autocomplete="tel" required /></label>
          <button type="submit">Continuar</button>
        </form>
      </div>
    `.trim();
  }

  if (snapshot.step === 'address') {
    return `
      <div class="checkout-view" data-checkout-view>
        <span class="environment-badge">Homologação</span>
        <small>Etapa 2 de 4</small>
        <h2>Onde entregar?</h2>
        <form data-checkout-address>
          <label>Rua<input name="street" autocomplete="address-line1" required /></label>
          <label>Número<input name="number" autocomplete="off" inputmode="numeric" required /></label>
          <label>Bairro<input name="neighborhood" autocomplete="address-level3" required /></label>
          <label>Cidade<input name="city" value="Cuiabá" autocomplete="address-level2" required /></label>
          <label>UF<input name="state" value="MT" maxlength="2" autocomplete="address-level1" required /></label>
          <label>Referência<input name="reference" autocomplete="off" /></label>
          <button type="submit">Continuar</button>
        </form>
      </div>
    `.trim();
  }

  if (snapshot.step === 'payment') {
    return `
      <div class="checkout-view" data-checkout-view>
        <span class="environment-badge">Homologação</span>
        <small>Etapa 3 de 4</small>
        <h2>Como prefere pagar?</h2>
        <div class="checkout-payment-options">
          ${(Object.entries(PAYMENT_LABELS) as [PaymentMethod, string][]).map(([id, label]) => `
            <button type="button" data-checkout-payment="${id}">${label}</button>
          `).join('')}
        </div>
        <p>Pagamento somente na entrega. Nenhuma cobrança acontece neste app de teste.</p>
      </div>
    `.trim();
  }

  if (snapshot.step === 'review') {
    const customer = snapshot.customer!;
    const address = snapshot.address!;
    const payment = snapshot.payment!;

    return `
      <div class="checkout-view" data-checkout-view>
        <span class="environment-badge">Homologação</span>
        <small>Etapa 4 de 4</small>
        <h2>Revise antes de confirmar</h2>
        <div class="checkout-review-card">
          <div><span>Cliente</span><strong>${escapeHtml(customer.name)}</strong></div>
          <div><span>Entrega</span><strong>${escapeHtml(address.street)}, ${escapeHtml(address.number)} · ${escapeHtml(address.neighborhood)}</strong></div>
          <div><span>Pagamento</span><strong>${PAYMENT_LABELS[payment]}</strong></div>
          <div><span>Total</span><strong>${money(summary.totalCents)}</strong></div>
        </div>
        <button type="button" class="checkout-confirm" data-checkout-confirm>
          Confirmar pedido de teste
        </button>
        <p class="homologation-note">Nenhum dado será enviado para produção.</p>
      </div>
    `.trim();
  }

  if (snapshot.step === 'confirmed' && snapshot.result) {
    return `
      <div class="checkout-view checkout-confirmed" data-checkout-view>
        <span class="environment-badge">Homologação</span>
        <small>Pedido fictício confirmado</small>
        <h2>Pedido recebido para teste</h2>
        <strong class="checkout-order-id">${escapeHtml(snapshot.result.orderId)}</strong>
        <p>Este número existe somente nesta homologação.</p>
        <button type="button" data-route-target="order">Acompanhar pedido</button>
      </div>
    `.trim();
  }

  return `
    <div class="checkout-view" data-checkout-view>
      <span class="environment-badge">Homologação</span>
      <h2>Checkout ainda não iniciado</h2>
      <button type="button" data-route-target="cart">Voltar ao pedido</button>
    </div>
  `.trim();
}
