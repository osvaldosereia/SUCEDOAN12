export function isExactMarketingOptOutReply(value) {
  if (typeof value !== "string") return false;
  const normalized = value
    .normalize("NFKC")
    .trim()
    .replace(/\\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
  return normalized === "sair";
}
