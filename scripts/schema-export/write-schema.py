"""Grava o retrato do schema em supabase/schema/ a partir da saída JSON de export-schema.sql.

Uso: python3 scripts/schema-export/write-schema.py <saida-do-execute_sql.txt>
"""
import json, re, sys, pathlib, collections

raw = json.load(open(sys.argv[1]))
text = raw["result"] if isinstance(raw, dict) else raw
match = re.search(r"<untrusted-data-[^>]+>\s*(\[.*\])\s*</untrusted-data", text, re.S)
rows = json.loads(match.group(1)) if match else json.loads(text)

root = pathlib.Path(__file__).resolve().parents[2] / "supabase" / "schema"
PLURAL = {"index": "indexes", "policy": "policies"}
order = ["extension", "schema", "type", "sequence", "table", "foreign_key", "index", "view",
         "materialized_view", "function", "procedure", "aggregate", "trigger", "policy",
         "grant", "function_grant", "cron_job", "bucket"]
groups = collections.defaultdict(list)
for r in rows:
    groups[(r["schema"], r["kind"])].append(r)

secret_patterns = re.compile(r"(sbp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|Bearer [A-Za-z0-9._-]{20,})")
redacted = 0
if root.exists():
    for f in root.rglob("*.sql"):
        f.unlink()
summary = collections.Counter()
for (schema, kind), items in sorted(groups.items(), key=lambda kv: (kv[0][0], order.index(kv[0][1]) if kv[0][1] in order else 99)):
    items.sort(key=lambda r: r["name"])
    parts = []
    for r in items:
        ddl, n = secret_patterns.subn("<REDACTED>", r["ddl"] or "")
        redacted += n
        parts.append(f"-- {kind}: {r['name']}\n{ddl.rstrip()}\n")
    path = root / schema / f"{order.index(kind) if kind in order else 99:02d}_{PLURAL.get(kind, kind + 's')}.sql"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(parts))
    summary[kind] += len(items)

print(dict(summary))
print("redacted secrets:", redacted)
