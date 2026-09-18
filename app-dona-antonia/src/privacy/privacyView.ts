import type { NotificationPreferences } from './preferences.ts';

export function renderPrivacyCenter(
  preferences: NotificationPreferences,
): string {
  return `
    <div class="privacy-center" data-privacy-center>
      <div class="privacy-heading">
        <small>Homologação</small>
        <h2>Privacidade e preferências</h2>
        <p>Controle suas preferências e veja como seus dados serão tratados.</p>
      </div>

      <section class="privacy-card">
        <div>
          <strong>Notificações do pedido</strong>
          <p>Atualizações operacionais sobre seus pedidos.</p>
        </div>
        <button
          type="button"
          data-privacy-transactional
          aria-pressed="${preferences.transactionalPushEnabled}"
        >
          ${preferences.transactionalPushEnabled ? 'Ativadas' : 'Desativadas'}
        </button>
      </section>

      <section class="privacy-card">
        <div>
          <strong>Ofertas e novidades</strong>
          <p>Marketing é opcional e começa desativado.</p>
        </div>
        <button
          type="button"
          data-privacy-marketing
          aria-pressed="${preferences.marketingPushOptIn}"
        >
          ${preferences.marketingPushOptIn ? 'Ativadas' : 'Desativadas'}
        </button>
      </section>

      <section class="privacy-rights">
        <h3>Seus direitos</h3>
        <p>Nesta homologação, a solicitação é preparada apenas para teste e não é enviada para produção.</p>
        <div>
          <button type="button" data-privacy-request="access">Solicitar acesso</button>
          <button type="button" data-privacy-request="correction">Solicitar correção</button>
          <button type="button" data-privacy-request="deletion">Solicitar exclusão</button>
          <button type="button" data-privacy-request="revoke_device">Revogar este aparelho</button>
        </div>
      </section>
    </div>
  `.trim();
}
