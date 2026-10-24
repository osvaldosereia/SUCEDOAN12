type Stage = 'basket' | 'extras' | 'checkout';

const titles: Record<Stage, string> = {
  basket: 'Monte sua cesta',
  extras: 'Escolha produtos extras',
  checkout: 'Finalize seu pedido',
};

export function WizardHeading({ stage, onBack }: { stage: Stage; onBack: () => void }) {
  return (
    <div className="wizard-heading">
      <div>
        <p className="eyebrow">ETAPA {stage === 'basket' ? 1 : stage === 'extras' ? 2 : 3} DE 3</p>
        <h1>{titles[stage]}</h1>
        <p>
          {stage === 'basket'
            ? 'Escolha o tamanho, a marca e a quantidade de cada tipo de produto.'
            : stage === 'extras'
              ? 'Complete seu pedido se desejar. Todos os extras são opcionais.'
              : 'Confira os produtos e seus dados para a entrega.'}
        </p>
      </div>
      {stage !== 'basket' && (
        <button type="button" className="back-link" onClick={onBack}>
          ← Voltar
        </button>
      )}
    </div>
  );
}
