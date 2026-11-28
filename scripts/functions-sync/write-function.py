"""Grava em supabase/functions/ os arquivos de uma Edge Function obtida com get_edge_function.

Uso: python3 scripts/functions-sync/write-function.py <saida-json> [<saida-json> ...]
Arquivos de _shared/ que já existem no repositório e têm outro conteúdo são gravados
em supabase/functions/_shared/.production/<slug>/ para comparação, sem sobrescrever.
"""
import json, sys, pathlib

root = pathlib.Path(__file__).resolve().parents[2] / "supabase" / "functions"
for arg in sys.argv[1:]:
    data = json.load(open(arg))
    if isinstance(data, list):
        data = json.loads(data[0]["text"])
    if "result" in data and isinstance(data["result"], str):
        data = json.loads(data["result"])
    slug = data["slug"]
    entry = data.get("entrypoint_path", "")
    for f in data["files"]:
        name = f["name"]
        if not name.startswith(slug + "/") and not name.startswith("_shared/"):
            name = f"{slug}/{name}"
        target = root / name
        content = f["content"]
        if name.startswith("_shared/") and target.exists() and target.read_text() != content:
            alt = root / "_shared" / ".production" / slug / name.removeprefix("_shared/")
            alt.parent.mkdir(parents=True, exist_ok=True)
            alt.write_text(content)
            print(f"{slug}: _shared diverge -> {alt.relative_to(root)}")
            continue
        status = "unchanged" if target.exists() and target.read_text() == content else ("updated" if target.exists() else "new")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
        print(f"{slug}: {name} [{status}] {len(content)} bytes")
