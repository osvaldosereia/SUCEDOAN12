import type { AppRoute } from './navigation.ts';

export type ShellState = 'ready' | 'loading' | 'empty' | 'error' | 'offline';

export interface AppShellOptions {
  route: AppRoute;
  state: ShellState;
}

const STATE_COPY: Record<ShellState, { title: string; detail: string }> = {
  ready: {
    title: 'Tudo pronto para começar',
    detail: 'Escolha uma opção abaixo para continuar o atendimento de homologação.',
  },
  loading: {
    title: 'Carregando',
    detail: 'Preparando esta etapa do atendimento.',
  },
  empty: {
    title: 'Nada por aqui ainda',
    detail: 'Esta área será preenchida nas próximas rodadas.',
  },
  error: {
    title: 'Não foi possível abrir esta etapa',
    detail: 'Tente novamente. Nenhum pedido foi enviado.',
  },
  offline: {
    title: 'Sem conexão',
    detail: 'Você pode continuar vendo esta tela, mas não vamos confirmar pedidos sem internet.',
  },
};

export function renderAppShell({ route, state }: AppShellOptions): string {
  const copy = STATE_COPY[state];

  return `
    <div class="app-shell" data-app-shell data-route="${route}">
      <header class="app-topbar" data-shell="topbar">
        <div class="brand-lockup" aria-label="Dona Antônia">
          <span class="brand-mark" aria-hidden="true">DA</span>
          <span class="brand-copy">
            <strong>Dona Antônia</strong>
            <small>Compras</small>
          </span>
        </div>
        <span class="environment-badge">Homologação</span>
      </header>

      <main class="app-content">
        <section class="conversation-region" data-shell="conversation" aria-live="polite" aria-label="Conversa">
          <div class="message assistant-message">
            <p>Olá! Como posso ajudar?</p>
          </div>

          <div class="quick-actions" aria-label="Opções principais">
            <button type="button" data-route-target="basket">Cestas</button>
            <button type="button" data-route-target="catalog">Ofertas</button>
            <button type="button" data-route-target="catalog">Para Você</button>
            <button type="button" data-route-target="catalog">Para Casa</button>
          </div>
        </section>

        <section class="tool-region" data-shell="tool" data-state="${state}" aria-label="Área de atendimento">
          <div class="state-card">
            <span class="state-dot" aria-hidden="true"></span>
            <div>
              <strong>${copy.title}</strong>
              <p>${copy.detail}</p>
            </div>
          </div>
        </section>
      </main>

      <footer class="order-bar" data-shell="order-bar">
        <div>
          <span>Seu pedido</span>
          <strong>0 itens</strong>
        </div>
        <button type="button" data-route-target="cart" aria-label="Ver pedido">Ver pedido</button>
      </footer>
    </div>
  `.trim();
}
