import { useEffect, useState } from 'react';
import type { CustomerRepository, OperationalReport } from '../../../application/customers';
import { formatBRL } from '../../../core/money';

interface Props {
  repository: CustomerRepository;
}

function defaultFrom() {
  const date = new Date();
  date.setDate(date.getDate() - 6);
  return date.toISOString().slice(0, 10);
}

const label: Record<string, string> = {
  NOVO: 'Novo',
  EM_SEPARACAO: 'Em separação',
  PRONTO: 'Pronto',
  ENTREGUE: 'Entregue',
  AGUARDANDO: 'Aguardando',
  CONCLUIDA: 'Concluída',
  PROBLEMA: 'Problema',
  PENDENTE: 'Pendente',
  EMITINDO: 'Emitindo',
  EMITIDA: 'Emitida',
  ERRO: 'Erro',
};

function Breakdown({ title, values }: { title: string; values: Readonly<Record<string, number>> }) {
  return (
    <div className="da-report-breakdown">
      <h3>{title}</h3>
      {Object.entries(values).length ? (
        Object.entries(values).map(([key, value]) => (
          <div key={key}>
            <span>{label[key] ?? key}</span>
            <strong>{value}</strong>
          </div>
        ))
      ) : (
        <p>Nenhum dado no período.</p>
      )}
    </div>
  );
}

export function ReportsPanel({ repository }: Props) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<OperationalReport | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setMessage('');
    void repository
      .report(from, to)
      .then((value) => {
        if (active) setReport(value);
      })
      .catch((error: unknown) => {
        if (active)
          setMessage(
            error instanceof Error ? error.message : 'Não foi possível carregar o relatório.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [repository, from, to]);

  return (
    <section className="da-reports" aria-label="Relatórios operacionais">
      <div className="da-orders-notice" role="status">
        <strong>Relatório operacional V2.</strong> Indicadores calculados no servidor por data de
        confirmação do pedido. Não é contabilidade nem rota de motorista.
      </div>
      <div className="da-report-filters">
        <label>
          De <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          Até <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
      </div>
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
      {loading ? (
        <div className="notice muted">Carregando indicadores…</div>
      ) : (
        report && (
          <>
            <div className="da-report-metrics">
              <div className="da-metric">
                <span>Pedidos</span>
                <strong>{report.ordersTotal}</strong>
                <small>
                  {report.from} a {report.to}
                </small>
              </div>
              <div className="da-metric">
                <span>Total confirmado</span>
                <strong>{formatBRL(report.salesTotalCents)}</strong>
                <small>Sem preço privado de cesta</small>
              </div>
            </div>
            <div className="da-report-grid">
              <Breakdown title="Pedidos por etapa" values={report.byStatus} />
              <Breakdown title="Resultado da entrega" values={report.byDeliveryStatus} />
              <Breakdown title="Situação fiscal" values={report.byFiscalStatus} />
            </div>
          </>
        )
      )}
    </section>
  );
}
