import {formatBRL} from '../../../core/money';
import {CATEGORIES} from '../../../core/model';
import type {Product} from '../../../core/model';

interface Props {
  products: readonly Product[];
  filteredProducts: readonly Product[];
  filter: string;
  setFilter: (value:string)=>void;
  changeProduct: (sku:string,patch:Partial<Product>)=>void;
}
export function ProductsPanel({products,filteredProducts,filter,setFilter,changeProduct}:Props) {
  return <section className="panel">
        <div className="panel-heading"><div><h2>Produtos cadastrados</h2><p>Cada sabor e apresentação possui SKU próprio; filtro por nome, EAN ou código.</p></div>
          <span className="pill">{products.length} itens de exemplo</span></div>
        <input className="input" aria-label="Buscar produtos" value={filter} onChange={(e)=>setFilter(e.target.value)} placeholder="Buscar produto, código ou EAN..." />
        <div className="scroll-table"><table><thead><tr><th>Produto</th><th>SKU / EAN</th><th>Categoria</th><th>Preço</th><th>Estoque simulado</th><th>Ativo no exemplo</th></tr></thead><tbody>
          {filteredProducts.map((item)=><tr key={item.sku}>
            <td><b>{item.name}</b><small>{item.brand}</small></td>
            <td><code>{item.sku}</code><small>{item.gtin||'Sem GTIN'}</small></td>
            <td>{item.category}</td><td>{formatBRL(item.priceCents)}</td>
            <td><input className="small-input" type="number" min="0" aria-label={'Estoque '+item.name} value={item.stock} onChange={(e)=>changeProduct(item.sku,{stock:Math.max(0,Math.trunc(Number(e.target.value)||0))})}/></td>
            <td><input type="checkbox" aria-label={'Ativar '+item.name} checked={item.active} onChange={(e)=>changeProduct(item.sku,{active:e.target.checked})}/></td>
          </tr>)}
        </tbody></table></div>
        <p className="below-note">Categorias reconhecidas: {CATEGORIES.join(' · ')}</p>
      </section>;
}
