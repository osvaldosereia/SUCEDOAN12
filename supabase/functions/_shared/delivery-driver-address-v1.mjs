const MAX_ADDRESS_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function cleanLabel(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function normalizeDriverLocationInput(input = {}) {
  const latitudeText = String(input.latitude ?? "").trim();
  const longitudeText = String(input.longitude ?? "").trim();
  const accuracyText = String(input.accuracy_m ?? "").trim();
  const latitude = Number(latitudeText);
  const longitude = Number(longitudeText);
  const accuracy = Number(accuracyText);

  if (!latitudeText || !longitudeText || !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 ||
      (latitude === 0 && longitude === 0)) {
    throw new Error("invalid_location_coordinates");
  }
  if (!accuracyText || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100000) {
    throw new Error("invalid_location_accuracy");
  }

  const mode = String(input.mode ?? "").trim().toLowerCase();
  if (mode !== "primary" && mode !== "alternate") throw new Error("invalid_location_mode");
  const label = cleanLabel(input.label);
  if (mode === "alternate" && !label) throw new Error("alternate_location_label_required");

  return { latitude, longitude, accuracy_m: accuracy, mode, label };
}

export function validateAddressPhoto(file) {
  const contentType = String(file?.type ?? "").trim().toLowerCase();
  const extension = PHOTO_TYPES.get(contentType);
  if (!extension) throw new Error("address_photo_type_invalid");
  const sizeBytes = Number(file?.size);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) throw new Error("address_photo_empty");
  if (sizeBytes > MAX_ADDRESS_PHOTO_BYTES) throw new Error("address_photo_too_large");
  return { contentType, extension, sizeBytes };
}
