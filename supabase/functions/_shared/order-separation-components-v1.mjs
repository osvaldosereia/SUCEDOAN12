const PUBLIC_TOKEN_RE = /^[a-f0-9]{16}$/i;
const EXPECTED_BUTTONS = [
  { text: "Conferir pedido", url: "https://donaantonia.com.br/p/?k={{1}}" },
  { text: "Acompanhar entrega", url: "https://donaantonia.com.br/acompanhar/?k={{1}}" },
];

function placeholderNumbers(text) {
  return [...String(text || "").matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
}

function contiguousPlaceholders(values, count) {
  return values.length === count && new Set(values).size === count &&
    Array.from({ length: count }, (_, index) => index + 1).every((number) => values.includes(number));
}

function validPublicOrderUrl(value, token) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && url.hostname === "donaantonia.com.br" &&
      url.pathname === "/p/" && url.hash === "" && url.searchParams.size === 1 &&
      url.searchParams.get("k") === token;
  } catch (_) {
    return false;
  }
}

export function buildOrderSeparationComponents(kind, bodyValues, publicToken, orderUrl, templateComponents) {
  const expectedBodyCount = kind === "prepared_ok" ? 2 : kind === "prepared_adjusted" ? 5 : 0;
  if (!expectedBodyCount || !Array.isArray(bodyValues) || bodyValues.length !== expectedBodyCount ||
      !PUBLIC_TOKEN_RE.test(String(publicToken || "")) || !validPublicOrderUrl(orderUrl, String(publicToken))) return null;

  const components = Array.isArray(templateComponents) ? templateComponents : [];
  const body = components.find((item) => String(item?.type || "").toUpperCase() === "BODY");
  const bodyVariables = placeholderNumbers(body?.text);
  if (!body) return null;

  const buttonsComponent = components.find((item) => String(item?.type || "").toUpperCase() === "BUTTONS");
  if (buttonsComponent && components.length === 2) {
    const buttons = Array.isArray(buttonsComponent.buttons) ? buttonsComponent.buttons : [];
    const validButtons = buttons.length === EXPECTED_BUTTONS.length && buttons.every((button, index) =>
      String(button?.type || "").toUpperCase() === "URL" &&
      button?.text === EXPECTED_BUTTONS[index].text && button?.url === EXPECTED_BUTTONS[index].url);
    if (!validButtons || !contiguousPlaceholders(bodyVariables, expectedBodyCount)) return null;
    return [
      { type: "body", parameters: bodyValues.map((text) => ({ type: "text", text: String(text) })) },
      ...EXPECTED_BUTTONS.map((_, index) => ({
        type: "button",
        sub_type: "url",
        index: String(index),
        parameters: [{ type: "text", text: String(publicToken) }],
      })),
    ];
  }

  if (components.length !== 1 || !contiguousPlaceholders(bodyVariables, expectedBodyCount + 1)) return null;
  return [{
    type: "body",
    parameters: [...bodyValues, String(orderUrl)].map((text) => ({ type: "text", text: String(text) })),
  }];
}
