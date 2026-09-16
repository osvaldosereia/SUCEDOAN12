from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

REPLACEMENTS = (
    ("../admin-v3/", "../admin/"),
    ("/admin-v3/", "/admin/"),
    ("admin-v3/", "admin/"),
    ("admin-v3-api", "admin-core-v1"),
    ("admin-v3-product-names", "admin-product-names-v1"),
    ("DA_ADMIN_V3_CONFIG", "DA_ADMIN_CONFIG"),
    ("da_admin_v3_auth", "da_admin_auth"),
    ("__DA_NAMES_V3_READY__", "__DA_NAMES_READY__"),
    ("Admin V3", "Admin"),
    ("Admin v3", "Admin"),
)

SCAN_ROOTS = (
    ROOT / ".github" / "workflows",
    ROOT / "scripts",
    ROOT / "tests",
)

TEXT_SUFFIXES = {".js", ".mjs", ".cjs", ".ts", ".yml", ".yaml", ".json", ".sh", ".py"}
EXCLUDE = {
    # Estes testes já foram reescritos manualmente e contêm expressões que
    # deliberadamente procuram os nomes antigos para impedir regressão.
    ROOT / "scripts" / "test-admin-no-v3-runtime.mjs",
    ROOT / "scripts" / "test-admin-images-no-v3.mjs",
    ROOT / "scripts" / "test-admin-v3-contract.mjs",
    ROOT / "scripts" / "test-admin-v3-inline-product-controls.mjs",
    ROOT / "scripts" / "test-comprar-order-admin-v1.mjs",
    ROOT / "scripts" / "migrate-admin-v3-runtime-to-admin.py",
    ROOT / "scripts" / "remove-admin-v3-legacy.py",
    ROOT / ".github" / "workflows" / "apply-admin-runtime-migration.yml",
    ROOT / ".github" / "workflows" / "remove-admin-v3-legacy.yml",
}

LEGACY_PATHS = (
    ROOT / "admin-v3",
    ROOT / "supabase" / "functions" / "admin-v3-api",
    ROOT / "supabase" / "functions" / "admin-v3-product-names",
    ROOT / "scripts" / "migrate-admin-v3-runtime-to-admin.py",
    ROOT / ".github" / "workflows" / "apply-admin-runtime-migration.yml",
)

SELF_PATHS = (
    ROOT / "scripts" / "remove-admin-v3-legacy.py",
    ROOT / ".github" / "workflows" / "remove-admin-v3-legacy.yml",
)


def neutralize_file(path: Path) -> bool:
    try:
        original = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return False
    updated = original
    for old, new in REPLACEMENTS:
        updated = updated.replace(old, new)
    if updated == original:
        return False
    path.write_text(updated, encoding="utf-8")
    return True


def main() -> None:
    changed: list[str] = []
    for base in SCAN_ROOTS:
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES or path in EXCLUDE:
                continue
            if neutralize_file(path):
                changed.append(path.relative_to(ROOT).as_posix())

    for path in LEGACY_PATHS:
        if path.is_dir():
            shutil.rmtree(path)
            changed.append(path.relative_to(ROOT).as_posix() + "/")
        elif path.exists():
            path.unlink()
            changed.append(path.relative_to(ROOT).as_posix())

    # O utilitário e o workflow são deliberadamente descartáveis: depois da limpeza,
    # manter um mecanismo de migração do legado recriaria a dependência que estamos removendo.
    for path in SELF_PATHS:
        if path.exists():
            path.unlink()
            changed.append(path.relative_to(ROOT).as_posix())

    print(f"Limpeza final preparada: {len(changed)} caminhos alterados/removidos.")
    for item in changed:
        print(f"- {item}")


if __name__ == "__main__":
    main()
