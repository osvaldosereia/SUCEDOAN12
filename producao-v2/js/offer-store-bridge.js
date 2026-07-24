import { OffersModule } from './modules/offers.js';

if (!OffersModule.prototype.__adminV2BridgeInstalled) {
  OffersModule.prototype.__adminV2BridgeInstalled = true;
  const originalRender = OffersModule.prototype.render;
  const originalRecalculate = OffersModule.prototype.recalculate;

  OffersModule.prototype.render = function bridgedRender(...args) {
    window.__adminV2OffersModule = this;
    window.__adminV2OffersStore = this.store;
    return originalRender.apply(this, args);
  };

  OffersModule.prototype.recalculate = function bridgedRecalculate(...args) {
    window.__adminV2OffersModule = this;
    window.__adminV2OffersStore = this.store;
    return originalRecalculate.apply(this, args);
  };
}
