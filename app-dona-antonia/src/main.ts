import './styles/base.css';
import './styles/shell.css';

import productsData from '../tests/fixtures/products.json';

import { renderAppShell } from './app/AppShell.ts';
import { bootstrapApp } from './app/bootstrap.ts';
import { createNavigator, isAppRoute } from './app/navigation.ts';
import { createCatalogController } from './catalog/catalogController.ts';
import { createCatalogFixtureRepository } from './catalog/catalogFixtureRepository.ts';
import { renderCatalog, renderProductDetail } from './catalog/catalogView.ts';
import type { CatalogSection, Product } from './catalog/types.ts';
import { HOME_QUICK_REPLIES, routeForQuickReply } from './conversation/quickReplies.ts';
import { renderConversation } from './conversation/renderer.ts';
import { createConversationStore } from './conversation/store.ts';
import { detectRuntime } from './platform/runtime.ts';

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
const catalogRepository = createCatalogFixtureRepository(productsData as Product[]);
const catalog = createCatalogController(catalogRepository);

await catalog.initialize();

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

function render(route = appNavigator.current()): void {
  appRoot.innerHTML = renderAppShell({
    route,
    state: 'ready',
    conversationHtml,
    toolHtml: route === 'catalog' ? catalogToolHtml() : undefined,
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
};

const CATALOG_SECTION_BY_REPLY: Record<string, CatalogSection> = {
  offers: 'offers',
  'for-you': 'for-you',
  'for-home': 'for-home',
};

async function handleClick(event: MouseEvent): Promise<void> {
  const element = event.target instanceof Element ? event.target : null;
  if (!element) return;

  const replyTarget = element.closest<HTMLElement>('[data-conversation-reply]');
  const replyId = replyTarget?.dataset.conversationReply;

  if (replyId) {
    const route = routeForQuickReply(replyId);
    if (!route || !conversation.userDecision(replyId)) return;

    const catalogSection = CATALOG_SECTION_BY_REPLY[replyId];
    if (catalogSection) await catalog.setSection(catalogSection);

    appNavigator.navigate(route);
    void conversation.assistantSay(FOLLOW_UP_BY_REPLY[replyId] ?? 'Vamos continuar.');
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

  appNavigator.navigate(route);
}

appRoot.addEventListener('click', (event) => {
  void handleClick(event);
});

appRoot.addEventListener('submit', (event) => {
  const form = event.target instanceof HTMLFormElement ? event.target : null;
  if (!form?.matches('[data-catalog-search]')) return;

  event.preventDefault();

  const input = form.querySelector<HTMLInputElement>('input[name="query"]');
  void catalog.setQuery(input?.value ?? '').then(() => render());
});
