#!/usr/bin/env python3
"""Rebuild the legacy Vitrine Admin runtime without changing execution semantics.

Source fragments are deliberately ordered slices of the original IIFE, NOT
independently executable JavaScript modules. Concatenating them preserves the
single closure, hoisting, initialization order, and existing cross-function
references. Do not load fragments separately in the browser.
"""
from pathlib import Path
import argparse
import difflib
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "vitrine/admin/runtime-src"
OUTPUT = ROOT / "vitrine/admin/admin-runtime.js"
PARTS = [
    "01-core-navigation.part.js.txt",
    "02-orders-expedition.part.js.txt",
    "03-operations.part.js.txt",
    "04-products.part.js.txt",
    "05-inventory.part.js.txt",
    "06-purchases.part.js.txt",
    "07-customers.part.js.txt",
    "08-orders-detail.part.js.txt",
    "09-bootstrap.part.js.txt",
]


def assembled():
    # newline="" avoids platform-specific newline conversion.
    return "".join((SOURCE / part).read_bytes().decode("utf-8") for part in PARTS)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Compare generated output without modifying files")
    args = parser.parse_args()
    expected = assembled()
    if args.check:
        actual = OUTPUT.read_bytes().decode("utf-8")
        if actual != expected:
            print("Admin runtime is out of sync. Run: python3 scripts/build-vitrine-admin-runtime.py", file=sys.stderr)
            for line in list(difflib.unified_diff(actual.splitlines(), expected.splitlines(), fromfile="current", tofile="generated"))[:30]:
                print(line, file=sys.stderr)
            return 1
        print(f"OK: {len(PARTS)} source fragments exactly match {OUTPUT.relative_to(ROOT)} ({len(expected)} characters)")
        return 0
    OUTPUT.write_bytes(expected.encode("utf-8"))
    print(f"Generated {OUTPUT.relative_to(ROOT)} from {len(PARTS)} fragments")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
