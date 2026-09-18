import type { Basket } from './types.ts';

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

export function renderBasketList(baskets: Basket[]): string {
  return `
    <div class="basket-view" data-basket-view>
      <div class="basket-heading">
        <div>
          <small>Cestas de homologação</small>
          <h2>Escolha sua cesta</h2>
        </div>
        <span>${baskets.length} opções</span>
      </div>

      <div class="basket-grid">
        ${baskets.map((basket) => `
          <article class="basket-card">
            <button
              type="button"
              class="basket-card-open"
              data-basket-open="${escapeHtml(basket.id)}"
              aria-label="Ver ${escapeHtml(basket.name)}"
            >
              <span class="basket-card-visual" aria-hidden="true">
                <span>DA</span>
              </span>
              <span class="basket-card-copy">
                ${basket.badge ? `<span class="basket-badge">${escapeHtml(basket.badge)}</span>` : ''}
                <strong>${escapeHtml(basket.name)}</strong>
                <small>${escapeHtml(basket.description)}</small>
                <span class="basket-card-meta">${basket.items.length} tipos de itens</span>
                <b>${money(basket.priceCents)}</b>
              </span>
            </button>
          </article>
        `).join('')}
      </div>
    </div>
  `.trim();
}

export function renderBasketDetail(basket: Basket): string {
  return `
    <article class="basket-detail" data-basket-detail="${escapeHtml(basket.id)}">
      <button type="button" class="basket-detail-back" data-basket-close>
        Voltar
      </button>

      <div class="basket-detail-header">
        ${basket.badge ? `<span class="basket-badge">${escapeHtml(basket.badge)}</span>` : ''}
        <small>Cesta de homologação</small>
        <h2>${escapeHtml(basket.name)}</h2>
        <p>${escapeHtml(basket.description)}</p>
        <strong class="basket-total">${money(basket.priceCents)}</strong>
      </div>

      <div class="basket-composition">
        <div class="basket-composition-heading">
          <strong>O que vem na cesta</strong>
          <small>Sem preço individual por item</small>
        </div>
        <ul>
          ${basket.items.map((item) => `
            <li>
              <span>${item.quantity} × ${escapeHtml(item.name)}</span>
              <small>${escapeHtml(item.unit)}</small>
            </li>
          `).join('')}
        </ul>
      </div>

      <button
        type="button"
        class="basket-confirm"
        data-basket-confirm="${escapeHtml(basket.id)}"
      >
        Escolher esta cesta
      </button>

      <p class="homologation-note">
        Cesta fictícia para teste. A personalização e o carrinho serão ativados nas próximas rodadas.
      </p>
    </article>
  `.trim();
}
