import { useMemo, useState } from 'react';
import type { OperationalOrder, OrderState, SeparationResult } from '../../../core/orders';
import {
  ORDER_STATES,
  ORDER_LABELS,
  advanceOrder,
  markSeparated,
  orderTotal,
} from '../../../core/orders';
import { formatBRL } from '../../../core/money';

interface Props {
  orders: readonly OperationalOrder[];
  onUpdate: (id: string, change: (order: OperationalOrder) => OperationalOrder) => void;
}
const actionText: Partial<Record<OrderState, string>> = {
  NOVO: 'Iniciar separação',
  EM_SEPARACAO: 'Concluir separação',
  PRONTO: 'Marcar entregue',
};
export function OrdersPanel({ orders, onUpdate }: Props) {
  const [status, setStatus] = useState<OrderState>('NOVO');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [visible, setVisible] = useState(5);
  const filtered = useMemo(
    () =>
      orders
        .filter(
          (order) =>
            order.state === status &&
            (order.number + ' ' + order.customerName + ' ' + order.paymentMethod)
              .toLocaleLowerCase('pt-BR')
              .includes(query.trim().toLocaleLowerCase('pt-BR')),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [orders, status, query],
  );
  const selected = orders.find((order) => order.id === selectedId);
  const update = (
    order: OperationalOrder,
    apply: (value: OperationalOrder) => OperationalOrder,
  ) => {
    try {
      const updated = apply(order);
      onUpdate(order.id, () => updated);
      setStatus(updated.state);
      setSelectedId(updated.id);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível alterar o pedido.');
    }
  };
  const changeTab = (next: OrderState) => {
    setStatus(next);
    setSelectedId(null);
    setMessage('');
    setVisible(5);
  };
  return (
    <section className="da-orders" aria-label="Gestão de pedidos demonstrativos">
      <div className="da-orders-notice" role="status">
        <strong>Ambiente de teste.</strong> Os pedidos abaixo são fictícios. Mudanças não serão
        gravadas nem dispararão WhatsApp ou NF-e.
      </div>
      <div className="da-order-tabs" role="tablist" aria-label="Etapas dos pedidos">
        {ORDER_STATES.map((state) => (
          <button
            role="tab"
            type="button"
            key={state}
            aria-selected={status === state}
            className={status === state ? 'is-active' : ''}
            onClick={() => changeTab(state)}
          >
            {ORDER_LABELS[state]}{' '}
            <span>{orders.filter((order) => order.state === state).length}</span>
          </button>
        ))}
      </div>
      <div className="da-order-toolbar">
        <label htmlFor="order-search">Localizar pedido</label>
        <input
          id="order-search"
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setVisible(5);
          }}
          placeholder="Número ou nome do cliente"
        />
        <span>{filtered.length} pedido(s)</span>
      </div>
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
      <div className="da-order-layout">
        <div className="da-order-list">
          {filtered.slice(0, visible).map((order) => (
            <button
              key={order.id}
              type="button"
              className={'da-order-row' + (selectedId === order.id ? ' selected' : '')}
              onClick={() => {
                setSelectedId(order.id);
                setMessage('');
              }}
            >
              <span className="da-order-meta">
                <b>{order.number}</b>
                <small>{order.customerName}</small>
              </span>
              <span className="da-order-value">
                <strong>{formatBRL(orderTotal(order))}</strong>
                <small>{order.paymentMethod}</small>
              </span>
            </button>
          ))}
          {!filtered.length && (
            <div className="da-order-empty">Nenhum pedido nesta etapa ou com esta pesquisa.</div>
          )}
          {filtered.length > visible && (
            <button
              type="button"
              className="da-order-more"
              onClick={() => setVisible((n) => n + 5)}
            >
              Ver mais pedidos
            </button>
          )}
        </div>
        {selected ? (
          <article className="da-order-detail" aria-label={'Detalhes do pedido ' + selected.number}>
            <div className="da-order-detail-head">
              <div>
                <small>PEDIDO DE TESTE</small>
                <h2>{selected.number}</h2>
                <p>
                  {selected.customerName} · {selected.paymentMethod}
                </p>
              </div>
              <span className="da-order-status">{ORDER_LABELS[selected.state]}</span>
            </div>
            <div className="da-order-detail-info">
              <div>
                <small>Entrega</small>
                <b>{selected.deliveryAddress}</b>
              </div>
              <div>
                <small>Separador</small>
                <b>{selected.assignedTo ?? 'Não iniciado'}</b>
              </div>
              <div>
                <small>Pagamento</small>
                <b>{selected.paymentState}</b>
              </div>
              <div>
                <small>Nota fiscal</small>
                <b>{selected.fiscalState}</b>
              </div>
            </div>
            <h3>Produtos do pedido</h3>
            <div className="da-order-items">
              {selected.items.map((item) => (
                <div className="da-order-item" key={item.id}>
                  <span>
                    <b>{item.name}</b>
                    <small>
                      {item.quantity} un. · {item.sku}
                    </small>
                  </span>
                  {selected.state === 'EM_SEPARACAO' ? (
                    <div className="da-picking-actions">
                      {(['SEPARADO', 'FALTOU'] as Exclude<SeparationResult, 'PENDENTE'>[]).map(
                        (value) => (
                          <button
                            type="button"
                            className={item.separation === value ? 'selected' : ''}
                            key={value}
                            aria-pressed={item.separation === value}
                            onClick={() =>
                              update(selected, (current) => markSeparated(current, item.id, value))
                            }
                          >
                            {value === 'SEPARADO' ? 'Separado' : 'Faltou'}
                          </button>
                        ),
                      )}
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
              <span>Total atualizado</span>
              <strong>{formatBRL(orderTotal(selected))}</strong>
            </div>
            {actionText[selected.state] && (
              <button
                type="button"
                className="da-order-action"
                onClick={() => update(selected, advanceOrder)}
              >
                {actionText[selected.state]}
              </button>
            )}
            <p className="da-order-note">
              Status fiscal, pagamento e mensagens são independentes das quatro etapas do pedido.
            </p>
          </article>
        ) : (
          <div className="da-order-placeholder">
            <b>Selecione um pedido</b>
            <span>Consulte produtos, pagamento e avance na separação.</span>
          </div>
        )}
      </div>
    </section>
  );
}
