import { formatBRL } from '../../../core/money';
import type { Product, ProductType } from '../../../core/model';

interface Props {
  types: readonly ProductType[];
  selectedTypeId: string;
  setSelectedTypeId: (id: string) => void;
  newTypeName: string;
  setNewTypeName: (name: string) => void;
  addType: () => void;
  selectedType: ProductType | undefined;
  filteredProducts: readonly Product[];
  filter: string;
  setFilter: (value: string) => void;
  toggleOption: (sku: string) => void;
}
export function ProductTypesPanel({
  types,
  selectedTypeId,
  setSelectedTypeId,
  newTypeName,
  setNewTypeName,
  addType,
  selectedType,
  filteredProducts,
  filter,
  setFilter,
  toggleOption,
}: Props) {
  return (
    <div className="admin-grid">
      <section className="panel">
        <h2>Tipos cadastrados</h2>
        <p>Arroz, feijão e outros grupos de escolha para as cestas.</p>
        <div className="type-list">
          {types.map((type) => (
            <button
              key={type.id}
              className={'type-row ' + (type.id === selectedTypeId ? 'active' : '')}
              onClick={() => setSelectedTypeId(type.id)}
            >
              <b>{type.name}</b>
              <small>{type.productSkus.length} produtos</small>
            </button>
          ))}
        </div>
        <div className="form-row">
          <input
            className="input"
            placeholder="Novo tipo, ex.: Farinha"
            aria-label="Nome do novo tipo"
            value={newTypeName}
            onChange={(e) => setNewTypeName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addType();
            }}
          />
          <button className="secondary-button" onClick={addType}>
            Adicionar
          </button>
        </div>
      </section>
      <section className="panel">
        <h2>Produtos permitidos: {selectedType?.name}</h2>
        <p>
          Marque os SKUs reais que o cliente poderá escolher neste tipo. Produtos inativos não serão
          vendidos.
        </p>
        <input
          className="input"
          placeholder="Filtrar por nome ou EAN"
          aria-label="Buscar produtos para o tipo"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="option-checks">
          {filteredProducts.map((product) => (
            <label className="check-row" key={product.sku}>
              <input
                type="checkbox"
                checked={selectedType?.productSkus.includes(product.sku) ?? false}
                onChange={() => toggleOption(product.sku)}
              />
              <span>
                <b>{product.name}</b>
                <small>
                  {product.sku} · {formatBRL(product.priceCents)}
                </small>
              </span>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
