import type { CheckoutOrderRequest } from '../../../core/checkout-order';

export interface CheckoutFormState {
  name: string;
  phone: string;
  postalCode: string;
  street: string;
  streetNumber: string;
  complement: string;
  neighborhood: string;
  city: 'Cuiabá' | 'Várzea Grande';
  referenceNote: string;
  paymentMethod: CheckoutOrderRequest['paymentMethod'];
  deliveryDate: string;
}

interface Props {
  form: CheckoutFormState;
  demoMode: boolean;
  submitting: boolean;
  error: string;
  update: <K extends keyof CheckoutFormState>(key: K, value: CheckoutFormState[K]) => void;
  onSubmit: (event: React.FormEvent) => void;
}

export function CheckoutForm({ form, demoMode, submitting, error, update, onSubmit }: Props) {
  return (
    <form className="checkout-form" onSubmit={onSubmit}>
      <label>
        Nome completo
        <input
          required
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
          autoComplete="name"
          placeholder="Seu nome"
        />
      </label>
      <label>
        WhatsApp
        <input
          required
          value={form.phone}
          onChange={(e) => update('phone', e.target.value)}
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          placeholder="(65) 99999-9999"
        />
      </label>
      <div className="form-grid">
        <label>
          CEP
          <input
            required
            value={form.postalCode}
            onChange={(e) => update('postalCode', e.target.value)}
            inputMode="numeric"
            placeholder="78000-000"
          />
        </label>
        <label>
          Cidade
          <select
            value={form.city}
            onChange={(e) => update('city', e.target.value as CheckoutFormState['city'])}
          >
            <option>Cuiabá</option>
            <option>Várzea Grande</option>
          </select>
        </label>
      </div>
      <div className="form-grid">
        <label>
          Rua
          <input
            required
            value={form.street}
            onChange={(e) => update('street', e.target.value)}
            autoComplete="street-address"
          />
        </label>
        <label>
          Número
          <input
            required
            value={form.streetNumber}
            onChange={(e) => update('streetNumber', e.target.value)}
          />
        </label>
      </div>
      <div className="form-grid">
        <label>
          Bairro
          <input
            required
            value={form.neighborhood}
            onChange={(e) => update('neighborhood', e.target.value)}
          />
        </label>
        <label>
          Complemento
          <input value={form.complement} onChange={(e) => update('complement', e.target.value)} />
        </label>
      </div>
      <label>
        Data de entrega
        <input
          required
          type="date"
          value={form.deliveryDate}
          onChange={(e) => update('deliveryDate', e.target.value)}
        />
      </label>
      <label>
        Forma de pagamento na entrega
        <select
          value={form.paymentMethod}
          onChange={(e) =>
            update('paymentMethod', e.target.value as CheckoutFormState['paymentMethod'])
          }
        >
          <option value="PIX">PIX</option>
          <option value="DINHEIRO">Dinheiro</option>
          <option value="CARTAO_DEBITO">Cartão de débito</option>
          <option value="CARTAO_CREDITO">Cartão de crédito</option>
          <option value="VALE_ALIMENTACAO">Vale-alimentação</option>
          <option value="VALE_REFEICAO">Vale-refeição</option>
        </select>
      </label>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {demoMode && (
        <div className="notice muted">
          Prévia demonstrativa: nenhum dado será enviado ou armazenado.
        </div>
      )}
      <button type="submit" className="primary-button" disabled={submitting || demoMode}>
        {submitting
          ? 'Confirmando…'
          : demoMode
            ? 'Confirmação indisponível nesta prévia'
            : 'Confirmar pedido'}
      </button>
      <small>
        Se a rede falhar, seus itens e dados ficam nesta tela para tentar novamente. Não exigimos
        CPF nesta etapa.
      </small>
    </form>
  );
}
