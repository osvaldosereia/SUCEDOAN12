import { useState, type FormEvent } from 'react';
import { CATEGORIES } from '../../../core/model';
import type { Category } from '../../../core/model';
import { normalizeProductDraft } from '../../../application/admin-products';
import type {
  AdminProduct,
  AdminProductDraft,
  ProductStockMovement,
} from '../../../application/admin-products';

const EMPTY_DRAFT: AdminProductDraft = {
  sku: '',
  name: '',
  brand: '',
  category: 'MERCEARIA BÁSICA',
  gtin: null,
  priceCents: 0,
  stockUnits: 0,
  active: false,
  photoUrl: null,
  validUntil: null,
};

function priceText(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function priceCents(value: string): number {
  const normalized = value.trim().replace(/\./g, '').replace(',', '.');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : Number.NaN;
}

function toDraft(form: HTMLFormElement): AdminProductDraft {
  const values = new FormData(form);
  return normalizeProductDraft({
    sku: String(values.get('sku') ?? ''),
    name: String(values.get('name') ?? ''),
    brand: String(values.get('brand') ?? ''),
    category: String(values.get('category') ?? '') as Category,
    gtin: String(values.get('gtin') ?? '') || null,
    priceCents: priceCents(String(values.get('price') ?? '')),
    stockUnits: Number(values.get('stock_units')),
    active: values.get('active') === 'on',
    photoUrl: String(values.get('photo_url') ?? '') || null,
    validUntil: String(values.get('valid_until') ?? '') || null,
  });
}

export function ProductEditor({
  product,
  saving,
  onCancel,
  onSave,
}: {
  product: AdminProduct | null;
  saving: boolean;
  onCancel: () => void;
  onSave: (draft: AdminProductDraft, stockNote: string) => Promise<void>;
}) {
  const [error, setError] = useState('');
  const draft = product ?? EMPTY_DRAFT;
  const [price, setPrice] = useState(priceText(draft.priceCents));
  const [stock, setStock] = useState(String(draft.stockUnits));
  const [stockNote, setStockNote] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      const next = toDraft(event.currentTarget);
      if (next.stockUnits !== draft.stockUnits && stockNote.trim().length < 3) {
        setError('Explique o motivo do ajuste de estoque.');
        return;
      }
      await onSave(next, stockNote.trim());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Confira os dados e tente novamente.');
    }
  }

  return (
    <div
      className="da-product-modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onCancel()}
    >
      <section
        className="da-product-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="da-product-editor-heading"
      >
        <form onSubmit={submit}>
          <header>
            <div>
              <p className="da-page-kicker">CATÁLOGO / PRODUTOS</p>
              <h2 id="da-product-editor-heading">{product ? 'Editar produto' : 'Novo produto'}</h2>
            </div>
            <button
              type="button"
              className="da-product-close"
              aria-label="Fechar"
              onClick={onCancel}
            >
              ×
            </button>
          </header>
          <div className="da-product-form-grid">
            <label>
              SKU
              <input
                name="sku"
                required
                maxLength={120}
                defaultValue={draft.sku}
                disabled={!!product}
              />
            </label>
            <label>
              Nome do produto
              <input name="name" required maxLength={240} defaultValue={draft.name} />
            </label>
            <label>
              Marca
              <input name="brand" maxLength={120} defaultValue={draft.brand} />
            </label>
            <label>
              Categoria
              <select name="category" defaultValue={draft.category}>
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label>
              EAN / GTIN
              <input name="gtin" inputMode="numeric" defaultValue={draft.gtin ?? ''} />
            </label>
            <label>
              Preço de venda (R$)
              <input
                name="price"
                inputMode="decimal"
                required
                value={price}
                onChange={(event) => setPrice(event.target.value)}
              />
            </label>
            <label>
              Estoque (unidades)
              <input
                name="stock_units"
                type="number"
                min="0"
                step="1"
                required
                value={stock}
                onChange={(event) => setStock(event.target.value)}
              />
            </label>
            <label>
              Validade
              <input name="valid_until" type="date" defaultValue={draft.validUntil ?? ''} />
            </label>
            <label className="da-product-form-wide">
              URL da foto (HTTPS)
              <input
                name="photo_url"
                type="url"
                placeholder="https://..."
                defaultValue={draft.photoUrl ?? ''}
              />
            </label>
            <label className="da-product-form-wide">
              Motivo do ajuste de estoque
              <input
                name="stock_note"
                value={stockNote}
                onChange={(event) => setStockNote(event.target.value)}
                placeholder="Ex.: conferência física do estoque"
                disabled={Number(stock) === draft.stockUnits}
              />
            </label>
            <label className="da-product-active da-product-form-wide">
              <input name="active" type="checkbox" defaultChecked={draft.active} />
              Produto ativo
            </label>
          </div>
          {error && (
            <p className="da-product-form-error" role="alert">
              {error}
            </p>
          )}
          <footer>
            <button
              type="button"
              className="da-button-secondary"
              onClick={onCancel}
              disabled={saving}
            >
              Cancelar
            </button>
            <button type="submit" className="da-button-primary" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar produto'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

export function StockHistory({
  title,
  rows,
  loading,
  onClose,
}: {
  title: string;
  rows: readonly ProductStockMovement[];
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className="da-product-modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="da-product-history"
        role="dialog"
        aria-modal="true"
        aria-labelledby="da-product-history-heading"
      >
        <header>
          <div>
            <p className="da-page-kicker">ESTOQUE / HISTÓRICO</p>
            <h2 id="da-product-history-heading">{title}</h2>
          </div>
          <button type="button" className="da-product-close" aria-label="Fechar" onClick={onClose}>
            ×
          </button>
        </header>
        {loading ? (
          <p role="status">Carregando histórico…</p>
        ) : rows.length ? (
          <ul>
            {rows.map((row) => (
              <li key={row.id}>
                <b>
                  {row.deltaUnits > 0 ? '+' : ''}
                  {row.deltaUnits} un.
                </b>
                <span>{row.note || row.reason}</span>
                <time dateTime={row.createdAt}>
                  {new Date(row.createdAt).toLocaleString('pt-BR')}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p>Nenhuma movimentação de estoque registrada.</p>
        )}
        <footer>
          <button type="button" className="da-button-secondary" onClick={onClose}>
            Fechar
          </button>
        </footer>
      </section>
    </div>
  );
}
