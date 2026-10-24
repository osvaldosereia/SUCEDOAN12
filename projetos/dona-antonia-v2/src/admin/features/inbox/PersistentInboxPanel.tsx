import { useEffect, useState } from 'react';
import type {
  AdminConversationDetail,
  AdminConversationSummary,
  AdminInboxRepository,
  ConversationStatus,
  WhatsAppAccount,
} from '../../../application/admin-inbox';

interface Props {
  repository: AdminInboxRepository;
}

const STATUS_LABELS: Record<ConversationStatus, string> = {
  ABERTA: 'Abertas',
  PENDENTE: 'Pendentes',
  CONCLUIDA: 'Concluídas',
};

function accountLabel(account: WhatsAppAccount): string {
  return `WhatsApp ${account}`;
}

function preview(conversation: AdminConversationSummary): string {
  return (
    conversation.lastMessagePreview ||
    (conversation.messageCount ? `${conversation.messageCount} mensagem(ns)` : 'Sem mensagens')
  );
}

export function PersistentInboxPanel({ repository }: Props) {
  const [account, setAccount] = useState<WhatsAppAccount | null>(null);
  const [status, setStatus] = useState<ConversationStatus | null>(null);
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<readonly AdminConversationSummary[]>([]);
  const [selected, setSelected] = useState<AdminConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setMessage('');
    void repository
      .list({ account, status, search, page: 1, pageSize: 30 })
      .then((page) => {
        if (active) setItems(page.items);
      })
      .catch((error: unknown) => {
        if (active)
          setMessage(error instanceof Error ? error.message : 'Não foi possível carregar o Inbox.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [account, repository, search, status, refresh]);

  const select = async (conversation: AdminConversationSummary) => {
    setSelected(null);
    setMessage('');
    try {
      setSelected(await repository.get(conversation.id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível carregar a conversa.');
    }
  };

  const queue = async () => {
    if (!selected || !draft.trim() || saving) return;
    setSaving(true);
    setMessage('');
    try {
      const key =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? `admin:${crypto.randomUUID()}`
          : `admin:${Date.now()}`;
      await repository.queueMessage({
        conversationId: selected.id,
        providerAccount: selected.providerAccount,
        idempotencyKey: key,
        contentText: draft.trim(),
        mediaMetadata: [],
      });
      setDraft('');
      setSelected(await repository.get(selected.id));
      setRefresh((value) => value + 1);
      setMessage('Mensagem registrada na fila V2. O transporte externo permanece desligado.');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Não foi possível enfileirar a mensagem.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="da-inbox" aria-label="Inbox humano WhatsApp V2">
      <div className="da-inbox-notice" role="status">
        <strong>Inbox V2 isolado.</strong> Conversas e mensagens usam somente o banco de staging. A
        fila de saída é idempotente e não chama Meta, WhatsApp ou o atendimento legado.
      </div>
      <div className="da-inbox-toolbar">
        <div className="da-inbox-accounts" role="tablist" aria-label="Contas WhatsApp">
          <button
            type="button"
            className={account === null ? 'is-active' : ''}
            onClick={() => setAccount(null)}
          >
            Todas
          </button>
          <button
            type="button"
            className={account === '0975' ? 'is-active' : ''}
            onClick={() => setAccount('0975')}
          >
            {accountLabel('0975')}
          </button>
          <button
            type="button"
            className={account === '1018' ? 'is-active' : ''}
            onClick={() => setAccount('1018')}
          >
            {accountLabel('1018')}
          </button>
        </div>
        <label htmlFor="inbox-search">Buscar conversa</label>
        <input
          id="inbox-search"
          type="search"
          placeholder="Telefone ou contato"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          aria-label="Filtrar status"
          value={status ?? ''}
          onChange={(event) => setStatus((event.target.value || null) as ConversationStatus | null)}
        >
          <option value="">Todos os status</option>
          {(Object.keys(STATUS_LABELS) as ConversationStatus[]).map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value]}
            </option>
          ))}
        </select>
      </div>
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
      <div className="da-inbox-layout">
        <div className="da-inbox-list">
          {items.map((conversation) => (
            <button
              type="button"
              key={conversation.id}
              className={'da-inbox-row' + (selected?.id === conversation.id ? ' selected' : '')}
              onClick={() => void select(conversation)}
            >
              <span>
                <b>{conversation.phone}</b>
                <small>
                  {accountLabel(conversation.providerAccount)} · {conversation.status}
                </small>
                <small>{preview(conversation)}</small>
              </span>
              <strong>{conversation.messageCount}</strong>
            </button>
          ))}
          {!loading && !items.length && (
            <div className="da-inbox-empty">Nenhuma conversa para estes filtros.</div>
          )}
          {loading && <div className="da-inbox-empty">Carregando conversas…</div>}
        </div>
        {selected ? (
          <article className="da-inbox-detail" aria-label={`Conversa ${selected.phone}`}>
            <header>
              <div>
                <small>{accountLabel(selected.providerAccount)}</small>
                <h2>{selected.phone}</h2>
                <p>
                  Contato {selected.externalContactId} · {selected.status}
                </p>
              </div>
              <span>
                {selected.orderId ? `Pedido ${selected.orderId}` : 'Sem pedido vinculado'}
              </span>
            </header>
            <div className="da-inbox-messages" aria-live="polite">
              {selected.messages.map((item) => (
                <div
                  className={
                    'da-inbox-message ' + (item.direction === 'SAIDA' ? 'outgoing' : 'incoming')
                  }
                  key={item.id}
                >
                  <small>
                    {item.direction === 'SAIDA' ? 'Equipe V2' : 'Cliente'} · {item.deliveryStatus}
                  </small>
                  {item.contentText && <p>{item.contentText}</p>}
                  {item.mediaMetadata.map((media, index) => (
                    <div className="da-inbox-media" key={`${item.id}-${index}`}>
                      Áudio/anexo · {media.mimeType ?? media.type}
                      {media.durationSeconds ? ` · ${media.durationSeconds}s` : ''}
                    </div>
                  ))}
                </div>
              ))}
              {!selected.messages.length && (
                <div className="da-inbox-empty">Nenhuma mensagem registrada.</div>
              )}
            </div>
            <div className="da-inbox-compose">
              <label htmlFor="inbox-draft">Resposta (somente fila V2)</label>
              <textarea
                id="inbox-draft"
                rows={3}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Escreva uma resposta de teste…"
              />
              <button type="button" disabled={saving || !draft.trim()} onClick={() => void queue()}>
                {saving ? 'Registrando…' : 'Registrar na fila V2'}
              </button>
            </div>
          </article>
        ) : (
          <div className="da-inbox-placeholder">
            <b>Selecione uma conversa</b>
            <span>Telefone, pedido relacionado e mensagens aparecem aqui.</span>
          </div>
        )}
      </div>
    </section>
  );
}
