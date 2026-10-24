import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { initialSelections, setSelectionProduct, setSelectionQuantity, summarizeBasket } from './core/basket';
import { formatBRL } from './core/money';
import type { BasketId, BasketSelection, Product } from './core/model';
import { DEMO_PRODUCTS, DEMO_TEMPLATES, DEMO_TYPES } from './data/demo';
import { loadPublicCatalog } from './data/catalog';
import './styles.css';

function Site() {
  const [products, setProducts] = useState<readonly Product[]>(DEMO_PRODUCTS);
  const [isDemo, setIsDemo] = useState(true);
  const [basketId, setBasketId] = useState<BasketId>('mini');
  const template = DEMO_TEMPLATES.find((item) => item.id === basketId)!;
  const [selections, setSelections] = useState<BasketSelection[]>(() =>
    initialSelections(template, DEMO_TYPES, DEMO_PRODUCTS));
  const [error, setError] = useState('');
  const [showOrder, setShowOrder] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    loadPublicCatalog(controller.signal)
      .then((data) => { setProducts(data.products); setIsDemo(data.isDemo); })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    setSelections(initialSelections(template, DEMO_TYPES, products));
    setError('');
    setShowOrder(false);
  }, [basketId, products, template]);

  const summary = useMemo(() => {
    try {
      return { value: summarizeBasket(template, selections, DEMO_TYPES, products), error:'' };
    } catch (issue) {
      return { value:null, error: issue instanceof Error ? issue.message : 'Erro na cesta' };
    }
  }, [template, selections, products]);

  const changeQuantity = (typeId: string, quantity: number) => {
    try {
      const updated = setSelectionQuantity(selections, typeId, quantity);
      summarizeBasket(template, updated, DEMO_TYPES, products);
      setSelections(updated);
      setError('');
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Quantidade indisponível');
    }
  };
  const changeProduct = (typeId: string, sku: string) => {
    try {
      setSelections(setSelectionProduct(selections, typeId, sku, DEMO_TYPES, products));
      setError('');
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Produto indisponível');
    }
  };
  const sum = summary.value;

  return <div className="site-page">
    <header className="topbar"><div className="container topbar-inner">
      <a className="brand" href="/" aria-label="Dona Antônia, início"><span className="brand-mark">DA</span><span>Dona Antônia<small>Cestas personalizáveis</small></span></a>
      <span className="header-note">Entrega em Cuiabá e Várzea Grande</span>
    </div></header>
    <main className="container site-main">
      <div className="notice" role="status">PRÉVIA DE DESENVOLVIMENTO — Nenhum pedido será enviado.</div>
      {isDemo && <div className="notice muted">Catálogo demonstrativo: estoque simulado apenas para testar a experiência. Os 802 produtos reais dependem da importação e do balanço.</div>}
      <section className="hero">
        <div><p className="eyebrow">CESTA DO SEU JEITO</p><h1>Escolha os produtos. Ajuste a quantidade. Veja o valor na hora.</h1>
          <p>Selecione um tamanho para começar. Em cada tipo você pode escolher a marca, aumentar, diminuir ou retirar.</p>
        </div>
      </section>
      <section aria-label="Tamanhos disponíveis" className="size-picker">
        {DEMO_TEMPLATES.map((item) => <button key={item.id} type="button" className={'size-card ' + (item.id===basketId?'selected':'')}
          aria-pressed={item.id===basketId} onClick={() => setBasketId(item.id)}>
          <span className="size-icon">▣</span><strong>{item.name}</strong><small>{item.lines.length} tipos de produto</small>
        </button>)}
      </section>
      <div className="section-title"><div><p className="eyebrow">PERSONALIZE</p><h2>Cesta {template.name}</h2></div><p>{sum?.itemCount ?? 0} unidades selecionadas</p></div>
      {error || summary.error ? <div role="alert" className="error">{error || summary.error}</div> : null}
      <div className="basket-lines">
        {sum?.lines.map((line) => <section className="basket-group" key={line.typeId} aria-label={'Escolha de ' + line.typeName}>
          <div className="group-head"><div><h3>{line.typeName}</h3><small>{line.options.length} opção(ões) disponíveis</small></div>
          <strong>{formatBRL(line.totalCents)}</strong></div>
          <div className="options-scroller">
            {line.options.map((choice) => <button key={choice.sku} type="button" disabled={line.quantity===0}
              className={'product-choice ' + (choice.sku===line.selected?.sku?'chosen':'')}
              aria-pressed={choice.sku===line.selected?.sku}
              onClick={() => changeProduct(line.typeId,choice.sku)}>
                <span className="photo-placeholder" aria-hidden="true">▦</span>
                <span className="choice-name">{choice.name}</span>
                <span className="choice-price">{formatBRL(choice.priceCents)} / un.</span>
                <span className="choice-tag">{choice.sku===line.selected?.sku?'Selecionado':'Escolher'}</span>
              </button>)}
            {!line.options.length && <p className="empty-options">Nenhum produto disponível para a quantidade escolhida.</p>}
          </div>
          <div className="group-controls">
            <span>Quantidade:</span>
            <div className="stepper" aria-label={'Quantidade de '+line.typeName}>
              <button type="button" aria-label={'Diminuir '+line.typeName} onClick={() => changeQuantity(line.typeId, Math.max(0,line.quantity-1))}>−</button>
              <output aria-live="polite">{line.quantity}</output>
              <button type="button" aria-label={'Aumentar '+line.typeName} onClick={() => changeQuantity(line.typeId, line.quantity+1)}>+</button>
            </div>
            <button type="button" className="text-button" onClick={() => changeQuantity(line.typeId, line.quantity===0?1:0)}>
              {line.quantity===0?'Restaurar':'Remover tipo'}
            </button>
          </div>
        </section>)}
      </div>
      <p className="below-note">Preços e disponibilidade serão revalidados no servidor antes de confirmar qualquer pedido na futura versão de produção.</p>
    </main>
    <div className="sticky-summary"><div><small>Total estimado</small><strong>{formatBRL(sum?.totalCents ?? 0)}</strong></div>
      <button type="button" className="primary-button" onClick={() => setShowOrder((current)=>!current)}>
        {showOrder?'Fechar resumo':'Ver pedido'}
      </button>
    </div>
    {showOrder && <div className="dialog-backdrop" onClick={() => setShowOrder(false)}>
      <section className="order-sheet" role="dialog" aria-modal="true" aria-labelledby="order-heading" onClick={(event)=>event.stopPropagation()}>
        <div className="sheet-header"><h2 id="order-heading">Resumo da cesta</h2><button type="button" aria-label="Fechar resumo" onClick={()=>setShowOrder(false)}>✕</button></div>
        {sum?.lines.filter((line)=>line.quantity>0).map((line)=><div className="order-row" key={line.typeId}>
          <span>{line.quantity} × {line.selected?.name || line.typeName}</span><strong>{formatBRL(line.totalCents)}</strong>
        </div>)}
        <div className="order-total"><b>Total</b><b>{formatBRL(sum?.totalCents??0)}</b></div>
        <div className="notice">Checkout bloqueado nesta prévia. Nenhum pedido real será criado.</div>
      </section>
    </div>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><Site/></React.StrictMode>);
