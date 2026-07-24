const RUNTIME_PATH = typeof location !== 'undefined' ? String(location.pathname || '/') : '/app-next/';
const IS_PRODUCTION = !RUNTIME_PATH.includes('/app-next/');

export const CONFIG = Object.freeze({
  APP_NAME: 'Dona Antônia',
  APP_VERSION: IS_PRODUCTION ? '2026-07-24-modular-production-v3' : '2026-07-24-modular-preview-v3',
  ENVIRONMENT: IS_PRODUCTION ? 'production' : 'preview',
  IS_PRODUCTION,
  SITE_BASE_URL: 'https://www.donaantonia.com.br',
  GITHUB_RAW_BASE: 'https://raw.githubusercontent.com/osvaldosereia/SUCEDOAN12/main',
  ENDPOINTS: Object.freeze({
    PRODUCTS: '../site/produtos-home.json',
    BASKETS: '../site/produtos-cesta-basica.json',
    KITS: '../site/kits.json',
    COUPONS: '../site/cuponsativos.json',
    CATALOG_VERSION: '../catalog-version.json',
    APP_VERSION: '../site/app-version.json',
    BANNERS: '../site/banners/banners.json',
    MAKE_ORDER: 'https://hook.eu1.make.com/cmjv3cc829ocf26vo1h8fs61n5lkt6hc',
    CLIENT_LOOKUP: 'https://hook.eu1.make.com/1wfehhacklarj1h4c78xrh4f7yjdlp9v',
    FIREBASE_ORDERS: 'https://cedar-chemist-310801-default-rtdb.firebaseio.com/pedidos'
  }),
  STORAGE: Object.freeze({
    PREFIX: IS_PRODUCTION ? 'da_v2_' : 'da_next_',
    PRODUCTS: 'products_v1',
    BASKETS: 'baskets_v1',
    KITS: 'kits_v1',
    COUPONS: 'coupons_v1',
    BANNERS: 'banners_v1',
    CART: 'cart_v1',
    FAVORITES: 'favorites_v1',
    CHECKOUT_CLIENT: 'checkout_client_v1',
    ACTIVE_COUPON: 'active_coupon_v1',
    ORDER_QUEUE: 'order_queue_v1',
    PERSONALIZATION: 'personalization_v1'
  }),
  WHATSAPP_NUMBER: '5565998150975',
  MIN_ORDER: 75,
  CART_MAX_AGE_MS: 6 * 60 * 60 * 1000,
  REQUEST_TIMEOUT_MS: 8000,
  ORDER_RETRY_MS: 10 * 60 * 1000,
  ORDER_QUEUE_MAX: 20,
  WHOLESALE_MIN_QTY: 3,
  WHOLESALE_DISCOUNT_RATE: 0.05,
  EXPIRY_BULK_DISCOUNT_RATE: 0.10,
  EXPIRY_BULK_MAX_DAYS: 40
});

export const ROUTINES = Object.freeze({
  'compra-mes': {
    title: 'Compra do mês',
    terms: ['arroz', 'feijao', 'oleo', 'acucar', 'cafe', 'leite', 'macarrao', 'molho', 'farinha', 'sal']
  },
  limpeza: {
    title: 'Limpeza da casa',
    terms: ['sabao', 'detergente', 'desinfetante', 'amaciante', 'agua sanitaria', 'multiuso', 'esponja', 'papel higienico']
  },
  cafe: {
    title: 'Café da manhã',
    terms: ['cafe', 'leite', 'achocolatado', 'biscoito', 'bolacha', 'margarina', 'pao']
  },
  higiene: {
    title: 'Higiene e beleza',
    terms: ['sabonete', 'shampoo', 'condicionador', 'creme dental', 'desodorante', 'absorvente', 'hidratante', 'escova']
  }
});