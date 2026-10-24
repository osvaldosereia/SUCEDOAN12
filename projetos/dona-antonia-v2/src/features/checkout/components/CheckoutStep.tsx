import {formatBRL} from '../../../core/money';
import type {CartLine} from '../../../core/extras';
interface Props {
  order: {readonly lines: readonly CartLine[]} | null;
  totalCents: number;
  goTo: (stage: 'basket'|'extras') => void;
}
export function CheckoutStep({order,totalCents,goTo}: Props) {
  return <div className="checkout-layout">
        <section className="panel checkout-panel">
          <h2>Seus produtos</h2><p>Confira os itens e retorne à etapa anterior se desejar mudar marca ou quantidade.</p>
          {(order?.lines??[]).map((line)=><div className="checkout-line" key={line.sku}>
            <div><b>{line.name}</b><small>{line.quantity} un. × {formatBRL(line.priceCents)}</small></div>
            <strong>{formatBRL(line.totalCents)}</strong></div>)}
          <div className="order-total"><strong>Total dos produtos</strong><strong>{formatBRL(totalCents)}</strong></div>
          <div className="checkout-edit-actions">
            <button type="button" className="back-link" onClick={()=>goTo('basket')}>Editar cesta</button>
            <button type="button" className="back-link" onClick={()=>goTo('extras')}>Editar extras</button>
          </div>
        </section>
        <section className="panel checkout-panel">
          <h2>Dados para entrega</h2>
          <p>Esta é somente uma demonstração visual. Os dados não são enviados nem armazenados.</p>
          <form className="checkout-form" onSubmit={(event)=>event.preventDefault()}>
            <label>Nome completo<input type="text" autoComplete="name" placeholder="Seu nome" /></label>
            <label>WhatsApp<input type="tel" autoComplete="tel" inputMode="tel" placeholder="(65) 99999-9999" /></label>
            <label>Endereço de entrega<input type="text" autoComplete="street-address" placeholder="Rua, número e bairro" /></label>
            <label>Forma de pagamento<select defaultValue=""><option value="" disabled>Selecione na entrega</option>
              <option>PIX na entrega</option><option>Dinheiro</option><option>Cartão de crédito</option>
              <option>Vale-alimentação/refeição</option></select></label>
            <div className="notice muted">A confirmação do pedido será habilitada somente após autenticação do admin, banco seguro e integração de pedidos.</div>
            <button type="button" className="primary-button" disabled>Confirmação indisponível nesta prévia</button>
          </form>
        </section>
      </div>;
}
