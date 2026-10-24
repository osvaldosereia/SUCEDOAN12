import { formatBRL } from '../../../core/money';
import type { AdminProduct } from '../../../application/admin-products';
import { SquareImage } from '../../../ui/media/SquareImage';
import type { AdminProductsRepository } from '../../../application/admin-products';
import { ProductPrivateProfileAction } from './ProductPrivateProfileAction';

interface Props {
  products: readonly AdminProduct[];
  onEdit: (product: AdminProduct) => void;
  onOpenStockHistory: (product: AdminProduct) => void;
  privateRepository?: AdminProductsRepository;
  onPrivateProfileSaved?: (message: string) => void;
}

export function ProductTable({
  products,
  onEdit,
  onOpenStockHistory,
  privateRepository,
  onPrivateProfileSaved,
}: Props) {
  return (
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
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {products.map((item) => (
            <tr key={item.id}>
              <td>
                <div className="da-product-cell">
                  <span className="da-product-thumb">
                    <SquareImage src={item.photoUrl} alt={item.name} kind="product" />
                  </span>
                  <span>
                    <b>{item.name}</b>
                    <small>{item.brand || 'Sem marca'}</small>
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
              <td>{item.stockUnits.toLocaleString('pt-BR')} un.</td>
              <td>
                <span className={item.active ? 'da-product-status is-active' : 'da-product-status'}>
                  {item.active ? 'Ativo' : 'Inativo'}
                </span>
              </td>
              <td>
                <div className="da-product-row-actions">
                  <button
                    type="button"
                    className="da-button-secondary"
                    onClick={() => onEdit(item)}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="da-button-secondary"
                    onClick={() => onOpenStockHistory(item)}
                  >
                    Estoque
                  </button>
                  {privateRepository && onPrivateProfileSaved && (
                    <ProductPrivateProfileAction
                      product={item}
                      repository={privateRepository}
                      onSaved={onPrivateProfileSaved}
                    />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
