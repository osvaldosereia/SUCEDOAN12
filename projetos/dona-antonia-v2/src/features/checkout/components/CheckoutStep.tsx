import { formatBRL } from '../../../core/money';
import type { CheckoutView } from '../../../core/checkout';

interface Props {
  view: CheckoutView;
  basketName: string;
  onQuantity: (mode: 'basket' | 'extras', typeId: string, quantity: number) => void;
  goTo: (stage: 'basket' | 'extras') => void;
}
interface QtyProps {
  name: string;
  value: number;
  onChange: (value: number) => void;
}
function Quantity({ name, value, onChange }: QtyProps) {
  return (
    <div className="checkout-qty" role="group" aria-label={'Quantidade de ' + name}>
      <button
        type="button"
        aria-label={'Diminuir ' + name + ' no checkout'}
        onClick={() => onChange(Math.max(0, value - 1))}
      >
        −
      </button>
      <output>{value}</output>
      <button
        type="button"
        aria-label={'Aumentar ' + name + ' no checkout'}
        onClick={() => onChange(value + 1)}
        disabled={value >= 999}
      >
        +
      </button>
    </div>
  );
}
export function CheckoutStep({ view, basketName, onQuantity, goTo }: Props) {
  return (
    <div className="checkout-layout">
      <section className="panel checkout-panel">
        <h2>Seus produtos</h2>
        <p>Revise a cesta e os extras. Diminua a quantidade até zero para remover um item.</p>

        <div className="checkout-group-heading">
          <div>
            <h3>Cesta {basketName}</h3>
            <small>Composição da cesta</small>
          </div>
          <strong>{formatBRL(view.basketSubtotalCents)}</strong>
        </div>
        {view.basketItems.map((line) => (
          <div className="checkout-line checkout-basket-line" key={'basket-' + line.typeId}>
            <div className="checkout-item-name">
              <b>{line.name}</b>
              <small>Produto da cesta</small>
            </div>
            <Quantity
              name={line.name}
              value={line.quantity}
              onChange={(qty) => onQuantity('basket', line.typeId, qty)}
            />
          </div>
        ))}
        {!view.basketItems.length && (
          <p className="checkout-empty">Nenhum produto na cesta. Volte para adicionar itens.</p>
        )}
        <div className="checkout-edit-actions">
          <button type="button" className="back-link" onClick={() => goTo('basket')}>
            Editar cesta
          </button>
        </div>

        <div className="checkout-group-heading checkout-extra-heading">
          <div>
            <h3>Produtos extras</h3>
            <small>Itens adicionados separadamente</small>
          </div>
          <strong>{formatBRL(view.extrasSubtotalCents)}</strong>
        </div>
        {view.extraItems.map((line) => (
          <div className="checkout-line checkout-extra-line" key={'extras-' + line.typeId}>
            <div className="checkout-item-name">
              <b>{line.name}</b>
              <small>{formatBRL(line.priceCents)} por unidade</small>
            </div>
            <Quantity
              name={line.name}
              value={line.quantity}
              onChange={(qty) => onQuantity('extras', line.typeId, qty)}
            />
            <strong className="checkout-extra-total">{formatBRL(line.lineTotalCents)}</strong>
          </div>
        ))}
        {!view.extraItems.length && (
          <p className="checkout-empty">Nenhum produto extra adicionado.</p>
        )}
        <div className="checkout-edit-actions">
          <button type="button" className="back-link" onClick={() => goTo('extras')}>
            Editar extras
          </button>
        </div>

        <div className="order-total">
          <strong>Total do pedido</strong>
          <strong>{formatBRL(view.totalCents)}</strong>
        </div>
      </section>
      <section className="panel checkout-panel">
        <h2>Dados para entrega</h2>
        <p>Prévia demonstrativa. Nenhum dado será enviado ou armazenado.</p>
        <form className="checkout-form" onSubmit={(event) => event.preventDefault()}>
          <label>
            Nome completo
            <input type="text" autoComplete="name" placeholder="Seu nome" />
          </label>
          <label>
            WhatsApp
            <input type="tel" autoComplete="tel" inputMode="tel" placeholder="(65) 99999-9999" />
          </label>
          <label>
            Endereço de entrega
            <input type="text" autoComplete="street-address" placeholder="Rua, número e bairro" />
          </label>
          <label>
            Forma de pagamento
            <select defaultValue="">
              <option value="" disabled>
                Selecione na entrega
              </option>
              <option>PIX na entrega</option>
              <option>Dinheiro</option>
              <option>Cartão de crédito</option>
              <option>Vale-alimentação/refeição</option>
            </select>
          </label>
          <div className="notice muted">
            A confirmação será habilitada apenas depois da implantação do backend de pedidos.
          </div>
          <button type="button" className="primary-button" disabled>
            Confirmação indisponível nesta prévia
          </button>
        </form>
      </section>
    </div>
  );
}
