import { useMemo, useState } from 'react';
import { formatBRL } from '../../../core/money';
import {
  makeIdempotencyKey,
  validateCheckoutRequest,
  type CheckoutOrderRequest,
} from '../../../core/checkout-order';
import type { CheckoutView } from '../../../core/checkout';
import type { PublicOrderReceipt } from '../../../platform/supabase/public-checkout';
import { CheckoutForm, type CheckoutFormState } from './CheckoutForm';

interface Props {
  view: CheckoutView;
  basketId: string;
  basketName: string;
  demoMode: boolean;
  onQuantity: (mode: 'basket' | 'extras', typeId: string, quantity: number) => void;
  goTo: (stage: 'basket' | 'extras') => void;
  submitOrder?: (request: CheckoutOrderRequest) => Promise<PublicOrderReceipt>;
}
interface QtyProps {
  name: string;
  value: number;
  onChange: (value: number) => void;
}
const draftKey = 'dona-antonia-v2.checkout-draft';
const defaultDate = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const initialForm: CheckoutFormState = {
  name: '',
  phone: '',
  postalCode: '',
  street: '',
  streetNumber: '',
  complement: '',
  neighborhood: '',
  city: 'Cuiabá',
  referenceNote: '',
  paymentMethod: 'PIX',
  deliveryDate: defaultDate(),
};
function readDraft(): CheckoutFormState {
  try {
    const value = JSON.parse(sessionStorage.getItem(draftKey) ?? 'null');
    return value && typeof value === 'object' ? { ...initialForm, ...value } : initialForm;
  } catch {
    return initialForm;
  }
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
export function CheckoutStep({
  view,
  basketId,
  basketName,
  demoMode,
  onQuantity,
  goTo,
  submitOrder,
}: Props) {
  const [form, setForm] = useState<CheckoutFormState>(readDraft);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<PublicOrderReceipt | null>(null);
  const update = <K extends keyof CheckoutFormState>(key: K, value: CheckoutFormState[K]) => {
    const next = { ...form, [key]: value };
    setForm(next);
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(next));
    } catch {
      /* storage is optional */
    }
  };
  const request = useMemo<CheckoutOrderRequest>(
    () => ({
      basketId,
      basketQuantity: 1,
      basketLines: view.basketItems.map(({ typeId, sku, quantity }) => ({ typeId, sku, quantity })),
      extraLines: view.extraItems.map(({ typeId, sku, quantity }) => ({ typeId, sku, quantity })),
      customer: {
        name: form.name,
        phone: form.phone,
        address: {
          recipientName: form.name,
          postalCode: form.postalCode,
          street: form.street,
          streetNumber: form.streetNumber,
          complement: form.complement,
          neighborhood: form.neighborhood,
          city: form.city,
          stateCode: 'MT',
          referenceNote: form.referenceNote,
        },
      },
      paymentMethod: form.paymentMethod,
      deliveryDate: form.deliveryDate,
      idempotencyKey: makeIdempotencyKey(),
    }),
    [basketId, form, view],
  );
  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const validation = validateCheckoutRequest(request, view.totalCents);
    if (validation.length) {
      setError(validation[0]!);
      return;
    }
    if (!submitOrder || demoMode) {
      setError('A confirmação será habilitada quando o backend V2 estiver configurado.');
      return;
    }
    setSubmitting(true);
    try {
      setReceipt(await submitOrder(request));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Não foi possível confirmar. Tente novamente.',
      );
    } finally {
      setSubmitting(false);
    }
  };
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
          <strong>Total estimado</strong>
          <strong>{formatBRL(view.totalCents)}</strong>
        </div>
        <small>O total final é recalculado no servidor, incluindo o valor interno da cesta.</small>
      </section>
      <section className="panel checkout-panel">
        <h2>Dados para entrega</h2>
        <p>Entregamos em Cuiabá e Várzea Grande. Pedido mínimo de R$ 75,00.</p>
        {receipt ? (
          <div className="notice" role="status">
            <strong>Pedido confirmado!</strong>
            <p>
              Número {receipt.orderNumber} · Total {formatBRL(receipt.totalCents)}
            </p>
            <small>Você pode guardar este número para acompanhar o pedido.</small>
          </div>
        ) : (
          <CheckoutForm
            form={form}
            demoMode={demoMode}
            submitting={submitting}
            error={error}
            update={update}
            onSubmit={onSubmit}
          />
        )}
      </section>
    </div>
  );
}
