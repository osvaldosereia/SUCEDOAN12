import type { Basket, BasketRepository } from './types.ts';

function cloneBasket(basket: Basket): Basket {
  return {
    ...basket,
    items: basket.items.map((item) => ({ ...item })),
  };
}

export function createBasketFixtureRepository(source: Basket[]): BasketRepository {
  const baskets = source.map(cloneBasket);

  return {
    async list() {
      return baskets
        .filter((basket) => basket.active)
        .map(cloneBasket);
    },

    async getById(id) {
      const basket = baskets.find((item) => item.active && item.id === id);
      return basket ? cloneBasket(basket) : null;
    },
  };
}
