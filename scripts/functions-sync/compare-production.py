"""Compara as Edge Functions baixadas da produção com o repositório.

Uso:
  python3 scripts/functions-sync/compare-production.py <pasta-download> [--archive]

<pasta-download> tem uma subpasta por função, cada uma com o resultado de
`supabase functions download <slug> --use-api` (supabase/functions/...).

Sem --archive, só imprime as diferenças das funções que existem no repositório.
Com --archive, copia as funções que não existem em supabase/functions/ para
supabase/functions-archive/<slug>/, com os arquivos _shared que cada uma usava.
"""
import pathlib, shutil, sys

repo = pathlib.Path(__file__).resolve().parents[2]
live = repo / "supabase" / "functions"
archive = repo / "supabase" / "functions-archive"
download = pathlib.Path(sys.argv[1])
do_archive = "--archive" in sys.argv

same, differ, archived = [], [], []
for fn_dir in sorted(p for p in download.iterdir() if p.is_dir()):
    slug = fn_dir.name
    src = fn_dir / "supabase" / "functions"
    if not src.exists():
        continue
    files = [f for f in src.rglob("*") if f.is_file()]
    if (live / slug).exists():
        changed = []
        for f in files:
            rel = f.relative_to(src)
            target = live / rel
            if not target.exists():
                changed.append(f"{rel} (só na produção)")
            elif target.read_bytes() != f.read_bytes():
                changed.append(f"{rel} (diferente)")
        (differ if changed else same).append((slug, changed))
    elif do_archive:
        dest = archive / slug
        if dest.exists():
            shutil.rmtree(dest)
        for f in files:
            out = dest / f.relative_to(src)
            out.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(f, out)
        archived.append(slug)

print(f"iguais ao repositório: {len(same)}")
for slug, changed in differ:
    print(f"DIFERENTE {slug}:")
    for line in changed:
        print("   ", line)
if do_archive:
    print(f"arquivadas em supabase/functions-archive/: {len(archived)}")
