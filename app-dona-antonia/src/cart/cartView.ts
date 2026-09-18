import { calculateCartTotal, effectiveUnitPrice } from './cartMath.ts';
import type { CartLine, CartSnapshot } from './types.ts';

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

function renderLine(line: CartLine): string {
  const unitPrice = effectiveUnitPrice(line);
  const hasPromo = unitPrice < line.unitPriceCents;

  return `
    <article class="cart-line" data-cart-line="${escapeHtml(line.id)}">
      <div class="cart-line-copy">
        <span class="cart-line-kind">${line.kind === 'basket' ? 'Cesta' : 'Produto'}</span>
        <strong>${escapeHtml(line.name)}</strong>
        <div class="cart-line-price">
          ${hasPromo ? `<del>${money(line.unitPriceCents)}</del>` : ''}
          <b>${money(unitPrice)}</b>
          <small>cada</small>
        </div>
      </div>

      <div class="cart-line-actions">
        <div class="quantity-control" aria-label="Quantidade de ${escapeHtml(line.name)}">
          <button
            type="button"
            data-cart-decrease="${escapeHtml(line.id)}"
            aria-label="Diminuir quantidade"
            ${line.quantity <= 1 ? 'disabled' : ''}
          >−</button>
          <span aria-label="Quantidade atual">${line.quantity}</span>
          <button
            type="button"
            data-cart-increase="${escapeHtml(line.id)}"
            aria-label="Aumentar quantidade"
          >+</button>
        </div>

        <button
          type="button"
          class="cart-remove"
          data-cart-remove="${escapeHtml(line.id)}"
        >Remover</button>
      </div>

      <strong class="cart-line-total">${money(unitPrice * line.quantity)}</strong>
    </article>
  `.trim();
}

export function renderCart(cart: CartSnapshot): string {
  const summary = calculateCartTotal(cart);

  if (cart.lines.length === 0) {
    return `
      <div class="cart-view cart-empty" data-cart-view>
        <small>Pedido de homologação</small>
        <h2>Seu pedido está vazio</h2>
        <p>Escolha uma cesta ou adicione produtos para continuar.</p>
        <button type="button" data-route-target="catalog">Ver produtos</button>
      </div>
    `.trim();
  }

  return `
    <div class="cart-view" data-cart-view>
      <div class="cart-heading">
        <div>
          <small>Pedido de homologação</small>
          <h2>Revise seu pedido</h2>
        </div>
        <span>${summary.itemCount} ${summary.itemCount === 1 ? 'item' : 'itens'}</span>
      </div>

      <div class="cart-lines">
        ${cart.lines.map(renderLine).join('')}
      </div>

      <div class="cart-summary">
        ${summary.savingsCents > 0 ? `
          <div>
            <span>Economia em ofertas</span>
            <strong>${money(summary.savingsCents)}</strong>
          </div>
        ` : ''}
        <div class="cart-summary-total">
          <span>Total</span>
          <strong>${money(summary.totalCents)}</strong>
        </div>
      </div>

      <button type="button" class="cart-clear" data-cart-clear>
        Limpar pedido
      </button>

      <p class="homologation-note">
        Este é um pedido fictício. A finalização será implementada somente na próxima rodada.
      </p>
    </div>
  `.trim();
}
