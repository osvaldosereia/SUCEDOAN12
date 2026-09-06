const STORAGE_KEY = 'da_atendimento_cart_v2';
const WHATSAPP = '5565998150975';
const n = value => Number(value || 0);

export function newCart() {
  return { code: `DA-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, basket: null, extras: {}, updatedAt: Date.now() };
}

export function loadCart() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return parsed && typeof parsed === 'object' ? parsed : newCart();
  } catch (_) {
    return newCart();
  }
}

export function saveCart(cart) {
  cart.updatedAt = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
}

export function clearCart() {
  const cart = newCart();
  saveCart(cart);
  return cart;
}

export function ensureBasket(cart, basket, productByCode) {
  const details = basket.items.map(base => {
    const product = productByCode.get(base.code.toLowerCase());
    return { code: base.code, name: product?.name || base.code, unitPrice: product?.price || 0, baseQty: base.qty };
  });

  if (!cart.basket || cart.basket.id !== basket.id) {
    cart.basket = {
      id: basket.id,
      code: basket.code,
      name: basket.name,
      basePrice: basket.price,
      image: basket.image,
      items: details.map(item => ({ ...item, qty: item.baseQty }))
    };
  } else {
    const current = new Map(details.map(item => [item.code.toLowerCase(), item]));
    cart.basket.name = basket.name;
    cart.basket.basePrice = basket.price;
    cart.basket.image = basket.image;
    cart.basket.items = cart.basket.items.map(item => ({ ...item, ...(current.get(String(item.code).toLowerCase()) || {}) }));
  }
  saveCart(cart);
}

export function basketTotal(cart) {
  if (!cart.basket) return 0;
  const adjustment = cart.basket.items.reduce((sum, item) => sum + (n(item.qty) - n(item.baseQty)) * n(item.unitPrice), 0);
  return Math.max(0, n(cart.basket.basePrice) + adjustment);
}

export function extrasTotal(cart) {
  return Object.values(cart.extras || {}).reduce((sum, item) => sum + n(item.price) * n(item.qty), 0);
}

export function grandTotal(cart) {
  return basketTotal(cart) + extrasTotal(cart);
}

export function totalUnits(cart) {
  const basket = cart.basket?.items?.reduce((sum, item) => sum + n(item.qty), 0) || 0;
  const extras = Object.values(cart.extras || {}).reduce((sum, item) => sum + n(item.qty), 0);
  return basket + extras;
}

export function changeBasketQty(cart, index, delta) {
  const item = cart.basket?.items?.[index];
  if (!item) return;
  item.qty = Math.max(0, n(item.qty) + delta);
  saveCart(cart);
}

export function changeExtraQty(cart, product, delta) {
  const current = cart.extras[product.code] || { code: product.code, name: product.name, price: product.price, qty: 0 };
  current.name = product.name;
  current.price = product.price;
  current.qty = Math.max(0, n(current.qty) + delta);
  if (current.qty <= 0) delete cart.extras[product.code];
  else cart.extras[product.code] = current;
  saveCart(cart);
}

function basketChanges(cart) {
  const items = cart.basket?.items || [];
  const changed = [];
  const removed = [];

  for (const item of items) {
    const qty = n(item.qty);
    const baseQty = n(item.baseQty);
    if (qty === baseQty) continue;
    if (qty <= 0) removed.push(item);
    else changed.push(item);
  }

  return { changed, removed, hasChanges: changed.length > 0 || removed.length > 0 };
}

export function whatsappUrl(cart, money, finalize) {
  const lines = [finalize ? '*FINALIZAR PEDIDO*' : `*${cart.basket?.name || 'CESTA'} — ${basketChanges(cart).hasChanges ? 'ALTERADA' : 'PADRÃO'}*`, `Pedido ${cart.code}`, ''];

  if (cart.basket) {
    const { changed, removed } = basketChanges(cart);
    const visibleItems = cart.basket.items.filter(item => n(item.qty) > 0);

    visibleItems.forEach(item => lines.push(`${item.qty}x ${item.name}`));
    lines.push(`Cesta: ${money(basketTotal(cart))}`);

    if (changed.length) {
      lines.push('', '*PRODUTOS ALTERADOS*');
      changed.forEach(item => lines.push(`${item.qty}x ${item.name}`));
    }

    if (removed.length) {
      lines.push('', '*PRODUTOS RETIRADOS*');
      removed.forEach(item => lines.push(item.name));
    }
  }

  const extras = Object.values(cart.extras || {}).filter(item => item.qty > 0);
  if (extras.length) {
    lines.push('', '*Produtos avulsos*');
    extras.forEach(item => lines.push(`${item.qty}x ${item.name} — ${money(item.price * item.qty)}`));
  }

  lines.push('', `*Total: ${money(grandTotal(cart))}*`);
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(lines.join('\n'))}`;
}
