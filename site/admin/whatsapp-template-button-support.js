(() => {
  "use strict";

  const publicTokenLinks = new Set([
    "https://donaantonia.com.br/p/?k={{1}}",
    "https://donaantonia.com.br/acompanhar/?k={{1}}",
  ]);
  const publicTokenExample = "0123456789abcdef";
  const legacyCapabilityExample = publicTokenExample.repeat(4);

  const exampleForUrl = (url) => publicTokenLinks.has(String(url || "").trim())
    ? publicTokenExample
    : legacyCapabilityExample;

  const isValidExample = (url, example) => {
    const expectedLength = exampleForUrl(url).length;
    return new RegExp("^[a-f0-9]{" + expectedLength + "}$", "i").test(String(example || ""));
  };

  window.DonaTemplateButtonSupport = Object.freeze({ exampleForUrl, isValidExample });
})();
