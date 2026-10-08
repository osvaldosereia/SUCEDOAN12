// Contrato de apresentação da localização WhatsApp. Não confirma endereço nem altera pedidos.
function coordinate(value, min, max) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^[+-]?(?:\\d+\\.?\\d*|\\.\\d+)$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}
function textField(value, length) {
  return typeof value === 'string' ? value.trim().slice(0, length) : '';
}
export function normalizeWhatsAppLocation(message) {
  const location = message?.metadata?.location;
  if (!location || typeof location !== 'object' || Array.isArray(location)) return null;
  const latitude = coordinate(location.latitude, -90, 90);
  const longitude = coordinate(location.longitude, -180, 180);
  if (latitude === null || longitude === null) return null;
  return {
    latitude, longitude,
    name: textField(location.name, 240),
    address: textField(location.address, 600)
  };
}
export function locationCoordinates(location) {
  return `${location.latitude.toFixed(6)},${location.longitude.toFixed(6)}`;
}
export function locationMapsUrl(location) {
  return 'https://www.google.com/maps/search/?api=1&query=' +
    encodeURIComponent(locationCoordinates(location));
}
