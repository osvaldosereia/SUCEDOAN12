from __future__ import annotations

import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEGACY = ROOT / "admin-v3"
ADMIN = ROOT / "admin"

SEED_FILES = {
    "styles.css",
    "products-inline-controls-v4.css",
    "app.js",
    "api.js",
    "orders-integrated-v2.js",
    "order-label-print-v1.js",
    "products-inline-controls-v4.js",
    "nav-fix.js",
    "basket-editor.js",
    "pedidos-v2.css",
    "pedidos-v2.js",
    "style.css",
    "mobile-priority.css",
    "admin-subpage-guard.js",
    "service-intelligence.css",
    "service-intelligence.js",
    "agent-learning.css",
    "agent-learning.js",
    "service-strategy.css",
    "service-strategy.js",
    "service-chat-center.css",
    "chat-real-test.css",
    "chat-real-test.js",
    "product-name-management.css",
    "commercial-truth.js",
    "logistics.js",
    "automation-builder.js",
}

ACTIVE_ADMIN_FILES = [
    "index.html",
    "pedidos.html",
    "inteligencia.html",
    "aprendizados.html",
    "whatsapp-flow-key.html",
]

TEXT_SUFFIXES = {".html", ".js", ".mjs", ".css", ".json", ".md", ".txt"}


def transform_text(text: str) -> str:
    text = text.replace("/admin-v3/nomes-produtos-v3.html", "./nomes-produtos.html")
    text = text.replace("../admin-v3/nomes-produtos-v3.html", "./nomes-produtos.html")
    text = text.replace("./nomes-produtos-v3.html", "./nomes-produtos.html")
    text = text.replace("/admin-v3/", "./")
    text = text.replace("../admin-v3/", "./")
    text = text.replace("DA_ADMIN_V3_CONFIG", "DA_ADMIN_CONFIG")
    text = text.replace("da_admin_v3_auth", "da_admin_auth")
    text = text.replace("Admin V3", "Admin")
    text = text.replace("from './config.js'", "from './runtime-config.js'")
    text = text.replace('from "./config.js"', 'from "./runtime-config.js"')
    return text


def relative_dependencies(text: str) -> set[str]:
    deps: set[str] = set()
    patterns = [
        r"(?:from\s+|import\s*\()\s*['\"]\./([^'\"?#]+)",
        r"(?:src|href)=['\"]\./([^'\"?#]+)",
        r"url\(\s*['\"]?\./([^)'\"?#]+)",
    ]
    for pattern in patterns:
        deps.update(re.findall(pattern, text))
    return deps


def copy_one(name: str, queue: list[str], copied: set[str]) -> None:
    if name in copied:
        return
    source_name = "config.js" if name == "runtime-config.js" else name
    source = LEGACY / source_name
    if not source.exists() or not source.is_file():
        return

    destination_name = "runtime-config.js" if source_name == "config.js" else name
    destination = ADMIN / destination_name
    destination.parent.mkdir(parents=True, exist_ok=True)

    if source.suffix.lower() in TEXT_SUFFIXES:
        text = source.read_text(encoding="utf-8")
        text = transform_text(text)
        destination.write_text(text, encoding="utf-8")
        for dep in relative_dependencies(text):
            if dep == "config.js":
                dep = "runtime-config.js"
            if (LEGACY / ("config.js" if dep == "runtime-config.js" else dep)).exists():
                queue.append(dep)
    else:
        shutil.copy2(source, destination)
    copied.add(destination_name)


def migrate_active_pages() -> None:
    for name in ACTIVE_ADMIN_FILES:
        path = ADMIN / name
        path.write_text(transform_text(path.read_text(encoding="utf-8")), encoding="utf-8")

    config = ADMIN / "config.js"
    source = config.read_text(encoding="utf-8")
    source = source.replace(
        "\n// Alias de compatibilidade somente para módulos antigos. Todos os módulos sensíveis\n"
        "// continuam explicitamente desligados acima e o Admin oficial segue no endpoint simples.\n"
        "window.DA_ADMIN_V3_CONFIG = window.DA_ADMIN_CONFIG;\n",
        "\n",
    )
    source = source.replace("DA_ADMIN_V3_CONFIG", "DA_ADMIN_CONFIG")
    source = source.replace("da_admin_v3_auth", "da_admin_auth")
    config.write_text(source, encoding="utf-8")


def migrate_named_pages() -> None:
    atendimento = transform_text((LEGACY / "atendimento.html").read_text(encoding="utf-8"))
    (ADMIN / "atendimento.html").write_text(atendimento, encoding="utf-8")

    nomes = transform_text((LEGACY / "nomes-produtos-v3.html").read_text(encoding="utf-8"))
    nomes = nomes.replace("nomes-produtos-v3.html", "nomes-produtos.html")
    nomes = nomes.replace("versão atual do Admin", "Admin atual")
    (ADMIN / "nomes-produtos.html").write_text(nomes, encoding="utf-8")


def main() -> None:
    if not LEGACY.exists():
        raise SystemExit("admin-v3/ não encontrado para a migração.")
    ADMIN.mkdir(parents=True, exist_ok=True)

    migrate_active_pages()
    migrate_named_pages()

    queue = list(sorted(SEED_FILES | {"runtime-config.js"}))
    copied: set[str] = set()
    while queue:
        copy_one(queue.pop(0), queue, copied)

    # Dependências relativas das duas páginas recém-migradas.
    for page_name in ("atendimento.html", "nomes-produtos.html"):
        for dep in relative_dependencies((ADMIN / page_name).read_text(encoding="utf-8")):
            if dep == "config.js":
                dep = "runtime-config.js"
            queue.append(dep)
    while queue:
        copy_one(queue.pop(0), queue, copied)

    print(f"Migração concluída: {len(copied)} assets copiados para admin/.")


if __name__ == "__main__":
    main()
