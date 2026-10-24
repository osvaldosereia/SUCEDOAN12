import { useEffect, useState } from 'react';
import type {
  AdminOrderCommandInput,
  AdminOrderDetail,
  AdminOrderSummary,
  AdminOrdersRepository,
} from '../../../application/admin-orders';
import { ORDER_LABELS, ORDER_STATES, type OrderState } from '../../../core/orders';
import { formatBRL } from '../../../core/money';

interface Props {
  repository: AdminOrdersRepository;
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

export function PersistentOrdersPanel({ repository }: Props) {
  const [status, setStatus] = useState<OrderState>('NOVO');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<readonly AdminOrderSummary[]>([]);
  const [counts, setCounts] = useState<Partial<Record<OrderState, number>>>({});
  const [selected, setSelected] = useState<AdminOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
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
    setMessage('');
    try {
      setSelected(await repository.get(order.id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível carregar o pedido.');
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
                        onClick={() =>
                          void apply({ type: 'MARK', itemId: item.id, result: 'SEPARADO' })
                        }
                      >
                        Separado
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() =>
                          void apply({ type: 'MARK', itemId: item.id, result: 'FALTOU' })
                        }
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
                  onClick={() => void apply({ type: 'START' })}
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
                  onClick={() => void apply({ type: 'FINISH' })}
                >
                  Pronto para entrega
                </button>
              )}
              {selected.state === 'PRONTO' && (
                <button
                  type="button"
                  className="da-order-action"
                  disabled={saving}
                  onClick={() => void apply({ type: 'DELIVER' })}
                >
                  Marcar entregue
                </button>
              )}
            </div>
            <p className="da-order-note">
              Versão {selected.version}. Os quatro estados operacionais permanecem separados de
              pagamento, entrega e fiscal; falha fiscal não bloqueia o estado Pronto.
            </p>
          </article>
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
