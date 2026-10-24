type Stage = 'basket' | 'extras' | 'checkout';
const STEPS = [
  { id: 'basket', label: 'Sua cesta' },
  { id: 'extras', label: 'Produtos extras' },
  { id: 'checkout', label: 'Finalizar' },
] as const;
/** Indicador informativo; mudanças de etapa ocorrem apenas pelas ações do fluxo. */
export function StorefrontProgress({ stage }: { stage: Stage }) {
  const active = STEPS.findIndex((step) => step.id === stage);
  return (
    <nav className="checkout-progress" aria-label="Progresso do pedido">
      {STEPS.map((step, index) => (
        <div
          key={step.id}
          className={
            'progress-step' +
            (index === active ? ' current' : '') +
            (index < active ? ' completed' : '')
          }
          aria-current={index === active ? 'step' : undefined}
        >
          <span className="progress-number">{index < active ? '✓' : index + 1}</span>
          <span>{step.label}</span>
        </div>
      ))}
    </nav>
  );
}
