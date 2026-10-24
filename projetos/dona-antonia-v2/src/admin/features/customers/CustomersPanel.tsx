import { useEffect, useState } from 'react';
import type {
  CustomerDetail,
  CustomerRepository,
  CustomerSummary,
} from '../../../application/customers';
import { formatBRL } from '../../../core/money';

interface Props {
  repository: CustomerRepository;
}

function addressLabel(address: Readonly<Record<string, unknown>> | null): string {
  if (!address) return 'Sem endereço recorrente';
  const street = typeof address.street === 'string' ? address.street : '';
  const number = typeof address.streetNumber === 'string' ? address.streetNumber : '';
  const neighborhood = typeof address.neighborhood === 'string' ? address.neighborhood : '';
  const city = typeof address.city === 'string' ? address.city : '';
  return (
    [street && `${street}, ${number}`, neighborhood, city].filter(Boolean).join(' · ') ||
    'Endereço cadastrado'
  );
}

export function CustomersPanel({ repository }: Props) {
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<readonly CustomerSummary[]>([]);
  const [selected, setSelected] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setMessage('');
    void repository
      .list({ search: query, page: 1, pageSize: 30 })
      .then((page) => {
        if (active) setCustomers(page.items);
      })
      .catch((error: unknown) => {
        if (active)
          setMessage(
            error instanceof Error ? error.message : 'Não foi possível carregar clientes.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [repository, query]);

  const select = async (customer: CustomerSummary) => {
    setSelected(null);
    setMessage('');
    try {
      setSelected(await repository.get(customer.id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível carregar o cliente.');
    }
  };

  return (
    <section className="da-customers" aria-label="Clientes e histórico de pedidos">
      <div className="da-orders-notice" role="status">
        <strong>Clientes V2.</strong> A busca usa somente nome e telefone. Endereços completos ficam
        disponíveis apenas ao abrir o cadastro autorizado; nenhuma comunicação é enviada daqui.
      </div>
      <div className="da-order-toolbar">
        <label htmlFor="customer-search">Localizar cliente</label>
        <input
          id="customer-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Nome ou telefone"
        />
        <span>{loading ? 'Carregando…' : `${customers.length} cliente(s)`}</span>
      </div>
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
      <div className="da-customer-layout">
        <div className="da-order-list">
          {customers.map((customer) => (
            <button
              key={customer.id}
              type="button"
              className={'da-order-row' + (selected?.id === customer.id ? ' selected' : '')}
              onClick={() => void select(customer)}
            >
              <span className="da-order-meta">
                <b>{customer.displayName}</b>
                <small>{customer.phoneDigits}</small>
              </span>
              <span className="da-order-value">
                <strong>{customer.orderCount} pedido(s)</strong>
                <small>{addressLabel(customer.defaultAddress)}</small>
              </span>
            </button>
          ))}
          {!loading && !customers.length && (
            <div className="da-order-empty">Nenhum cliente encontrado.</div>
          )}
        </div>
        {selected ? (
          <article className="da-order-detail" aria-label={`Detalhes de ${selected.displayName}`}>
            <div className="da-order-detail-head">
              <div>
                <small>CLIENTE</small>
                <h2>{selected.displayName}</h2>
                <p>{selected.phoneDigits}</p>
              </div>
              <span className="da-order-status">{selected.orders.length} pedido(s)</span>
            </div>
            <h3>Endereços recorrentes</h3>
            <div className="da-customer-addresses">
              {selected.addresses.map((address) => (
                <div key={address.id} className="da-customer-address">
                  <b>
                    {address.label}
                    {address.isDefault ? ' · Principal' : ''}
                  </b>
                  <span>
                    {address.recipientName} · {address.street}, {address.streetNumber}
                  </span>
                  <small>
                    {address.neighborhood} · {address.city}/{address.stateCode} · CEP{' '}
                    {address.postalCode}
                  </small>
                  {address.referenceNote && <small>Referência: {address.referenceNote}</small>}
                </div>
              ))}
              {!selected.addresses.length && (
                <p className="da-order-empty">Nenhum endereço recorrente.</p>
              )}
            </div>
            <h3>Histórico de pedidos</h3>
            <div className="da-customer-history">
              {selected.orders.map((order) => (
                <div key={order.id} className="da-customer-history-row">
                  <span>
                    <b>{order.number}</b>
                    <small>
                      {order.status} · {order.deliveryStatus}
                    </small>
                  </span>
                  <strong>{formatBRL(order.totalCents)}</strong>
                </div>
              ))}
              {!selected.orders.length && (
                <p className="da-order-empty">Nenhum pedido associado.</p>
              )}
            </div>
          </article>
        ) : (
          <div className="da-order-placeholder">
            <b>Selecione um cliente</b>
            <span>Consulte endereços e histórico sem expor preços privados de cestas.</span>
          </div>
        )}
      </div>
    </section>
  );
}
