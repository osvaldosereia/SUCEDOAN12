import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { initialSelections, summarizeBasket } from './core/basket';
import { initialExtraSelections, summarizeExtras, summarizeOrder } from './core/extras';
import { buildCheckoutView } from './core/checkout';
import {
  basketStartingTotal,
  chooseStorefrontProduct,
  publicAggregateBasketSummary,
  updateStorefrontQuantity,
} from './core/storefront-selection';
import { ProductTypeRow } from './features/storefront/components/ProductTypeRow';
import { BasketSizePicker } from './features/baskets/components/BasketSizePicker';
import { StorefrontHeader } from './features/storefront/components/StorefrontHeader';
import { StorefrontProgress } from './features/storefront/components/StorefrontProgress';
import { CatalogStatus } from './features/storefront/components/CatalogStatus';
import { StickySummary } from './features/storefront/components/StickySummary';
import { WizardHeading } from './features/storefront/components/WizardHeading';

import type { BasketId, BasketSelection } from './core/model';
import {
  PUBLIC_INITIAL_EXTRAS,
  PUBLIC_INITIAL_PRODUCTS,
  PUBLIC_INITIAL_TEMPLATES,
  PUBLIC_INITIAL_TYPES,
  publicCheckoutClient,
  usePublicCatalog,
} from './features/storefront/usePublicCatalog';
import './styles.css';

const CheckoutStep = React.lazy(() =>
  import('./features/checkout/components/CheckoutStep').then((module) => ({
    default: module.CheckoutStep,
  })),
);
type Stage = 'basket' | 'extras' | 'checkout';
const initialTypes = PUBLIC_INITIAL_TYPES;
const initialTemplates = PUBLIC_INITIAL_TEMPLATES;
const initialExtraGroups = PUBLIC_INITIAL_EXTRAS;

function Storefront() {
  const {
    catalog,
    types,
    templates,
    extraGroups,
    isDemo,
    error: catalogError,
    loading: catalogLoading,
    stale: catalogStale,
    refresh: refreshCatalog,
  } = usePublicCatalog();
  const catalogReady =
    !catalogLoading && !catalogError && (isDemo || (catalog.length > 0 && templates.length > 0));
  const [stage, setStage] = useState<Stage>('basket');
  const [basketId, setBasketId] = useState<BasketId>('mini');
  const template =
    templates.find((value) => value.id === basketId) ?? templates[0] ?? initialTemplates[0]!;
  const [basketChoices, setBasketChoices] = useState<BasketSelection[]>(() =>
    initialSelections(template, initialTypes, PUBLIC_INITIAL_PRODUCTS),
  );
  const [extraChoices, setExtraChoices] = useState<BasketSelection[]>(() =>
    initialExtraSelections(initialExtraGroups, initialTypes, PUBLIC_INITIAL_PRODUCTS),
  );
  const [message, setMessage] = useState('');

  useEffect(() => {
    const nextTemplate = templates.find((item) => item.id === basketId) ?? templates[0]!;
    setBasketChoices(initialSelections(nextTemplate, types, catalog));
    setExtraChoices(initialExtraSelections(extraGroups, types, catalog));
  }, [catalog, templates, types, extraGroups, basketId]);

  const changeSize = (id: BasketId) => {
    const nextTemplate = templates.find((item) => item.id === id)!;
    setBasketId(id);
    setBasketChoices(initialSelections(nextTemplate, types, catalog));
    setMessage('');
  };
  const computed = useMemo(() => {
    try {
      const basket = publicAggregateBasketSummary(
        template,
        summarizeBasket(template, basketChoices, types, catalog),
      );
      const extras = summarizeExtras(extraGroups, extraChoices, types, catalog);
      return { basket, extras, order: summarizeOrder(basket.lines, extras.lines), error: '' };
    } catch (error) {
      return {
        basket: null,
        extras: null,
        order: null,
        error: error instanceof Error ? error.message : 'Erro ao calcular',
      };
    }
  }, [template, basketChoices, extraChoices, catalog, types, extraGroups]);

  const setQuantity = (mode: 'basket' | 'extras', id: string, amount: number) => {
    try {
      const current = mode === 'basket' ? basketChoices : extraChoices;
      const updated = updateStorefrontQuantity({
        mode,
        current,
        typeId: id,
        amount,
        basket: template,
        extras: extraGroups,
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
        extraGroups,
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
        {catalogStale && !catalogError && (
          <div className="notice muted" role="status">
            Exibindo dados recentes enquanto atualizamos disponibilidade e preços.
          </div>
        )}

        {!catalogReady ? (
          <CatalogStatus
            loading={catalogLoading}
            error={catalogError}
            empty={!catalogLoading && !catalogError}
            onRetry={() => refreshCatalog(true)}
          />
        ) : (
          <>
            <StorefrontProgress stage={stage} />
            <WizardHeading
              stage={stage}
              onBack={() => jump(stage === 'checkout' ? 'extras' : 'basket')}
            />

            {message || computed.error ? (
              <div role="alert" className="error">
                {message || computed.error}
              </div>
            ) : null}

            {stage === 'basket' && (
              <>
                <BasketSizePicker
                  selectedId={basketId}
                  templates={templates}
                  baseTotal={(id) => basketStartingTotal(id, templates, types, catalog)}
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
                    <p>
                      Esses produtos são opcionais. Escolha as marcas e quantidades que desejar.
                    </p>
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
                  <div className="notice muted">
                    Nenhum tipo extra foi configurado nesta prévia.
                  </div>
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
                  basketId={template.id}
                  basketName={template.name}
                  demoMode={isDemo}
                  onQuantity={setQuantity}
                  goTo={jump}
                  submitOrder={publicCheckoutClient?.createOrder}
                />
              </React.Suspense>
            )}
            {stage !== 'checkout' && (
              <p className="below-note">
                Valores ilustrativos. No sistema final, preços e estoque serão revalidados antes da
                confirmação.
              </p>
            )}
          </>
        )}
      </main>
      {stage !== 'checkout' && (
        <StickySummary
          stage={stage}
          basketTotal={computed.basket?.totalCents ?? 0}
          orderTotal={total}
          canContinue={
            !!computed.order &&
            !computed.error &&
            !computed.basket?.unavailableTypeIds.length &&
            !computed.extras?.unavailableTypeIds.length
          }
          onContinue={() => jump(stage === 'basket' ? 'extras' : 'checkout')}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Storefront />
  </React.StrictMode>,
);
