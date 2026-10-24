import { useEffect, useState } from 'react';
import { CATEGORIES } from '../../../core/model';
import type { Category } from '../../../core/model';
import type {
  AdminProduct,
  AdminProductDraft,
  AdminProductQuery,
  AdminProductsRepository,
  ProductStockMovement,
} from '../../../application/admin-products';
import { ProductTable } from './ProductTable';
import { ProductEditor, StockHistory } from './ProductDialogs';

const PAGE_SIZE = 30;
const STATUS_LABELS: ReadonlyArray<[AdminProductQuery['status'], string]> = [
  ['todos', 'Todos'],
  ['ativos', 'Ativos'],
  ['inativos', 'Inativos'],
  ['zerados', 'Sem estoque'],
];
interface Props {
  repository: AdminProductsRepository;
  canManagePrivate: boolean;
}

export function PersistentProductsPanel({ repository, canManagePrivate }: Props) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const [status, setStatus] = useState<AdminProductQuery['status']>('todos');
  const [pageNumber, setPageNumber] = useState(1);
  const [page, setPage] = useState<Awaited<ReturnType<AdminProductsRepository['list']>> | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [editor, setEditor] = useState<AdminProduct | null | undefined>();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [historyProduct, setHistoryProduct] = useState<AdminProduct | null>(null);
  const [history, setHistory] = useState<readonly ProductStockMovement[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(
      () => {
        setLoading(true);
        setError('');
        void repository
          .list({ search, category, status, page: pageNumber, pageSize: PAGE_SIZE })
          .then((result) => {
            if (active) setPage(result);
          })
          .catch((caught: unknown) => {
            if (active) {
              setPage(null);
              setError(
                caught instanceof Error ? caught.message : 'Não foi possível carregar o catálogo.',
              );
            }
          })
          .finally(() => {
            if (active) setLoading(false);
          });
      },
      search ? 220 : 0,
    );
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [repository, search, category, status, pageNumber, refreshKey]);

  useEffect(() => {
    setPageNumber(1);
  }, [search, category, status]);

  async function saveProduct(draft: AdminProductDraft, stockNote: string) {
    setSaving(true);
    setNotice('');
    try {
      const current = editor ?? null;
      const patch = current
        ? Object.fromEntries(
            Object.entries(draft).filter(
              ([key, value]) =>
                value !==
                current[
                  {
                    sku: 'sku',
                    name: 'name',
                    brand: 'brand',
                    category: 'category',
                    gtin: 'gtin',
                    priceCents: 'priceCents',
                    stockUnits: 'stockUnits',
                    active: 'active',
                    photoUrl: 'photoUrl',
                    validUntil: 'validUntil',
                  }[key as keyof AdminProductDraft] as keyof AdminProduct
                ],
            ),
          )
        : draft;
      if (current && Object.keys(patch).length === 0) {
        setEditor(undefined);
        setNotice('Nenhuma alteração para salvar.');
        return;
      }
      await repository.save({
        id: current?.id ?? null,
        expectedRevision: current?.revision ?? null,
        patch: patch as AdminProductDraft,
        requestId: crypto.randomUUID(),
        stockNote: draft.stockUnits !== (current?.stockUnits ?? 0) ? stockNote : null,
      });
      setEditor(undefined);
      setNotice(current ? 'Produto salvo.' : 'Produto cadastrado.');
      setRefreshKey((key) => key + 1);
    } finally {
      setSaving(false);
    }
  }

  async function openHistory(product: AdminProduct) {
    setHistoryProduct(product);
    setHistory([]);
    setHistoryLoading(true);
    try {
      setHistory(await repository.listStockMovements(product.id));
    } catch (caught) {
      setNotice(
        caught instanceof Error ? caught.message : 'Não foi possível carregar o histórico.',
      );
    } finally {
      setHistoryLoading(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil((page?.total ?? 0) / PAGE_SIZE));
  const first = page && page.total ? (pageNumber - 1) * PAGE_SIZE + 1 : 0;
  const last = page ? Math.min(pageNumber * PAGE_SIZE, page.total) : 0;

  return (
    <section
      className="panel da-products-panel da-products-persistent"
      aria-label="Cadastro de produtos"
    >
      <div className="panel-heading">
        <div>
          <h2>Produtos</h2>
          <p>Catálogo V2 com busca e paginação no servidor.</p>
        </div>
        <div className="da-products-head-actions">
          <span className="pill">{page ? `${page.total} produtos` : 'V2 isolada'}</span>
          <button type="button" className="da-button-primary" onClick={() => setEditor(null)}>
            Adicionar produto
          </button>
        </div>
      </div>
      <div className="da-products-toolbar">
        <input
          className="input"
          aria-label="Buscar produtos"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nome, marca, SKU ou EAN…"
        />
        <select
          className="input"
          aria-label="Filtrar categoria"
          value={category ?? ''}
          onChange={(event) => setCategory((event.target.value || null) as Category | null)}
        >
          <option value="">Todas as categorias</option>
          {CATEGORIES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div className="da-products-tabs" role="group" aria-label="Filtrar situação">
        {STATUS_LABELS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={status === key}
            className={status === key ? 'selected' : ''}
            onClick={() => setStatus(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {notice && (
        <p className="da-products-notice" role="status">
          {notice}
        </p>
      )}
      <div className="da-list-meta">
        <span>{page ? `${first}–${last} de ${page.total}` : 'Catálogo V2'}</span>
        <span>Alterações são salvas no Supabase V2</span>
      </div>
      {loading && (
        <p className="da-products-state" role="status">
          Carregando produtos…
        </p>
      )}
      {error && (
        <div className="da-products-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="da-button-secondary"
            onClick={() => setRefreshKey((key) => key + 1)}
          >
            Tentar novamente
          </button>
        </div>
      )}
      {!loading && !error && page && (
        <>
          <ProductTable
            products={page.items}
            onEdit={setEditor}
            onOpenStockHistory={(item) => void openHistory(item)}
            privateRepository={canManagePrivate ? repository : undefined}
            onPrivateProfileSaved={canManagePrivate ? setNotice : undefined}
          />
          {!page.items.length && (
            <div className="da-products-empty">
              Nenhum produto encontrado. Altere os filtros ou o termo pesquisado.
            </div>
          )}
          <nav className="da-products-pagination" aria-label="Paginação dos produtos">
            <button
              type="button"
              className="da-button-secondary"
              disabled={pageNumber <= 1}
              onClick={() => setPageNumber((current) => current - 1)}
            >
              Anterior
            </button>
            <span>
              Página {pageNumber} de {totalPages}
            </span>
            <button
              type="button"
              className="da-button-secondary"
              disabled={pageNumber >= totalPages}
              onClick={() => setPageNumber((current) => current + 1)}
            >
              Próxima
            </button>
          </nav>
        </>
      )}
      {editor !== undefined && (
        <ProductEditor
          key={editor?.id ?? 'new'}
          product={editor}
          saving={saving}
          onCancel={() => setEditor(undefined)}
          onSave={saveProduct}
        />
      )}
      {historyProduct && (
        <StockHistory
          title={historyProduct.name}
          rows={history}
          loading={historyLoading}
          onClose={() => setHistoryProduct(null)}
        />
      )}
    </section>
  );
}
