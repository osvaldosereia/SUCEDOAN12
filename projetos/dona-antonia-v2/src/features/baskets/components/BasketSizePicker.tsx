import type {BasketId} from '../../../core/model';
import {DEMO_TEMPLATES} from '../../../data/demo';
import {formatBRL} from '../../../core/money';

interface Props {
  selectedId: BasketId;
  baseTotal: (id: BasketId) => number | null;
  onChange: (id: BasketId) => void;
}
export function BasketSizePicker({selectedId,baseTotal,onChange}: Props) {
  const basketId=selectedId;
  const changeSize=onChange;
  return <>
        <section aria-label="Selecione o tamanho da cesta" className="size-picker">
          {DEMO_TEMPLATES.map((item)=>{
            const price=baseTotal(item.id);
            return <button key={item.id} type="button" className={'size-card '+(basketId===item.id?'selected':'')}
              aria-pressed={basketId===item.id} onClick={()=>changeSize(item.id)}>
              <span className="basket-square-placeholder" aria-hidden="true">▣</span><strong>{item.name}</strong>
              <small>A partir de</small><b>{price===null?'Indisponível':formatBRL(price)}</b>
            </button>;
          })}
        </section>
  </>;
}
