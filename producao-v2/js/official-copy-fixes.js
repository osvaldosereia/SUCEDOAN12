const REPLACEMENTS = [
  [/Admin V2/g, 'Admin oficial'],
  [/Versão V2/g, 'Admin oficial'],
  [/Gravações da V2/g, 'Gravações do Admin'],
  [/Última publicação V2/g, 'Última publicação'],
  [/Configurações da V2/g, 'Configurações do Admin'],
  [/pela V2/g, 'pelo Admin oficial'],
  [/na V2/g, 'no Admin oficial'],
  [/da V2/g, 'do Admin oficial'],
  [/Habilitada para teste/g, 'Ativa'],
  [/habilitada para teste/g, 'ativada'],
  [/Ativadas para teste controlado/g, 'Ativadas para operação oficial'],
  [/Ativado para teste controlado/g, 'Ativado para operação oficial'],
  [/liberada para teste controlado/g, 'liberada para execução'],
  [/somente durante testes controlados/g, 'antes de concluir a operação'],
  [/somente durante um teste controlado/g, 'somente quando a importação estiver conferida'],
  [/confirmo este teste/g, 'confirmo esta importação'],
  [/habilitada para teste neste navegador/g, 'ativada neste navegador'],
  [/ambiente paralelo/g, 'sistema oficial'],
  [/versão paralela/gi, 'versão oficial'],
];

function rewrite(value) {
  let output = String(value || '');
  for (const [pattern, replacement] of REPLACEMENTS) output = output.replace(pattern, replacement);
  return output;
}

function visit(node) {
  if (!node) return;
  if (node.nodeType === Node.TEXT_NODE) {
    const next = rewrite(node.nodeValue);
    if (next !== node.nodeValue) node.nodeValue = next;
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
  const element = node.nodeType === Node.ELEMENT_NODE ? node : null;
  if (element) {
    for (const attribute of ['title', 'placeholder', 'aria-label']) {
      if (!element.hasAttribute(attribute)) continue;
      const current = element.getAttribute(attribute);
      const next = rewrite(current);
      if (next !== current) element.setAttribute(attribute, next);
    }
  }
  node.childNodes.forEach(visit);
}

function install() {
  visit(document.body);
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') visit(mutation.target);
      mutation.addedNodes.forEach(visit);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
else install();

export { rewrite };
