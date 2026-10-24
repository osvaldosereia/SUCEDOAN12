import { useEffect, useMemo, useState } from 'react';
import { formatBRL } from '../../../core/money';
import { CATEGORIES } from '../../../core/model';
import type { Category, Product } from '../../../core/model';
import { SquareImage } from '../../../ui/media/SquareImage';

interface Props {
  products: readonly Product[];
  filteredProducts: readonly Product[];
  filter: string;
  setFilter: (value: string) => void;
  changeProduct: (sku: string, patch: Partial<Product>) => void;
}
type StockFilter = 'todos' | 'ativos' | 'inativos' | 'zerados';
const FILTERS: [StockFilter, string][] = [
  ['todos', 'Todos'],
  ['ativos', 'Ativos'],
  ['inativos', 'Inativos'],
  ['zerados', 'Sem estoque'],
];
const PAGE_SIZE = 30;
export function ProductsPanel({
  products,
  filteredProducts,
  filter,
  setFilter,
  changeProduct,
}: Props) {
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [status, setStatus] = useState<StockFilter>('todos');
  const [maxRows, setMaxRows] = useState(PAGE_SIZE);
  useEffect(() => setMaxRows(PAGE_SIZE), [filter, category, status]);
  const result = useMemo(
    () =>
      filteredProducts
        .filter(
          (product) =>
            (category === 'all' || product.category === category) &&
            (status === 'todos' ||
              (status === 'ativos' && product.active) ||
              (status === 'inativos' && !product.active) ||
              (status === 'zerados' && product.stock === 0)),
        )
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [filteredProducts, category, status],
  );
  return (
    <section className="panel da-products-panel" aria-label="Cadastro de produtos">
      <div className="panel-heading">
        <div>
          <h2>Produtos cadastrados</h2>
          <p>Encontre e edite estoque ou disponibilidade sem sair da lista.</p>
        </div>
        <span className="pill">{products.length} itens de exemplo</span>
      </div>
      <div className="da-products-toolbar">
        <input
          className="input"
          aria-label="Buscar produtos"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Buscar por nome, marca, SKU ou EAN..."
        />
        <select
          className="input"
          aria-label="Filtrar categoria"
          value={category}
          onChange={(event) => setCategory(event.target.value as Category | 'all')}
        >
          <option value="all">Todas as categorias</option>
          {CATEGORIES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div className="da-products-tabs" role="group" aria-label="Filtrar situação">
        {FILTERS.map(([key, label]) => (
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
      <div className="da-list-meta">
        <span>{result.length} produto(s) encontrado(s)</span>
        <span>Alterações apenas nesta prévia</span>
      </div>
      <div className="scroll-table">
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th>SKU / EAN</th>
              <th>Categoria</th>
              <th>Preço</th>
              <th>Estoque</th>
              <th>Ativo</th>
            </tr>
          </thead>
          <tbody>
            {result.slice(0, maxRows).map((item) => (
              <tr key={item.sku}>
                <td>
                  <div className="da-product-cell">
                    <span className="da-product-thumb">
                      <SquareImage src={item.imageUrl} alt={item.name} kind="product" />
                    </span>
                    <span>
                      <b>{item.name}</b>
                      <small>{item.brand}</small>
                    </span>
                  </div>
                </td>
                <td>
                  <code>{item.sku}</code>
                  <small>{item.gtin || 'Sem EAN'}</small>
                </td>
                <td>
                  <span className="da-category-tag">{item.category}</span>
                </td>
                <td className="da-money-cell">{formatBRL(item.priceCents)}</td>
                <td>
                  <input
                    className="small-input"
                    type="number"
                    min="0"
                    aria-label={'Estoque ' + item.name}
                    value={item.stock}
                    onChange={(event) =>
                      changeProduct(item.sku, {
                        stock: Math.max(0, Math.trunc(Number(event.target.value) || 0)),
                      })
                    }
                  />
                </td>
                <td>
                  <label className="da-switch-label">
                    <input
                      type="checkbox"
                      aria-label={'Ativar ' + item.name}
                      checked={item.active}
                      onChange={(event) =>
                        changeProduct(item.sku, { active: event.target.checked })
                      }
                    />
                    <span>{item.active ? 'Sim' : 'Não'}</span>
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!result.length && (
        <div className="da-products-empty">
          Nenhum produto encontrado. Altere os filtros ou o termo pesquisado.
        </div>
      )}
      {result.length > maxRows && (
        <div className="da-list-more">
          <button type="button" onClick={() => setMaxRows((value) => value + PAGE_SIZE)}>
            Ver mais produtos ({result.length - maxRows} restantes)
          </button>
        </div>
      )}
      <p className="below-note">
        Cada sabor, aroma ou apresentação é um SKU independente. Em produção, toda edição terá
        gravação e auditoria no backend.
      </p>
    </section>
  );
}
