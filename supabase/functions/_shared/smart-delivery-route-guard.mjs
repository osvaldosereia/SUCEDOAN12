export function validateRouteStops(stops) {
  if (!Array.isArray(stops) || stops.length === 0 || stops.length > 100) throw new Error("Invalid stop count");
  const ids = new Set();
  for (const stop of stops) {
    if (!stop?.id || ids.has(stop.id)) throw new Error("Duplicate stop");
    ids.add(stop.id);
    if (!Number.isFinite(Number(stop.lat)) || !Number.isFinite(Number(stop.lng)) ||
        stop.lat == null || stop.lng == null || Math.abs(Number(stop.lat)) > 90 ||
        Math.abs(Number(stop.lng)) > 180) throw new Error("Invalid coordinates");
  }
  return stops;
}
