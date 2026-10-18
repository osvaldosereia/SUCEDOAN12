#!/usr/bin/env python3
"""Lightweight structural consistency checks for the Vitrine Admin."""
from pathlib import Path
import re
import sys

root = Path(__file__).resolve().parents[1] / "vitrine/admin"
html = (root / "index.html").read_bytes().decode("utf-8")
runtime = (root / "admin-runtime.js").read_bytes().decode("utf-8")
parts = sorted((root / "runtime-src").glob("*.part.js.txt"))
errors = []
if len(parts) != 9:
    errors.append("Expected nine runtime fragments")
if "".join(p.read_bytes().decode("utf-8") for p in parts) != runtime:
    errors.append("Runtime does not match source fragments")
if html.count('src="/vitrine/admin/admin-runtime.js?') != 1:
    errors.append("Runtime script tag missing or duplicated")
for asset in re.findall(r'(?:src|href)="(/vitrine/admin/[^"]+)"', html):
    rel = asset.split("?", 1)[0].removeprefix("/vitrine/admin/")
    if not (root / rel).is_file():
        errors.append("Missing asset: " + asset)
names = re.findall(r"^  (?:async )?function ([A-Za-z_$][\w$]*)\(", runtime, re.M)
if len(names) != len(set(names)):
    errors.append("Duplicate top-level function names")
if errors:
    for error in errors:
        print("ERROR:", error, file=sys.stderr)
    sys.exit(1)
print("OK:", len(parts), "fragments;", len(names), "top-level functions")
