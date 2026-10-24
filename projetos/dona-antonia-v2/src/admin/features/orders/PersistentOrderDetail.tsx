import type { AdminOrderCommandInput, AdminOrderDetail } from '../../../application/admin-orders';
import { ORDER_LABELS } from '../../../core/orders';
import { formatBRL } from '../../../core/money';

interface Props {
  selected: AdminOrderDetail;
  saving: boolean;
  deliveryNote: string;
  onDeliveryNoteChange: (value: string) => void;
  onCommand: (command: AdminOrderCommandInput['command']) => void;
  onDelivery: (status: 'CONCLUIDA' | 'PROBLEMA') => void;
}

function addressLabel(address: Readonly<Record<string, unknown>>): string {
  const street = typeof address.street === 'string' ? address.street : '';
  const number = typeof address.streetNumber === 'string' ? address.streetNumber : '';
  const neighborhood = typeof address.neighborhood === 'string' ? address.neighborhood : '';
  const city = typeof address.city === 'string' ? address.city : '';
  return (
    [street && `${street}, ${number}`, neighborhood, city].filter(Boolean).join(' · ') ||
    'Endereço do pedido'
  );
}

function itemLabel(item: AdminOrderDetail['items'][number]): string {
  return `${item.quantity} un. · ${item.productTypeName}`;
}

export function PersistentOrderDetail({
  selected,
  saving,
  deliveryNote,
  onDeliveryNoteChange,
  onCommand,
  onDelivery,
}: Props) {
  return (
    <article className="da-order-detail" aria-label={'Detalhes do pedido ' + selected.number}>
      <div className="da-order-detail-head">
        <div>
          <small>PEDIDO CONFIRMADO</small>
          <h2>{selected.number}</h2>
          <p>
            {selected.customerName} · {selected.customerPhone}
          </p>
        </div>
        <span className="da-order-status">{ORDER_LABELS[selected.state]}</span>
      </div>
      <div className="da-order-detail-info">
        <div>
          <small>Entrega</small>
          <b>{addressLabel(selected.address)}</b>
        </div>
        <div>
          <small>Pagamento</small>
          <b>
            {selected.paymentStatus} · {selected.paymentMethod}
          </b>
        </div>
        <div>
          <small>Fiscal</small>
          <b>{selected.fiscalStatus}</b>
        </div>
        <div>
          <small>Separador</small>
          <b>{selected.assignedTo ?? 'Não iniciado'}</b>
        </div>
      </div>
      <h3>Produtos do pedido</h3>
      <div className="da-order-items">
        {selected.items.map((item) => (
          <div className="da-order-item" key={item.id}>
            <span>
              <b>{item.name}</b>
              <small>
                {itemLabel(item)} · {item.sku}
              </small>
            </span>
            {selected.state === 'EM_SEPARACAO' && item.separation === 'PENDENTE' ? (
              <div className="da-picking-actions" aria-label={'Conferir ' + item.name}>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => onCommand({ type: 'MARK', itemId: item.id, result: 'SEPARADO' })}
                >
                  Separado
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => onCommand({ type: 'MARK', itemId: item.id, result: 'FALTOU' })}
                >
                  Faltou
                </button>
              </div>
            ) : (
              <small>
                {item.separation === 'FALTOU'
                  ? 'Faltou'
                  : item.separation === 'SEPARADO'
                    ? 'Separado'
                    : 'A conferir'}
              </small>
            )}
          </div>
        ))}
      </div>
      <div className="da-order-summary">
        <span>Total confirmado</span>
        <strong>{formatBRL(selected.totalCents)}</strong>
      </div>
      <div className="da-order-command-bar">
        {selected.state === 'NOVO' && (
          <button
            type="button"
            className="da-order-action"
            disabled={saving}
            onClick={() => onCommand({ type: 'START' })}
          >
            Iniciar separação
          </button>
        )}
        {selected.state === 'EM_SEPARACAO' && (
          <button
            type="button"
            className="da-order-action"
            disabled={
              saving ||
              selected.items.some((item) => item.separation === 'PENDENTE') ||
              selected.items.every((item) => item.fulfilledQuantity === 0)
            }
            onClick={() => onCommand({ type: 'FINISH' })}
          >
            Pronto para entrega
          </button>
        )}
        {selected.state === 'PRONTO' && (
          <button
            type="button"
            className="da-order-action"
            disabled={saving}
            onClick={() => onCommand({ type: 'DELIVER' })}
          >
            Marcar entregue
          </button>
        )}
      </div>
      {selected.state === 'ENTREGUE' && (
        <div className="da-delivery-outcome">
          <label htmlFor="delivery-note">Observação da entrega (opcional)</label>
          <textarea
            id="delivery-note"
            maxLength={500}
            value={deliveryNote}
            onChange={(event) => onDeliveryNoteChange(event.target.value)}
            placeholder="Ex.: recebido pelo cliente, portaria ou vizinho"
          />
          <div className="da-order-command-bar">
            <button
              type="button"
              className="da-order-action"
              disabled={saving}
              onClick={() => onDelivery('CONCLUIDA')}
            >
              Confirmar entrega
            </button>
            <button
              type="button"
              className="da-order-action secondary"
              disabled={saving}
              onClick={() => onDelivery('PROBLEMA')}
            >
              Registrar problema
            </button>
          </div>
          <small>Status da entrega: {selected.deliveryStatus}</small>
        </div>
      )}
      <p className="da-order-note">
        Versão {selected.version}. Os quatro estados operacionais permanecem separados de pagamento,
        entrega e fiscal; falha fiscal não bloqueia o estado Pronto.
      </p>
    </article>
  );
}
