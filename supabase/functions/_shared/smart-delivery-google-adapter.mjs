import { validateRouteStops } from "./smart-delivery-route-guard.mjs";

export function buildGoogleOptimizeToursRequest(stops, window) {
  validateRouteStops(stops);
  const startTime = window?.startTime;
  const endTime = window?.endTime;
  if (!Number.isFinite(Date.parse(startTime)) || !Number.isFinite(Date.parse(endTime)) ||
      Date.parse(startTime) >= Date.parse(endTime)) throw new Error("Invalid delivery window");
  const shipments = stops.map((stop) => ({
    label: stop.id,
    deliveries: [{
      arrivalLocation: { latitude: Number(stop.lat), longitude: Number(stop.lng) },
      duration: "180s"
    }]
  }));
  const vehicle = { label: "dona-antonia-route", costPerKilometer: 1 };
  if (window.depot) {
    const { latitude, longitude } = window.depot;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 || Math.abs(longitude) > 180 ||
        (latitude === 0 && longitude === 0))
      throw new Error("Invalid depot coordinates");
    vehicle.startLocation = { latitude, longitude };
    if (window.returnToDepot !== false) vehicle.endLocation = { latitude, longitude };
  }
  return {
    timeout: "20s", considerRoadTraffic: true, populatePolylines: false,
    model: { globalStartTime: startTime, globalEndTime: endTime,
      shipments, vehicles: [vehicle] }
  };
}

export function readGoogleOptimizedOrder(response, stops) {
  validateRouteStops(stops);
  if (response?.skippedShipments?.length) throw new Error("Skipped shipments");
  if (!Array.isArray(response?.routes) || response.routes.length !== 1)
    throw new Error("Expected exactly one route");
  const route = response.routes[0];
  if (Number(route.vehicleIndex ?? 0) !== 0 ||
      !Array.isArray(route.visits) || route.visits.length !== stops.length)
    throw new Error("Incomplete route");
  const seen = new Set();
  const order = route.visits.map((visit) => {
    const index = Number(visit.shipmentIndex ?? 0);
    if (!Number.isInteger(index) || index < 0 || index >= stops.length ||
        Number(visit.visitRequestIndex ?? 0) !== 0 ||
        visit.isPickup === true || seen.has(index))
      throw new Error("Invalid visit");
    if (visit.shipmentLabel && visit.shipmentLabel !== stops[index].id)
      throw new Error("Mismatched shipment label");
    seen.add(index);
    return stops[index].id;
  });
  if (seen.size !== stops.length) throw new Error("Missing shipment");
  return order;
}
