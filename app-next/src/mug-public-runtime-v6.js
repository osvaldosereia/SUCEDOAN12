const BUILD = '20260826-site-mug-runtime-v6';

await import(`../../shared/mug-make-fast-ack-v1.js?v=${encodeURIComponent(BUILD)}`);
await import(`./mug-public-personalization-v5.js?v=${encodeURIComponent(BUILD)}`);
await import(`./mug-public-route-guard-v6.js?v=${encodeURIComponent(BUILD)}`);

document.documentElement.dataset.mugPublicRuntime = BUILD;
console.info(`Canecas públicas runtime · ${BUILD}`);

export { BUILD };
