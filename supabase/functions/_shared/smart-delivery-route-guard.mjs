export function validateRouteStops(stops) {
  if (!Array.isArray(stops) || stops.length === 0 || stops.length > 100)
    throw new Error("Invalid stop count");
  const ids = new Set();
  for (const stop of stops) {
    if (typeof stop?.id !== "string" || !stop.id.trim() || ids.has(stop.id))
      throw new Error("Duplicate or invalid stop");
    ids.add(stop.id);
    if (stop.lat == null || stop.lng == null ||
        String(stop.lat).trim() === "" || String(stop.lng).trim() === "" ||
        !Number.isFinite(Number(stop.lat)) || !Number.isFinite(Number(stop.lng)) ||
        Math.abs(Number(stop.lat)) > 90 || Math.abs(Number(stop.lng)) > 180 ||
        (Number(stop.lat) === 0 && Number(stop.lng) === 0))
      throw new Error("Invalid coordinates");
  }
  return stops;
}
