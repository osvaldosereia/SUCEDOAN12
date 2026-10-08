export function validateRouteStops(stops) {
  if (!Array.isArray(stops) || stops.length < 1 || stops.length > 30) throw new Error("invalid_stop_count");
  const seen = new Set();
  return stops.map(stop => {
    const id = String(stop.id || "");
    const latitude = Number(stop.latitude), longitude = Number(stop.longitude);
    if (!id || seen.has(id)) throw new Error("duplicate_stop");
    if (stop.latitude == null || stop.longitude == null ||
        !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error("invalid_coordinates");
    seen.add(id);
    return { id, latitude, longitude };
  });
}
export function buildGoogleRequest(stops) {
  const valid = validateRouteStops(stops);
  return { timeout: "15s", considerRoadTraffic: true,
    model: { shipments: valid.map(s => ({
      label: s.id,
      deliveries: [{ arrivalLocation: { latitude: s.latitude, longitude: s.longitude }, duration: "180s" }],
      penaltyCost: 1000000
    })), vehicles: [{ label: "dona-antonia", travelMode: "DRIVING", costPerHour: 1 }] } };
}
export function parseGoogleResponse(response, stops) {
  if (!Array.isArray(response?.routes) || response.routes.length !== 1 ||
      response.skippedShipments?.length) throw new Error("invalid_response");
  const visits = response.routes[0].visits;
  if (!Array.isArray(visits) || visits.length !== stops.length) throw new Error("incomplete_response");
  const seen = new Set();
  return visits.map(visit => {
    const index = Number(visit.shipmentIndex);
    if (!Number.isInteger(index) || index < 0 || index >= stops.length || seen.has(index))
      throw new Error("invalid_visit");
    seen.add(index);
    return stops[index].id;
  });
}
