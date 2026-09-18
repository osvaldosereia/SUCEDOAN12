import type { AppRoute } from '../app/navigation.ts';
import type { QuickReply } from '../conversation/types.ts';
import type {
  Basket,
  BasketRepository,
  BasketSelection,
} from './types.ts';

export interface BasketFlowSnapshot {
  openedBasket: Basket | null;
  selection: BasketSelection | null;
  nextRoute: AppRoute | null;
}

export interface BasketFlow {
  list(): Promise<Basket[]>;
  open(id: string): Promise<boolean>;
  close(): void;
  confirmOpened(): boolean;
  getSnapshot(): BasketFlowSnapshot;
  getPostSelectionReplies(): QuickReply[];
}

const POST_SELECTION_REPLIES: QuickReply[] = [
  { id: 'basket-offers', label: 'Ver ofertas' },
  { id: 'basket-products', label: 'Comprar outros produtos' },
  { id: 'basket-review', label: 'Revisar cesta' },
];

function cloneBasket(basket: Basket | null): Basket | null {
  if (!basket) return null;
  return {
    ...basket,
    items: basket.items.map((item) => ({ ...item })),
  };
}

function cloneSelection(selection: BasketSelection | null): BasketSelection | null {
  if (!selection) return null;
  return {
    ...selection,
    items: selection.items.map((item) => ({ ...item })),
  };
}

export function createBasketFlow(repository: BasketRepository): BasketFlow {
  let openedBasket: Basket | null = null;
  let selection: BasketSelection | null = null;
  let confirmedOpenedId: string | null = null;
  let nextRoute: AppRoute | null = null;

  return {
    list() {
      return repository.list();
    },

    async open(id) {
      const basket = await repository.getById(id);
      if (!basket) return false;

      openedBasket = basket;
      confirmedOpenedId = null;
      nextRoute = null;
      return true;
    },

    close() {
      openedBasket = null;
      confirmedOpenedId = null;
      nextRoute = null;
    },

    confirmOpened() {
      if (!openedBasket) return false;
      if (confirmedOpenedId === openedBasket.id) return false;

      selection = {
        basketId: openedBasket.id,
        basketName: openedBasket.name,
        priceCents: openedBasket.priceCents,
        items: openedBasket.items.map((item) => ({ ...item })),
      };
      confirmedOpenedId = openedBasket.id;
      nextRoute = null;
      return true;
    },

    getSnapshot() {
      return {
        openedBasket: cloneBasket(openedBasket),
        selection: cloneSelection(selection),
        nextRoute,
      };
    },

    getPostSelectionReplies() {
      return POST_SELECTION_REPLIES.map((reply) => ({ ...reply }));
    },
  };
}
