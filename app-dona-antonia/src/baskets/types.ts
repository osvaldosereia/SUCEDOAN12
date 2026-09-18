export interface BasketItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
}

export interface Basket {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  active: boolean;
  badge: string | null;
  items: BasketItem[];
}

export interface BasketSelection {
  basketId: string;
  basketName: string;
  priceCents: number;
  items: BasketItem[];
}

export interface BasketRepository {
  list(): Promise<Basket[]>;
  getById(id: string): Promise<Basket | null>;
}
