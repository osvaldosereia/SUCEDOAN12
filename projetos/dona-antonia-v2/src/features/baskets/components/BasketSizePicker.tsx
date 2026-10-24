import type {BasketId,BasketTemplate} from '../../../core/model';
import {formatBRL} from '../../../core/money';
import {SquareImage} from '../../../ui/media/SquareImage';

interface Props {
  selectedId:BasketId;
  templates:readonly BasketTemplate[];
  baseTotal:(id:BasketId)=>number|null;
  onChange:(id:BasketId)=>void;
}
/** Mostra os tamanhos sem acessar catálogo nem depender de dados demonstrativos. */
export function BasketSizePicker({selectedId,templates,baseTotal,onChange}:Props){
  return <section className="basket-size-section" aria-label="Selecione o tamanho da cesta">
    <div className="basket-size-heading">
      <div><span className="store-section-kicker">PASSO 1</span><h2>Escolha o tamanho da sua cesta</h2>
        <p>Você poderá trocar as marcas e ajustar as quantidades.</p></div>
      <span className="basket-size-counter">{templates.length} opções</span>
    </div>
    <div className="size-picker">
      {templates.filter(item=>item.active).map(item=>{
        const price=baseTotal(item.id);
        const pieces=item.lines.reduce((sum,line)=>sum+line.defaultQuantity,0);
        const selected=selectedId===item.id;
        return <button key={item.id} type="button"
          className={'size-card '+(selected?'selected':'')}
          aria-pressed={selected} onClick={()=>onChange(item.id)}>
          <span className="basket-image-wrap"><SquareImage src={item.imageUrl} alt={'Cesta '+item.name} kind="basket" priority={item.id==='mini'}/></span>
          <span className="basket-card-title">{item.name}</span>
          <span className="basket-card-count">{pieces} itens</span>
          <span className="basket-card-price"><small>A partir de</small><strong>{price===null?'Indisponível':formatBRL(price)}</strong></span>
          <span className="basket-card-selected" aria-hidden="true">{selected?'✓ Selecionada':'Escolher cesta'}</span>
        </button>;
      })}
    </div>
  </section>;
}
