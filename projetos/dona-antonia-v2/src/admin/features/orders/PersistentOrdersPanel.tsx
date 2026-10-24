import { useEffect, useState } from 'react';
import type {
  AdminOrderCommandInput,
  AdminOrderDetail,
  AdminOrderSummary,
  AdminOrdersRepository,
} from '../../../application/admin-orders';
import { ORDER_LABELS, ORDER_STATES, type OrderState } from '../../../core/orders';
import { formatBRL } from '../../../core/money';
import { PersistentOrderDetail } from './PersistentOrderDetail';

interface Props {
  repository: AdminOrdersRepository;
}

export function PersistentOrdersPanel({ repository }: Props) {
  const [status, setStatus] = useState<OrderState>('NOVO');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<readonly AdminOrderSummary[]>([]);
  const [counts, setCounts] = useState<Partial<Record<OrderState, number>>>({});
  const [selected, setSelected] = useState<AdminOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [deliveryNote, setDeliveryNote] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setMessage('');
    void Promise.all([
      repository.list({ status, search: query, page: 1, pageSize: 20 }),
      ...ORDER_STATES.map((tab) =>
        repository.list({ status: tab, search: query, page: 1, pageSize: 1 }),
      ),
    ])
      .then(([page, ...tabPages]) => {
        if (!active) return;
        setItems(page.items);
        setCounts(
          Object.fromEntries(
            ORDER_STATES.map((tab, index) => [tab, tabPages[index]?.total ?? 0]),
          ) as Partial<Record<OrderState, number>>,
        );
      })
      .catch((error: unknown) => {
        if (active)
          setMessage(
            error instanceof Error ? error.message : 'Não foi possível carregar os pedidos.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [repository, status, query, refreshToken]);

  const select = async (order: AdminOrderSummary) => {
    setSelected(null);
    setDeliveryNote('');
    setMessage('');
    try {
      setSelected(await repository.get(order.id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível carregar o pedido.');
    }
  };

  const recordDelivery = async (status: 'CONCLUIDA' | 'PROBLEMA') => {
    if (!selected || saving) return;
    setSaving(true);
    setMessage('');
    try {
      const requestId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : 'delivery-' + Date.now();
      const updated = await repository.recordDeliveryOutcome({
        orderId: selected.id,
        requestId,
        status,
        note: deliveryNote,
      });
      setSelected(updated);
      setDeliveryNote('');
      setRefreshToken((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível registrar a entrega.');
    } finally {
      setSaving(false);
    }
  };

  const apply = async (command: AdminOrderCommandInput['command']) => {
    if (!selected || saving) return;
    setSaving(true);
    setMessage('');
    try {
      const commandId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : 'order-command-' + Date.now();
      const updated = await repository.applyCommand({
        orderId: selected.id,
        commandId,
        expectedVersion: selected.version,
        command,
      });
      setSelected(updated);
      setStatus(updated.state);
      setRefreshToken((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível aplicar a operação.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="da-orders" aria-label="Gestão de pedidos persistentes">
      <div className="da-orders-notice" role="status">
        <strong>Pedidos V2.</strong> A leitura vem do staging isolado; status, total e snapshots são
        calculados pelo servidor. Nenhuma mensagem, NF-e ou integração operacional é acionada.
      </div>
      <div className="da-order-tabs" role="tablist" aria-label="Etapas dos pedidos">
        {ORDER_STATES.map((tab) => (
          <button
            role="tab"
            type="button"
            key={tab}
            aria-selected={status === tab}
            className={status === tab ? 'is-active' : ''}
            onClick={() => {
              setStatus(tab);
              setSelected(null);
            }}
          >
            {ORDER_LABELS[tab]} <span>{counts[tab] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="da-order-toolbar">
        <label htmlFor="persistent-order-search">Localizar pedido</label>
        <input
          id="persistent-order-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Número, cliente ou WhatsApp"
        />
        <span>{loading ? 'Carregando…' : items.length + ' pedido(s)'}</span>
        <button type="button" className="da-order-action" onClick={() => window.print()}>
          Imprimir
        </button>
      </div>
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
      <div className="da-order-layout">
        <div className="da-order-list">
          {items.map((order) => (
            <button
              key={order.id}
              type="button"
              className={'da-order-row' + (selected?.id === order.id ? ' selected' : '')}
              onClick={() => void select(order)}
            >
              <span className="da-order-meta">
                <b>{order.number}</b>
                <small>{order.customerName}</small>
              </span>
              <span className="da-order-value">
                <strong>{formatBRL(order.totalCents)}</strong>
                <small>{order.paymentMethod}</small>
              </span>
            </button>
          ))}
          {!loading && !items.length && (
            <div className="da-order-empty">Nenhum pedido nesta etapa ou com esta pesquisa.</div>
          )}
        </div>
        {selected ? (
          <PersistentOrderDetail
            selected={selected}
            saving={saving}
            deliveryNote={deliveryNote}
            onDeliveryNoteChange={setDeliveryNote}
            onCommand={(command) => void apply(command)}
            onDelivery={(outcome) => void recordDelivery(outcome)}
          />
        ) : (
          <div className="da-order-placeholder">
            <b>Selecione um pedido</b>
            <span>Consulte cliente, endereço, snapshots e total confirmado.</span>
          </div>
        )}
      </div>
    </section>
  );
}
