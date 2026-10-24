import { useEffect, useState } from 'react';
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
  onCreateBasket: (name: string) => void;
  onUpdateBasket: (id: BasketId, patch: Partial<BasketTemplate>) => void;
  onMoveBasket: (id: BasketId, delta: number) => void;
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
  onCreateBasket,
  onUpdateBasket,
  onMoveBasket,
}: Props) {
  const [newBasketName, setNewBasketName] = useState('');
  const [basketName, setBasketName] = useState(selectedBasket.name);
  const [basketImageUrl, setBasketImageUrl] = useState(selectedBasket.imageUrl ?? '');
  useEffect(() => {
    setBasketName(selectedBasket.name);
    setBasketImageUrl(selectedBasket.imageUrl ?? '');
  }, [selectedBasket.id, selectedBasket.name, selectedBasket.imageUrl]);
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
            <div
              key={basket.id}
              className={'type-row ' + (basket.id === selectedBasketId ? 'active' : '')}
            >
              <button type="button" onClick={() => setSelectedBasketId(basket.id)}>
                <b>{basket.name}</b>
                <small>
                  {basket.lines.length} tipos · {basket.active ? 'ativa' : 'inativa'}
                </small>
              </button>
              <span>
                <button
                  type="button"
                  aria-label={'Mover ' + basket.name + ' para cima'}
                  onClick={() => onMoveBasket(basket.id, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={'Mover ' + basket.name + ' para baixo'}
                  onClick={() => onMoveBasket(basket.id, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateBasket(basket.id, { active: !basket.active })}
                >
                  {basket.active ? 'Retirar' : 'Ativar'}
                </button>
              </span>
            </div>
          ))}
        </div>
        <div className="form-row">
          <input
            className="input"
            aria-label="Nome do novo tamanho"
            placeholder="Novo tamanho de cesta"
            value={newBasketName}
            onChange={(event) => setNewBasketName(event.target.value)}
          />
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              onCreateBasket(newBasketName);
              setNewBasketName('');
            }}
          >
            Adicionar tamanho
          </button>
        </div>
      </section>
      <section className="panel">
        <h2>Composição: {selectedBasket.name}</h2>
        <p>
          Informe a quantidade inicial de cada tipo. Zero significa que o tipo não faz parte deste
          tamanho.
        </p>
        <label className="form-field">
          <span>Nome do tamanho</span>
          <input
            className="input"
            value={basketName}
            onChange={(event) => setBasketName(event.target.value)}
            onBlur={() => onUpdateBasket(selectedBasket.id, { name: basketName })}
          />
        </label>
        <label className="form-field">
          <span>Foto quadrada (URL HTTPS)</span>
          <input
            className="input"
            type="url"
            value={basketImageUrl}
            placeholder="https://…"
            onChange={(event) => setBasketImageUrl(event.target.value)}
            onBlur={() =>
              onUpdateBasket(selectedBasket.id, { imageUrl: basketImageUrl || undefined })
            }
          />
        </label>
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
