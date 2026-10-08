/* Smart Delivery PWA: intentionally network-only.
 * Never cache orders, customers, payment details, authentication or API responses.
 * Delivery actions require an online connection and server confirmation.
 */
self.addEventListener('install', event => { event.waitUntil(self.skipWaiting()); });
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
