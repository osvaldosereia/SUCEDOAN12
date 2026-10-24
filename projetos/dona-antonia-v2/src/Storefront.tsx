import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { initialSelections, summarizeBasket } from './core/basket';
import { initialExtraSelections, summarizeExtras, summarizeOrder } from './core/extras';
import { formatBRL } from './core/money';
import { buildCheckoutView } from './core/checkout';
import {
  basketStartingTotal,
  chooseStorefrontProduct,
  updateStorefrontQuantity,
} from './core/storefront-selection';
import { ProductTypeRow } from './features/storefront/components/ProductTypeRow';
import { BasketSizePicker } from './features/baskets/components/BasketSizePicker';
import { StorefrontHeader } from './features/storefront/components/StorefrontHeader';
import { StorefrontProgress } from './features/storefront/components/StorefrontProgress';

import type { BasketId, BasketSelection, Product } from './core/model';
import { DEMO_PRODUCTS, DEMO_TEMPLATES, DEMO_TYPES } from './data/demo';
import { DEMO_EXTRA_GROUPS, DEMO_EXTRA_PRODUCTS, DEMO_EXTRA_TYPES } from './data/demo-extra';
import { loadPublicCatalog } from './data/catalog';
import './styles.css';

const CheckoutStep = React.lazy(() =>
  import('./features/checkout/components/CheckoutStep').then((module) => ({
    default: module.CheckoutStep,
  })),
);
type Stage = 'basket' | 'extras' | 'checkout';
const types = [...DEMO_TYPES, ...DEMO_EXTRA_TYPES];

const titles: Record<Stage, string> = {
  basket: 'Monte sua cesta',
  extras: 'Escolha produtos extras',
  checkout: 'Finalize seu pedido',
};

function Storefront() {
  const [catalog, setCatalog] = useState<readonly Product[]>(
    import.meta.env.DEV || import.meta.env.VITE_APP_MODE === 'preview'
      ? [...DEMO_PRODUCTS, ...DEMO_EXTRA_PRODUCTS]
      : [],
  );
  const [isDemo, setIsDemo] = useState(
    import.meta.env.DEV || import.meta.env.VITE_APP_MODE === 'preview',
  );
  const [catalogError, setCatalogError] = useState('');
  const [stage, setStage] = useState<Stage>('basket');
  const [basketId, setBasketId] = useState<BasketId>('mini');
  const template = DEMO_TEMPLATES.find((value) => value.id === basketId)!;
  const [basketChoices, setBasketChoices] = useState<BasketSelection[]>(() =>
    initialSelections(template, types, [...DEMO_PRODUCTS, ...DEMO_EXTRA_PRODUCTS]),
  );
  const [extraChoices, setExtraChoices] = useState<BasketSelection[]>(() =>
    initialExtraSelections(DEMO_EXTRA_GROUPS, types, [...DEMO_PRODUCTS, ...DEMO_EXTRA_PRODUCTS]),
  );
  const [message, setMessage] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    loadPublicCatalog(controller.signal)
      .then((result) => {
        const next = result.isDemo ? [...result.products, ...DEMO_EXTRA_PRODUCTS] : result.products;
        setCatalog(next);
        setIsDemo(result.isDemo);
        setCatalogError(result.error ?? '');
        setBasketChoices(initialSelections(template, types, next));
        setExtraChoices(initialExtraSelections(DEMO_EXTRA_GROUPS, types, next));
      })
      .catch(() => {});
    return () => controller.abort();
    // Catálogo é obtido uma vez; troca de tamanho usa o catálogo carregado sem refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeSize = (id: BasketId) => {
    const nextTemplate = DEMO_TEMPLATES.find((item) => item.id === id)!;
    setBasketId(id);
    setBasketChoices(initialSelections(nextTemplate, types, catalog));
    setMessage('');
  };
  const computed = useMemo(() => {
    try {
      const basket = summarizeBasket(template, basketChoices, types, catalog);
      const extras = summarizeExtras(DEMO_EXTRA_GROUPS, extraChoices, types, catalog);
      return { basket, extras, order: summarizeOrder(basket.lines, extras.lines), error: '' };
    } catch (error) {
      return {
        basket: null,
        extras: null,
        order: null,
        error: error instanceof Error ? error.message : 'Erro ao calcular',
      };
    }
  }, [template, basketChoices, extraChoices, catalog]);

  const setQuantity = (mode: 'basket' | 'extras', id: string, amount: number) => {
    try {
      const current = mode === 'basket' ? basketChoices : extraChoices;
      const updated = updateStorefrontQuantity({
        mode,
        current,
        typeId: id,
        amount,
        basket: template,
        extras: DEMO_EXTRA_GROUPS,
        types,
        products: catalog,
      });
      if (mode === 'basket') setBasketChoices(updated);
      else setExtraChoices(updated);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Quantidade indisponível');
    }
  };
  const choose = (mode: 'basket' | 'extras', typeId: string, sku: string) => {
    try {
      const current = mode === 'basket' ? basketChoices : extraChoices;
      const updated = chooseStorefrontProduct(
        mode,
        current,
        typeId,
        sku,
        template,
        DEMO_EXTRA_GROUPS,
        types,
        catalog,
      );
      if (mode === 'basket') setBasketChoices(updated);
      else setExtraChoices(updated);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Produto indisponível');
    }
  };
  const jump = (next: Stage) => {
    const steps: Stage[] = ['basket', 'extras', 'checkout'];
    const missingProducts =
      (computed.basket?.unavailableTypeIds.length ?? 0) > 0 ||
      (computed.extras?.unavailableTypeIds.length ?? 0) > 0;
    if (
      steps.indexOf(next) > steps.indexOf(stage) &&
      (!computed.order || computed.error || missingProducts)
    ) {
      setMessage(
        'Há tipos de produto sem uma opção disponível. Ajuste a seleção antes de continuar.',
      );
      return;
    }
    setMessage('');
    setStage(next);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };
  const total = computed.order?.totalCents ?? 0;
  return (
    <div className="site-page">
      <StorefrontHeader />
      <main className="container site-main wizard-layout">
        {isDemo && (
          <div className="site-demo-banner" role="status">
            <strong>PROTÓTIPO</strong>
            <span>Preços ilustrativos. Nenhuma compra será enviada nesta prévia.</span>
          </div>
        )}
        {catalogError && (
          <div className="error" role="alert">
            {catalogError}
          </div>
        )}

        <StorefrontProgress stage={stage} />
        <div className="wizard-heading">
          <div>
            <p className="eyebrow">
              ETAPA {stage === 'basket' ? 1 : stage === 'extras' ? 2 : 3} DE 3
            </p>
            <h1>{titles[stage]}</h1>
            <p>
              {stage === 'basket'
                ? 'Escolha o tamanho, a marca e a quantidade de cada tipo de produto.'
                : stage === 'extras'
                  ? 'Complete seu pedido se desejar. Todos os extras são opcionais.'
                  : 'Confira os produtos e seus dados para a entrega.'}
            </p>
          </div>
          {stage !== 'basket' && (
            <button
              type="button"
              className="back-link"
              onClick={() => jump(stage === 'checkout' ? 'extras' : 'basket')}
            >
              ← Voltar
            </button>
          )}
        </div>

        {message || computed.error ? (
          <div role="alert" className="error">
            {message || computed.error}
          </div>
        ) : null}

        {stage === 'basket' && (
          <>
            <BasketSizePicker
              selectedId={basketId}
              templates={DEMO_TEMPLATES}
              baseTotal={(id) => basketStartingTotal(id, DEMO_TEMPLATES, types, catalog)}
              onChange={changeSize}
            />
            <div className="section-title">
              <div>
                <p className="eyebrow">PERSONALIZAÇÃO</p>
                <h2>Cesta {template.name}</h2>
              </div>
              <p>{computed.basket?.itemCount ?? 0} unidades</p>
            </div>
            <div className="basket-lines">
              {computed.basket?.lines.map((line) => (
                <ProductTypeRow
                  key={line.typeId}
                  mode="basket"
                  line={line}
                  onProduct={(id, sku) => choose('basket', id, sku)}
                  onQuantity={(id, qty) => setQuantity('basket', id, qty)}
                />
              ))}
            </div>
          </>
        )}
        {stage === 'extras' && (
          <>
            <div className="extras-intro">
              <div>
                <strong>Complete sua compra com produtos extras</strong>
                <p>Esses produtos são opcionais. Escolha as marcas e quantidades que desejar.</p>
              </div>
              <span>Opcionais</span>
            </div>
            <div className="basket-lines">
              {computed.extras?.lines.map((line) => (
                <ProductTypeRow
                  key={line.typeId}
                  mode="extras"
                  line={line}
                  onProduct={(id, sku) => choose('extras', id, sku)}
                  onQuantity={(id, qty) => setQuantity('extras', id, qty)}
                />
              ))}
            </div>
            {!computed.extras?.lines.length && (
              <div className="notice muted">Nenhum tipo extra foi configurado nesta prévia.</div>
            )}
          </>
        )}
        {stage === 'checkout' && computed.basket && computed.extras && (
          <React.Suspense
            fallback={
              <div className="notice muted" role="status">
                Carregando checkout...
              </div>
            }
          >
            <CheckoutStep
              view={buildCheckoutView(computed.basket, computed.extras.lines)}
              basketName={template.name}
              onQuantity={setQuantity}
              goTo={jump}
            />
          </React.Suspense>
        )}
        {stage !== 'checkout' && (
          <p className="below-note">
            Valores ilustrativos. No sistema final, preços e estoque serão revalidados antes da
            confirmação.
          </p>
        )}
      </main>
      {stage !== 'checkout' && (
        <footer className="sticky-summary" aria-label="Resumo fixo do pedido">
          <div>
            <small>{stage === 'basket' ? 'Total da cesta' : 'Cesta + extras'}</small>
            <strong>
              {formatBRL(stage === 'basket' ? (computed.basket?.totalCents ?? 0) : total)}
            </strong>
          </div>
          <button
            type="button"
            className="primary-button"
            disabled={
              !computed.order ||
              !!computed.error ||
              !!computed.basket?.unavailableTypeIds.length ||
              !!computed.extras?.unavailableTypeIds.length
            }
            onClick={() => jump(stage === 'basket' ? 'extras' : 'checkout')}
          >
            {stage === 'basket' ? 'Próximo →' : 'Finalizar pedido →'}
          </button>
        </footer>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Storefront />
  </React.StrictMode>,
);
