import { formatBRL } from '../../../core/money';

export function StickySummary({
  stage,
  basketTotal,
  orderTotal,
  canContinue,
  onContinue,
}: {
  stage: 'basket' | 'extras';
  basketTotal: number;
  orderTotal: number;
  canContinue: boolean;
  onContinue: () => void;
}) {
  return (
    <footer className="sticky-summary" aria-label="Resumo fixo do pedido">
      <div>
        <small>{stage === 'basket' ? 'Total da cesta' : 'Cesta + extras'}</small>
        <strong>{formatBRL(stage === 'basket' ? basketTotal : orderTotal)}</strong>
      </div>
      <button type="button" className="primary-button" disabled={!canContinue} onClick={onContinue}>
        {stage === 'basket' ? 'Próximo →' : 'Finalizar pedido →'}
      </button>
    </footer>
  );
}
