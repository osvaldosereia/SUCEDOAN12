import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { initialSelections, setSelectionProduct, setSelectionQuantity, summarizeBasket } from './core/basket';
import { initialExtraSelections, selectExtraProduct, summarizeExtras, summarizeOrder } from './core/extras';
import { formatBRL } from './core/money';
import type { BasketId, BasketLineSummary, BasketSelection, Product } from './core/model';
import { DEMO_PRODUCTS, DEMO_TEMPLATES, DEMO_TYPES } from './data/demo';
import { DEMO_EXTRA_GROUPS, DEMO_EXTRA_PRODUCTS, DEMO_EXTRA_TYPES } from './data/demo-extra';
import { loadPublicCatalog } from './data/catalog';
import './styles.css';

type Stage = 'basket' | 'extras' | 'checkout';
const types = [...DEMO_TYPES, ...DEMO_EXTRA_TYPES];

function Row({
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
          <span className="photo-placeholder" aria-hidden="true">▦</span>
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

const titles: Record<Stage,string> = {
  basket:'Monte sua cesta',
  extras:'Escolha produtos extras',
  checkout:'Finalize seu pedido'
};

function Storefront() {
  const [catalog,setCatalog] = useState<readonly Product[]>([...DEMO_PRODUCTS,...DEMO_EXTRA_PRODUCTS]);
  const [isDemo,setIsDemo] = useState(true);
  const [stage,setStage] = useState<Stage>('basket');
  const [basketId,setBasketId] = useState<BasketId>('mini');
  const template = DEMO_TEMPLATES.find((value)=>value.id===basketId)!;
  const [basketChoices,setBasketChoices] = useState<BasketSelection[]>(()=>
    initialSelections(template,types,[...DEMO_PRODUCTS,...DEMO_EXTRA_PRODUCTS]));
  const [extraChoices,setExtraChoices] = useState<BasketSelection[]>(()=>
    initialExtraSelections(DEMO_EXTRA_GROUPS,types,[...DEMO_PRODUCTS,...DEMO_EXTRA_PRODUCTS]));
  const [message,setMessage] = useState('');

  useEffect(()=>{
    const controller = new AbortController();
    loadPublicCatalog(controller.signal).then((result)=>{
      const next=result.isDemo?[...result.products,...DEMO_EXTRA_PRODUCTS]:result.products;
      setCatalog(next);
      setIsDemo(result.isDemo);
      setBasketChoices(initialSelections(template,types,next));
      setExtraChoices(initialExtraSelections(DEMO_EXTRA_GROUPS,types,next));
    }).catch(()=>{});
    return ()=>controller.abort();
    // Catálogo é obtido uma vez; troca de tamanho usa o catálogo carregado sem refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const changeSize=(id:BasketId)=>{
    const nextTemplate=DEMO_TEMPLATES.find((item)=>item.id===id)!;
    setBasketId(id);
    setBasketChoices(initialSelections(nextTemplate,types,catalog));
    setMessage('');
  };
  const computed=useMemo(()=>{
    try {
      const basket = summarizeBasket(template,basketChoices,types,catalog);
      const extras = summarizeExtras(DEMO_EXTRA_GROUPS,extraChoices,types,catalog);
      return {basket,extras,order:summarizeOrder(basket.lines,extras.lines),error:''};
    } catch(error){
      return {basket:null,extras:null,order:null,error:error instanceof Error?error.message:'Erro ao calcular'};
    }
  },[template,basketChoices,extraChoices,catalog]);

  const setQuantity=(mode:'basket'|'extras',id:string,amount:number)=>{
    try {
      const current=mode==='basket'?basketChoices:extraChoices;
      let updated=setSelectionQuantity(current,id,amount);
      if(amount>0 && !updated.find((item)=>item.typeId===id)?.sku){
        const group=types.find((type)=>type.id===id);
        const first=group?.productSkus
          .map((sku)=>catalog.find((item)=>item.sku===sku))
          .filter((item):item is Product=>!!item&&item.active&&item.stock>=amount&&item.priceCents>0)
          .sort((a,b)=>a.priceCents-b.priceCents)[0];
        if(first) updated=setSelectionProduct(updated,id,first.sku,types,catalog);
      }
      if(mode==='basket') summarizeBasket(template,updated,types,catalog);
      else summarizeExtras(DEMO_EXTRA_GROUPS,updated,types,catalog);
      if(mode==='basket')setBasketChoices(updated);
      else setExtraChoices(updated);
      setMessage('');
    }catch(error){setMessage(error instanceof Error?error.message:'Quantidade indisponível');}
  };
  const choose=(mode:'basket'|'extras',typeId:string,sku:string)=>{
    try {
      if(mode==='extras'){
        setExtraChoices((current)=>selectExtraProduct(current,typeId,sku,types,catalog));
      } else {
        let updated=setSelectionProduct(basketChoices,typeId,sku,types,catalog);
        if(updated.find((item)=>item.typeId===typeId)?.quantity===0){
          updated=setSelectionQuantity(updated,typeId,1);
        }
        setBasketChoices(updated);
      }
      setMessage('');
    }catch(error){setMessage(error instanceof Error?error.message:'Produto indisponível');}
  };
  const jump=(next:Stage)=>{
    if(!computed.order||computed.error){
      setMessage('Revise as escolhas indisponíveis antes de continuar.');
      return;
    }
    setMessage('');
    setStage(next);
    window.scrollTo({top:0,behavior:'instant'});
  };
  const total = computed.order?.totalCents??0;
  const baseTotal=(id:BasketId)=>{
    const target=DEMO_TEMPLATES.find((item)=>item.id===id)!;
    try{
      const selected=initialSelections(target,types,catalog);
      const summary=summarizeBasket(target,selected,types,catalog);
      return summary.lines.some((line)=>line.quantity>0&&!line.selected)?null:summary.totalCents;
    }catch{return null;}
  };

  return <div className="site-page">
    <header className="topbar"><div className="container topbar-inner">
      <span className="brand"><span className="brand-mark">DA</span><span>Dona Antônia<small>Cestas personalizáveis</small></span></span>
      <span className="header-note">Cuiabá e Várzea Grande</span>
    </div></header>
    <main className="container site-main wizard-layout">
      <div className="notice" role="status">PROTÓTIPO — Nenhuma compra será enviada. Os preços do exemplo não são ofertas reais.</div>
      {isDemo && <div className="notice muted">Dados de demonstração. A conexão com os produtos reais e o Supabase será feita em uma etapa posterior.</div>}
      <nav className="checkout-progress" aria-label="Progresso do pedido">
        {(['basket','extras','checkout'] as const).map((item,index)=><div key={item}
          className={'progress-step '+(item===stage?'current':'')+' '+(
          (stage==='extras'&&index<1)||(stage==='checkout'&&index<2)?'completed':'')}>
          <span className="progress-number">{index+1}</span>
          <span>{index===0?'Cesta':index===1?'Extras':'Checkout'}</span>
        </div>)}
      </nav>
      <div className="wizard-heading">
        <div><p className="eyebrow">ETAPA {stage==='basket'?1:stage==='extras'?2:3} DE 3</p><h1>{titles[stage]}</h1>
          <p>{stage==='basket'?'Escolha o tamanho, a marca e a quantidade de cada tipo de produto.':stage==='extras'?
          'Complete seu pedido se desejar. Todos os extras são opcionais.':'Confira os produtos e seus dados para a entrega.'}</p>
        </div>
        {stage!=='basket'&&<button type="button" className="back-link" onClick={()=>jump(stage==='checkout'?'extras':'basket')}>← Voltar</button>}
      </div>

      {message||computed.error?<div role="alert" className="error">{message||computed.error}</div>:null}

      {stage==='basket'&&<>
        <section aria-label="Selecione o tamanho da cesta" className="size-picker">
          {DEMO_TEMPLATES.map((item)=>{
            const price=baseTotal(item.id);
            return <button key={item.id} type="button" className={'size-card '+(basketId===item.id?'selected':'')}
              aria-pressed={basketId===item.id} onClick={()=>changeSize(item.id)}>
              <span className="size-icon" aria-hidden="true">▣</span><strong>{item.name}</strong>
              <small>A partir de</small><b>{price===null?'Indisponível':formatBRL(price)}</b>
            </button>;
          })}
        </section>
        <div className="section-title"><div><p className="eyebrow">PERSONALIZAÇÃO</p><h2>Cesta {template.name}</h2></div>
          <p>{computed.basket?.itemCount??0} un.</p></div>
        <div className="basket-lines">{computed.basket?.lines.map((line)=>
          <Row key={line.typeId} mode="basket" line={line} onProduct={(id,sku)=>choose('basket',id,sku)}
            onQuantity={(id,qty)=>setQuantity('basket',id,qty)}/>)}</div>
      </>}
      {stage==='extras'&&<>
        <div className="extras-intro"><div><strong>Deixe sua cesta ainda mais completa</strong><p>Escolha o que quiser. Se não precisar de extras, avance direto para o checkout.</p></div>
          <span>Opcionais</span></div>
        <div className="basket-lines">{computed.extras?.lines.map((line)=>
          <Row key={line.typeId} mode="extras" line={line} onProduct={(id,sku)=>choose('extras',id,sku)}
            onQuantity={(id,qty)=>setQuantity('extras',id,qty)}/>)}</div>
        {!computed.extras?.lines.length&&<div className="notice muted">Nenhum tipo extra foi configurado nesta prévia.</div>}
      </>}
      {stage==='checkout'&&<div className="checkout-layout">
        <section className="panel checkout-panel">
          <h2>Seus produtos</h2><p>Confira os itens e retorne à etapa anterior se desejar mudar marca ou quantidade.</p>
          {(computed.order?.lines??[]).map((line)=><div className="checkout-line" key={line.sku}>
            <div><b>{line.name}</b><small>{line.quantity} un. × {formatBRL(line.priceCents)}</small></div>
            <strong>{formatBRL(line.totalCents)}</strong></div>)}
          <div className="order-total"><strong>Total dos produtos</strong><strong>{formatBRL(total)}</strong></div>
          <div className="checkout-edit-actions">
            <button type="button" className="back-link" onClick={()=>jump('basket')}>Editar cesta</button>
            <button type="button" className="back-link" onClick={()=>jump('extras')}>Editar extras</button>
          </div>
        </section>
        <section className="panel checkout-panel">
          <h2>Dados para entrega</h2>
          <p>Esta é somente uma demonstração visual. Os dados não são enviados nem armazenados.</p>
          <form className="checkout-form" onSubmit={(event)=>event.preventDefault()}>
            <label>Nome completo<input type="text" autoComplete="name" placeholder="Seu nome" /></label>
            <label>WhatsApp<input type="tel" autoComplete="tel" inputMode="tel" placeholder="(65) 99999-9999" /></label>
            <label>Endereço de entrega<input type="text" autoComplete="street-address" placeholder="Rua, número e bairro" /></label>
            <label>Forma de pagamento<select defaultValue=""><option value="" disabled>Selecione na entrega</option>
              <option>PIX na entrega</option><option>Dinheiro</option><option>Cartão de crédito</option>
              <option>Vale-alimentação/refeição</option></select></label>
            <div className="notice muted">A confirmação do pedido será habilitada somente após autenticação do admin, banco seguro e integração de pedidos.</div>
            <button type="button" className="primary-button" disabled>Confirmação indisponível nesta prévia</button>
          </form>
        </section>
      </div>}
      {stage!=='checkout'&&<p className="below-note">Valores ilustrativos. No sistema final, preços e estoque serão revalidados antes da confirmação.</p>}
    </main>
    {stage!=='checkout'&&<footer className="sticky-summary" aria-label="Resumo fixo do pedido">
      <div><small>{stage==='basket'?'Total da cesta':'Cesta + extras'}</small>
        <strong>{formatBRL(stage==='basket'?computed.basket?.totalCents??0:total)}</strong></div>
      <button type="button" className="primary-button" disabled={!computed.order || !!computed.error}
        onClick={()=>jump(stage==='basket'?'extras':'checkout')}>
        {stage==='basket'?'Próximo →':'Finalizar pedido →'}
      </button>
    </footer>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><Storefront/></React.StrictMode>);
