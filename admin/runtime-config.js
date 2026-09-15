const base=window.DA_ADMIN_CONFIG||{};
export const CONFIG=Object.freeze({
  supabaseUrl:base.supabaseUrl,
  supabasePublishableKey:base.supabasePublishableKey,
  adminFunction:'admin-v3-api',
  adminOrdersFunction:'admin-orders-comprar-v1',
  storefrontUrl:'../comprar/',
  countAppUrl:'../contagem/',
  build:'20260915-admin-canonical-v1'
});
