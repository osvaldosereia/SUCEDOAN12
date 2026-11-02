export function constantTimeEquals(left, right) {
  const encoder = new TextEncoder();
  const a = encoder.encode(String(left ?? ""));
  const b = encoder.encode(String(right ?? ""));
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return false;

  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}
