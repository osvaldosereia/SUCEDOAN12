import { validateBasketTemplate } from '../../../core/basket';
import type { BasketId, BasketTemplate, ProductType } from '../../../core/model';

interface Props {
  templates: readonly BasketTemplate[];
  selectedBasketId: BasketId;
  setSelectedBasketId: (id: BasketId) => void;
  selectedBasket: BasketTemplate;
  types: readonly ProductType[];
  setQuantity: (typeId: string, quantity: number) => void;
  privateFeeCents: number;
  onPrivateFeeChange: (cents: number) => void;
  canManagePrivatePricing: boolean;
}
export function BasketCompositionPanel({
  templates,
  selectedBasketId,
  setSelectedBasketId,
  selectedBasket,
  types,
  setQuantity,
  privateFeeCents,
  onPrivateFeeChange,
  canManagePrivatePricing,
}: Props) {
  return (
    <div className="admin-grid">
      <section className="panel">
        <h2>Tamanhos de cesta</h2>
        <p>
          Os cinco tamanhos existem separadamente. Cada um possui suas próprias quantidades por
          tipo.
        </p>
        <div className="type-list">
          {templates.map((basket) => (
            <button
              key={basket.id}
              className={'type-row ' + (basket.id === selectedBasketId ? 'active' : '')}
              onClick={() => setSelectedBasketId(basket.id)}
            >
              <b>{basket.name}</b>
              <small>{basket.lines.length} tipos incluídos</small>
            </button>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2>Composição: {selectedBasket.name}</h2>
        <p>
          Informe a quantidade inicial de cada tipo. Zero significa que o tipo não faz parte deste
          tamanho.
        </p>
        {canManagePrivatePricing && (
          <div className="admin-private-fee">
            <label htmlFor="basket-private-fee">
              <strong>Valor interno da cesta (R$)</strong>
              <small>
                Configuração privada. Nunca exibir como linha ou campo separado na vitrine pública.
              </small>
            </label>
            <input
              id="basket-private-fee"
              className="small-input"
              type="number"
              min="0"
              max="999999"
              step="0.01"
              value={privateFeeCents / 100}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value) && value >= 0 && value <= 999999) {
                  onPrivateFeeChange(Math.round(value * 100));
                }
              }}
            />
          </div>
        )}
        {types.map((type) => {
          const value =
            selectedBasket.lines.find((line) => line.typeId === type.id)?.defaultQuantity ?? 0;
          return (
            <div className="quantity-row" key={type.id}>
              <div>
                <b>{type.name}</b>
                <small>{type.productSkus.length} opções de marcas</small>
              </div>
              <input
                className="small-input"
                type="number"
                min="0"
                max="999"
                aria-label={'Quantidade de ' + type.name}
                value={value}
                onChange={(e) => setQuantity(type.id, Number(e.target.value) || 0)}
              />
            </div>
          );
        })}
        <div className="notice">
          {validateBasketTemplate(selectedBasket, types).length === 0
            ? 'Estrutura válida para prévia.'
            : 'Revise a configuração: há tipos inválidos ou duplicados.'}
        </div>
      </section>
    </div>
  );
}
