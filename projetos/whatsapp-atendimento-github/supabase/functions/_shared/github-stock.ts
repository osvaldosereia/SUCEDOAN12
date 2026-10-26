import { validateCatalog, type CatalogDocuments } from "../../../src/domain/catalog.ts";

const OWNER = "osvaldosereia";
const REPOSITORY = "SUCEDOAN12";
const BRANCH = "project/whatsapp-atendimento-github-20261025";
const CATALOG_ROOT = "projetos/whatsapp-atendimento-github/catalog";
const API = "https://api.github.com";
const API_VERSION = "2022-11-28";

export interface ConfirmedStockItem {
  productId: string;
  quantity: number;
}

export class GitHubStockError extends Error {
  constructor(message = "O estoque do catálogo não pôde ser atualizado.") {
    super(message);
    this.name = "GitHubStockError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function bytesFromBase64(value: string): Uint8Array {
  const binary = atob(value.replace(/\s/g, ""));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function base64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64Url(value: Uint8Array): string {
  return base64(value).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function derLength(length: number): Uint8Array {
  if (length < 128) return new Uint8Array([length]);
  const bytes: number[] = [];
  for (let remaining = length; remaining > 0; remaining = Math.floor(remaining / 256)) bytes.unshift(remaining & 255);
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

function der(tag: number, content: Uint8Array): Uint8Array {
  return new Uint8Array([tag, ...derLength(content.length), ...content]);
}

function privateKeyDer(value: string): Uint8Array {
  const pem = value.replace(/\\n/g, "\n").trim();
  const pkcs8 = pem.match(/-----BEGIN PRIVATE KEY-----([\s\S]+?)-----END PRIVATE KEY-----/);
  if (pkcs8) return bytesFromBase64(pkcs8[1]);
  const pkcs1 = pem.match(/-----BEGIN RSA PRIVATE KEY-----([\s\S]+?)-----END RSA PRIVATE KEY-----/);
  if (!pkcs1) throw new GitHubStockError("A chave privada do GitHub App não está em formato compatível.");
  const key = bytesFromBase64(pkcs1[1]);
  const algorithm = new Uint8Array([0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]);
  return der(0x30, new Uint8Array([0x02, 0x01, 0x00, ...algorithm, ...der(0x04, key)]));
}

function asArrayBuffer(value: Uint8Array): ArrayBuffer {
  const result = new ArrayBuffer(value.byteLength);
  new Uint8Array(result).set(value);
  return result;
}

async function appJwt(): Promise<string> {
  const appId = Deno.env.get("GITHUB_APP_ID");
  const privateKey = Deno.env.get("GITHUB_PRIVATE_KEY");
  if (!appId || !privateKey) throw new GitHubStockError("O acesso de escrita do GitHub App não está configurado para o webhook.");
  const header = base64Url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({ iss: appId, iat: now - 60, exp: now + 8 * 60 })));
  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey("pkcs8", asArrayBuffer(privateKeyDer(privateKey)), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, asArrayBuffer(new TextEncoder().encode(unsigned)));
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}

async function installationToken(): Promise<string> {
  const installationId = Deno.env.get("GITHUB_INSTALLATION_ID");
  if (!installationId) throw new GitHubStockError("A instalação GitHub App não está configurada para o webhook.");
  const response = await fetch(`${API}/app/installations/${encodeURIComponent(installationId)}/access_tokens`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${await appJwt()}`,
      "X-GitHub-Api-Version": API_VERSION,
      "Content-Type": "application/json",
      "User-Agent": "whatsapp-atendimento-github-checkout",
    },
    body: JSON.stringify({ repositories: [REPOSITORY], permissions: { contents: "write" } }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new GitHubStockError("O GitHub App não conseguiu emitir acesso temporário para atualizar o estoque.");
  const result = await response.json() as { token?: string };
  if (!result.token) throw new GitHubStockError();
  return result.token;
}

interface GitHubResult {
  response: Response;
  json: unknown;
}

async function github(token: string, path: string, init: RequestInit = {}, accepted = [200]): Promise<GitHubResult> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("X-GitHub-Api-Version", API_VERSION);
  headers.set("User-Agent", "whatsapp-atendimento-github-checkout");
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API}${path}`, { ...init, headers, signal: AbortSignal.timeout(8000) });
  const json = await response.json().catch(() => ({}));
  if (!accepted.includes(response.status)) throw new GitHubStockError();
  return { response, json };
}

function repositoryPath(path: string): string {
  return `/repos/${OWNER}/${REPOSITORY}${path}`;
}

function decodeContent(content: string): string {
  return new TextDecoder().decode(bytesFromBase64(content));
}

async function sha256(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function branchHead(token: string): Promise<string> {
  const { json } = await github(token, repositoryPath(`/branches/${encodeURIComponent(BRANCH)}`));
  if (!isRecord(json) || !isRecord(json.commit) || typeof json.commit.sha !== "string") throw new GitHubStockError();
  return json.commit.sha;
}

async function readFile(token: string, path: string, ref: string): Promise<{ content: string; sha: string } | null> {
  const result = await github(token, repositoryPath(`/contents/${path}?ref=${encodeURIComponent(ref)}`), {}, [200, 404]);
  if (result.response.status === 404) return null;
  if (!isRecord(result.json) || typeof result.json.content !== "string" || typeof result.json.sha !== "string") throw new GitHubStockError();
  return { content: decodeContent(result.json.content), sha: result.json.sha };
}

async function markerExists(token: string, path: string, ref: string): Promise<boolean> {
  const result = await github(token, repositoryPath(`/contents/${path}?ref=${encodeURIComponent(ref)}`), {}, [200, 404]);
  return result.response.status === 200;
}

async function createBlob(token: string, content: string): Promise<string> {
  const { json } = await github(token, repositoryPath("/git/blobs"), {
    method: "POST",
    body: JSON.stringify({ content, encoding: "utf-8" }),
  }, [201]);
  if (!isRecord(json) || typeof json.sha !== "string") throw new GitHubStockError();
  return json.sha;
}

function normalizedItems(items: ConfirmedStockItem[]): Map<string, number> {
  if (!Array.isArray(items) || items.length < 1 || items.length > 100) throw new GitHubStockError("Os itens do pedido não podem atualizar o estoque com segurança.");
  const totals = new Map<string, number>();
  for (const item of items) {
    if (!isRecord(item) || typeof item.productId !== "string" || !/^[a-z0-9][a-z0-9-]{0,79}$/i.test(item.productId)
      || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 6) {
      throw new GitHubStockError("Os itens do pedido não correspondem ao contrato de estoque.");
    }
    const quantity = (totals.get(item.productId) ?? 0) + item.quantity;
    if (!Number.isSafeInteger(quantity)) throw new GitHubStockError();
    totals.set(item.productId, quantity);
  }
  return totals;
}

/** Applies one public stock commit per confirmed draft, keyed by a one-way opaque marker. */
export async function decrementGitHubStockForConfirmation(draftId: string, items: ConfirmedStockItem[]): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(draftId)) throw new GitHubStockError("O pedido não contém uma chave de estoque válida.");
  const itemQuantities = normalizedItems(items);
  const markerPath = `${CATALOG_ROOT}/stock-events/${await sha256(`whatsapp-order-confirmed:${draftId}`)}.json`;
  const token = await installationToken();

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const head = await branchHead(token);
    if (await markerExists(token, markerPath, head)) return;
    const [productsFile, basketsFile] = await Promise.all([
      readFile(token, `${CATALOG_ROOT}/products.json`, head),
      readFile(token, `${CATALOG_ROOT}/baskets.json`, head),
    ]);
    if (!productsFile || !basketsFile) throw new GitHubStockError("O catálogo GitHub está incompleto.");
    const documents = { products: JSON.parse(productsFile.content), baskets: JSON.parse(basketsFile.content) } as CatalogDocuments;
    if (validateCatalog(documents).length) throw new GitHubStockError("O catálogo GitHub não passou pela validação do servidor.");
    const products = documents.products.products;
    const byId = new Map(products.map((product) => [product.id, product]));
    for (const [id, quantity] of itemQuantities) {
      const product = byId.get(id);
      if (!product || !Number.isSafeInteger(product.stockQuantity) || !Number.isSafeInteger(product.stockQuantity - quantity)) {
        throw new GitHubStockError("Um produto do pedido não pode ser baixado do catálogo atual.");
      }
      product.stockQuantity -= quantity;
    }

    const [productsBlob, markerBlob] = await Promise.all([
      createBlob(token, `${JSON.stringify(documents.products, null, 2)}\n`),
      createBlob(token, JSON.stringify({ schemaVersion: 1, operation: "confirmed_order_stock_decrement" })),
    ]);
    const baseTree = await github(token, repositoryPath(`/git/commits/${head}`));
    if (!isRecord(baseTree.json) || !isRecord(baseTree.json.tree) || typeof baseTree.json.tree.sha !== "string") throw new GitHubStockError();
    const treeResult = await github(token, repositoryPath("/git/trees"), {
      method: "POST",
      body: JSON.stringify({
        base_tree: baseTree.json.tree.sha,
        tree: [
          { path: `${CATALOG_ROOT}/products.json`, mode: "100644", type: "blob", sha: productsBlob },
          { path: markerPath, mode: "100644", type: "blob", sha: markerBlob },
        ],
      }),
    }, [201]);
    if (!isRecord(treeResult.json) || typeof treeResult.json.sha !== "string") throw new GitHubStockError();
    const commitResult = await github(token, repositoryPath("/git/commits"), {
      method: "POST",
      body: JSON.stringify({ message: "chore(whatsapp): apply confirmed basket stock", tree: treeResult.json.sha, parents: [head] }),
    }, [201]);
    if (!isRecord(commitResult.json) || typeof commitResult.json.sha !== "string") throw new GitHubStockError();
    const updated = await github(token, repositoryPath(`/git/refs/heads/${BRANCH}`), {
      method: "PATCH",
      body: JSON.stringify({ sha: commitResult.json.sha, force: false }),
    }, [200, 409, 422]);
    if (updated.response.ok) return;
  }
  throw new GitHubStockError("O catálogo mudou em paralelo. O webhook pode repetir a confirmação com segurança.");
}
