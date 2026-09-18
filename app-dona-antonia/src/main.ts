import './styles/base.css';
import './styles/shell.css';

import basketsData from '../tests/fixtures/baskets.json';
import productsData from '../tests/fixtures/products.json';

import { renderAppShell } from './app/AppShell.ts';
import { bootstrapApp } from './app/bootstrap.ts';
import { createNavigator, isAppRoute } from './app/navigation.ts';
import { createBasketFixtureRepository } from './baskets/basketFixtureRepository.ts';
import { createBasketFlow } from './baskets/basketFlow.ts';
import { renderBasketDetail, renderBasketList } from './baskets/basketView.ts';
import type { Basket } from './baskets/types.ts';
import { createCartStore } from './cart/cartStore.ts';
import { calculateCartTotal } from './cart/cartMath.ts';
import { renderCart } from './cart/cartView.ts';
import { createCheckoutFixtureGateway } from './checkout/checkoutFixtureGateway.ts';
import { createCheckoutFlow } from './checkout/checkoutFlow.ts';
import { renderCheckout } from './checkout/checkoutView.ts';
import type { PaymentMethod } from './checkout/types.ts';
import { createCatalogController } from './catalog/catalogController.ts';
import { createCatalogFixtureRepository } from './catalog/catalogFixtureRepository.ts';
import { renderCatalog, renderProductDetail } from './catalog/catalogView.ts';
import type { CatalogSection, Product } from './catalog/types.ts';
import { HOME_QUICK_REPLIES, routeForQuickReply } from './conversation/quickReplies.ts';
import { renderConversation } from './conversation/renderer.ts';
import { createConversationStore } from './conversation/store.ts';
import { createOrderFixtureRepository } from './orders/orderFixtureRepository.ts';
import { renderOrderTracking } from './orders/orderTrackingView.ts';
import type { OrderRecord } from './orders/types.ts';
import { createPreferencesStore } from './privacy/preferences.ts';
import { createPrivacyCenter } from './privacy/privacyCenter.ts';
import type { PrivacyRequestType } from './privacy/privacyCenter.ts';
import { renderPrivacyCenter } from './privacy/privacyView.ts';
import { canConfirmOrder, getNetworkState } from './platform/networkState.ts';
import { detectRuntime } from './platform/runtime.ts';
import { registerAppServiceWorker } from './platform/serviceWorker.ts';

const root = document.querySelector<HTMLElement>('#app');

if (!root) {
  throw new Error('App root #app not found');
}

const appRoot = root;

const standalone =
  window.matchMedia?.('(display-mode: standalone)').matches === true
  || ('standalone' in navigator
    && (navigator as Navigator & { standalone?: boolean }).standalone === true);

appRoot.dataset.runtime = detectRuntime({ standalone });

await bootstrapApp({ root: appRoot });

const appNavigator = createNavigator();
const conversation = createConversationStore();
const cart = createCartStore();
const checkoutGateway = createCheckoutFixtureGateway();
const checkout = createCheckoutFlow(checkoutGateway);
const orderRepository = createOrderFixtureRepository();
const privacyPreferences = createPreferencesStore();
const privacyCenter = createPrivacyCenter();
let activeOrder: OrderRecord | null = null;

const catalogRepository = createCatalogFixtureRepository(productsData as Product[]);
const catalog = createCatalogController(catalogRepository);
await catalog.initialize();

const basketRepository = createBasketFixtureRepository(basketsData as Basket[]);
const basketFlow = createBasketFlow(basketRepository);
const basketList = await basketFlow.list();

let conversationHtml = renderConversation(conversation.getSnapshot());

function catalogToolHtml(): string {
  const snapshot = catalog.getSnapshot();

  if (snapshot.selectedProduct) {
    return renderProductDetail(snapshot.selectedProduct);
  }

  return renderCatalog({
    products: snapshot.products,
    section: snapshot.section,
    categories: snapshot.categories,
    subcategories: snapshot.subcategories,
    selectedCategory: snapshot.selectedCategory,
    selectedSubcategory: snapshot.selectedSubcategory,
    query: snapshot.query,
  });
}

function basketToolHtml(): string {
  const snapshot = basketFlow.getSnapshot();

  if (snapshot.openedBasket) {
    return renderBasketDetail(snapshot.openedBasket);
  }

  return renderBasketList(basketList);
}

function render(route = appNavigator.current()): void {
  const toolHtml = route === 'catalog'
    ? catalogToolHtml()
    : route === 'basket'
      ? basketToolHtml()
      : route === 'cart'
        ? renderCart(cart.getSnapshot())
        : route === 'checkout'
          ? renderCheckout(checkout.getSnapshot())
          : route === 'order'
            ? renderOrderTracking(activeOrder)
            : route === 'privacy'
              ? renderPrivacyCenter(privacyPreferences.getSnapshot())
              : undefined;

  const cartSummary = calculateCartTotal(cart.getSnapshot());

  appRoot.innerHTML = renderAppShell({
    route,
    state: getNetworkState() === 'offline' ? 'offline' : 'ready',
    conversationHtml,
    toolHtml,
    orderSummary: {
      itemCount: cartSummary.itemCount,
      totalCents: cartSummary.totalCents,
    },
  });
}

appNavigator.subscribe(render);
conversation.subscribe((snapshot) => {
  conversationHtml = renderConversation(snapshot);
  render();
});

render();

void conversation.assistantSay('Olá! Como posso ajudar?', {
  replies: HOME_QUICK_REPLIES,
});

const FOLLOW_UP_BY_REPLY: Record<string, string> = {
  baskets: 'Certo. Vou te mostrar as cestas.',
  offers: 'Certo. Vou te mostrar as ofertas.',
  'for-you': 'Certo. Vou abrir as opções para você.',
  'for-home': 'Certo. Vou abrir as opções para casa.',
  'basket-offers': 'Certo. Vou te mostrar as ofertas.',
  'basket-products': 'Certo. Vamos ver outros produtos.',
  'basket-review': 'Claro. Aqui está a cesta que você escolheu.',
};

const CATALOG_SECTION_BY_REPLY: Record<string, CatalogSection> = {
  offers: 'offers',
  'for-you': 'for-you',
  'for-home': 'for-home',
  'basket-offers': 'offers',
  'basket-products': 'all',
};

async function handleConversationReply(replyId: string): Promise<void> {
  const route = routeForQuickReply(replyId);
  if (!route || !conversation.userDecision(replyId)) return;

  const catalogSection = CATALOG_SECTION_BY_REPLY[replyId];
  if (catalogSection) {
    await catalog.setSection(catalogSection);
  }

  if (replyId === 'basket-review') {
    const selection = basketFlow.getSnapshot().selection;
    if (selection) {
      await basketFlow.open(selection.basketId);
    }
  }

  appNavigator.navigate(route);
  void conversation.assistantSay(FOLLOW_UP_BY_REPLY[replyId] ?? 'Vamos continuar.');
}

async function handleClick(event: MouseEvent): Promise<void> {
  const element = event.target instanceof Element ? event.target : null;
  if (!element) return;

  const replyTarget = element.closest<HTMLElement>('[data-conversation-reply]');
  const replyId = replyTarget?.dataset.conversationReply;

  if (replyId) {
    await handleConversationReply(replyId);
    return;
  }

  const basketOpenTarget = element.closest<HTMLElement>('[data-basket-open]');
  const basketId = basketOpenTarget?.dataset.basketOpen;
  if (basketId) {
    if (await basketFlow.open(basketId)) render();
    return;
  }

  if (element.closest('[data-basket-close]')) {
    basketFlow.close();
    render();
    return;
  }

  const basketConfirmTarget = element.closest<HTMLElement>('[data-basket-confirm]');
  const basketConfirmId = basketConfirmTarget?.dataset.basketConfirm;
  if (basketConfirmId) {
    const opened = basketFlow.getSnapshot().openedBasket;
    if (!opened || opened.id !== basketConfirmId) return;
    if (!basketFlow.confirmOpened()) return;

    const selection = basketFlow.getSnapshot().selection;
    if (!selection) return;

    cart.add({
      kind: 'basket',
      refId: selection.basketId,
      name: selection.basketName,
      quantity: 1,
      unitPriceCents: selection.priceCents,
      promoUnitPriceCents: null,
    });

    conversation.userSay(`Escolhi a ${selection.basketName}`);
    void conversation.assistantSay(
      `Perfeito. Você escolheu a ${selection.basketName}. O que deseja fazer agora?`,
      { replies: basketFlow.getPostSelectionReplies() },
    );
    render();
    return;
  }

  const addProductTarget = element.closest<HTMLElement>('[data-cart-add-product]');
  const addProductId = addProductTarget?.dataset.cartAddProduct;
  if (addProductId) {
    const product = await catalogRepository.getById(addProductId);
    if (!product) return;

    cart.add({
      kind: 'product',
      refId: product.id,
      name: product.name,
      quantity: 1,
      unitPriceCents: product.priceCents,
      promoUnitPriceCents: product.promoPriceCents,
    });
    render();
    return;
  }

  const increaseTarget = element.closest<HTMLElement>('[data-cart-increase]');
  const increaseId = increaseTarget?.dataset.cartIncrease;
  if (increaseId) {
    const line = cart.getSnapshot().lines.find((item) => item.id === increaseId);
    if (line && cart.setQuantity(line.id, line.quantity + 1)) render();
    return;
  }

  const decreaseTarget = element.closest<HTMLElement>('[data-cart-decrease]');
  const decreaseId = decreaseTarget?.dataset.cartDecrease;
  if (decreaseId) {
    const line = cart.getSnapshot().lines.find((item) => item.id === decreaseId);
    if (line && line.quantity > 1 && cart.setQuantity(line.id, line.quantity - 1)) render();
    return;
  }

  const removeTarget = element.closest<HTMLElement>('[data-cart-remove]');
  const removeId = removeTarget?.dataset.cartRemove;
  if (removeId) {
    if (cart.remove(removeId)) render();
    return;
  }

  if (element.closest('[data-cart-clear]')) {
    cart.clear();
    render();
    return;
  }

  const paymentTarget = element.closest<HTMLElement>('[data-checkout-payment]');
  const payment = paymentTarget?.dataset.checkoutPayment as PaymentMethod | undefined;
  if (payment) {
    if (checkout.setPayment(payment)) render();
    return;
  }

  if (element.closest('[data-checkout-confirm]')) {
    const networkState = getNetworkState();
    if (!canConfirmOrder(networkState)) {
      void conversation.assistantSay(
        'Sem conexão segura no momento. Seu pedido não foi enviado. Tente confirmar novamente quando a internet voltar.',
      );
      render();
      return;
    }

    const result = await checkout.confirm();
    if (result) {
      const summary = calculateCartTotal(cart.getSnapshot());
      activeOrder = await orderRepository.create({
        id: result.orderId,
        totalCents: summary.totalCents,
      });
      render();
    }
    return;
  }

  const advanceOrderTarget = element.closest<HTMLElement>('[data-order-advance]');
  const advanceOrderId = advanceOrderTarget?.dataset.orderAdvance;
  if (advanceOrderId) {
    activeOrder = await orderRepository.advance(advanceOrderId);
    render();
    return;
  }

  const supportOrderTarget = element.closest<HTMLElement>('[data-order-support]');
  const supportOrderId = supportOrderTarget?.dataset.orderSupport;
  if (supportOrderId) {
    conversation.userSay('Preciso de ajuda com o pedido');
    void conversation.assistantSay(
      `Este é o pedido de homologação ${supportOrderId}. O suporte externo ainda não está ativado.`,
    );
    return;
  }

  if (element.closest('[data-privacy-transactional]')) {
    const current = privacyPreferences.getSnapshot().transactionalPushEnabled;
    privacyPreferences.setTransactional(!current);
    render();
    return;
  }

  if (element.closest('[data-privacy-marketing]')) {
    const current = privacyPreferences.getSnapshot().marketingPushOptIn;
    privacyPreferences.setMarketing(!current);
    render();
    return;
  }

  const privacyRequestTarget = element.closest<HTMLElement>('[data-privacy-request]');
  const privacyRequestType = privacyRequestTarget?.dataset.privacyRequest as PrivacyRequestType | undefined;
  if (privacyRequestType) {
    const result = await privacyCenter.request(privacyRequestType);
    conversation.userSay('Quero exercer um direito de privacidade');
    if (!result.submitted) {
      void conversation.assistantSay(
        'Esta solicitação ainda está somente em homologação e não foi enviada para produção.',
      );
    }
    return;
  }

  const sectionTarget = element.closest<HTMLElement>('[data-catalog-section]');
  const section = sectionTarget?.dataset.catalogSection as CatalogSection | undefined;
  if (section && ['all', 'offers', 'for-you', 'for-home'].includes(section)) {
    await catalog.setSection(section);
    render();
    return;
  }

  const categoryTarget = element.closest<HTMLElement>('[data-catalog-category]');
  if (categoryTarget) {
    await catalog.setCategory(categoryTarget.dataset.catalogCategory || null);
    render();
    return;
  }

  const subcategoryTarget = element.closest<HTMLElement>('[data-catalog-subcategory]');
  if (subcategoryTarget) {
    await catalog.setSubcategory(subcategoryTarget.dataset.catalogSubcategory || null);
    render();
    return;
  }

  const detailTarget = element.closest<HTMLElement>('[data-product-detail-target]');
  const productId = detailTarget?.dataset.productDetailTarget;
  if (productId) {
    if (await catalog.openProduct(productId)) render();
    return;
  }

  if (element.closest('[data-product-detail-close]')) {
    catalog.closeProduct();
    render();
    return;
  }

  const routeTarget = element.closest<HTMLElement>('[data-route-target]');
  const route = routeTarget?.dataset.routeTarget;
  if (!route || !isAppRoute(route)) return;

  if (route === 'checkout') {
    checkout.start(cart.getSnapshot());
  }

  appNavigator.navigate(route);
}

appRoot.addEventListener('click', (event) => {
  void handleClick(event);
});

appRoot.addEventListener('submit', (event) => {
  const form = event.target instanceof HTMLFormElement ? event.target : null;
  if (!form) return;

  if (form.matches('[data-catalog-search]')) {
    event.preventDefault();
    const input = form.querySelector<HTMLInputElement>('input[name="query"]');
    void catalog.setQuery(input?.value ?? '').then(() => render());
    return;
  }

  if (form.matches('[data-checkout-customer]')) {
    event.preventDefault();
    const name = form.querySelector<HTMLInputElement>('input[name="name"]')?.value ?? '';
    const phone = form.querySelector<HTMLInputElement>('input[name="phone"]')?.value ?? '';
    if (checkout.setCustomer({ name, phone })) render();
    return;
  }

  if (form.matches('[data-checkout-address]')) {
    event.preventDefault();
    const value = (name: string) =>
      form.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value ?? '';

    if (checkout.setAddress({
      street: value('street'),
      number: value('number'),
      neighborhood: value('neighborhood'),
      city: value('city'),
      state: value('state'),
      reference: value('reference'),
    })) {
      render();
    }
  }
});


window.addEventListener('online', () => render());
window.addEventListener('offline', () => render());

void registerAppServiceWorker(
  'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
  window.location.pathname,
);
