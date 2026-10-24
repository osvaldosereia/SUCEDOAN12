import {useRef} from 'react';
import type {BasketLineSummary} from '../../../core/model';
import {formatBRL} from '../../../core/money';
import {SquareImage} from '../../../ui/media/SquareImage';

export function ProductTypeRow({
  line, mode, onProduct, onQuantity
}: {
  line: BasketLineSummary;
  mode: 'basket'|'extras';
  onProduct: (typeId: string, sku: string) => void;
  onQuantity: (typeId: string, quantity: number) => void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const chosen = line.quantity > 0 ? line.selected?.sku : undefined;
  const quantity = line.quantity;
  return <section className="basket-group choice-group" aria-label={'Escolher '+line.typeName}>
    <div className="group-head">
      <div><h3>{line.typeName}</h3><small>{line.options.length} opções · Arraste para ver outras marcas</small></div>
      <strong>{formatBRL(line.totalCents)}</strong>
    </div>
    <div className="carousel-shell">
      <div className="carousel-arrows">
        <button type="button" aria-label={'Ver produtos anteriores de '+line.typeName}
          onClick={()=>scroll.current?.scrollBy({left:-240,behavior:'smooth'})}>‹</button>
        <button type="button" aria-label={'Ver próximos produtos de '+line.typeName}
          onClick={()=>scroll.current?.scrollBy({left:240,behavior:'smooth'})}>›</button>
      </div>
      <div ref={scroll} className="options-scroller compact-carousel" role="group" aria-label={'Variações de '+line.typeName}>
        {line.options.map((product) => <button key={product.sku} type="button"
          className={'product-choice compact-choice '+(chosen===product.sku?'chosen':'')}
          aria-pressed={chosen===product.sku} onClick={()=>onProduct(line.typeId,product.sku)}>
          <SquareImage src={product.imageUrl} alt={product.name} kind="product"/>
          <span className="choice-name">{product.name}</span>
          <span className="choice-price">{formatBRL(product.priceCents)}</span>
          <span className="choice-tag">{chosen===product.sku?'✓ Escolhido':'Escolher'}</span>
        </button>)}
        {line.options.length===0 && <div className="empty-options" role="status">Nenhuma opção disponível para esta quantidade. Escolha outra quantidade ou consulte o atendimento.</div>}
      </div>
    </div>
    <div className="group-controls product-quantity-row">
      <div className="quantity-info"><b>{mode==='extras'?'Adicionar ao pedido':'Quantidade na cesta'}</b>
        <small>{line.selected && quantity>0?line.selected.name:quantity===0?'Não incluído':'Escolha uma marca'}</small>
      </div>
      <div className="stepper" role="group" aria-label={'Quantidade de '+line.typeName}>
        <button type="button" aria-label={'Diminuir '+line.typeName} disabled={quantity===0}
          onClick={()=>onQuantity(line.typeId,Math.max(0,quantity-1))}>−</button>
        <output aria-live="polite">{quantity}</output>
        <button type="button" aria-label={'Aumentar '+line.typeName}
          disabled={!line.options.length || quantity>=999} onClick={()=>onQuantity(line.typeId,quantity+1)}>+</button>
      </div>
      {quantity>0 && <button type="button" className="text-button" onClick={()=>onQuantity(line.typeId,0)}>Remover</button>}
    </div>
  </section>;
}

