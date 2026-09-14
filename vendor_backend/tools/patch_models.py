#!/usr/bin/env python3
"""
Patch the two Oracle-only SQL patterns that cannot be fixed with a
Postgres compatibility function.

  1. TO_CHAR(SYSDATE,'YYYY') - TO_CHAR(col,'YYYY')
     Oracle implicitly casts the text back to a number. Postgres raises
     `operator does not exist: text - text`. Rewritten with EXTRACT,
     which returns numeric, so the surrounding FLOOR(.../10)*10 is
     unaffected.

  2. Any remaining bare SYSDATE -> CURRENT_TIMESTAMP.

Everything else (TO_CHAR format masks, NVL, SUBSTR, CONCAT, ||) is
either natively compatible or covered by sql_pg/00_compat.sql.

Usage:  python3 tools/patch_models.py [--dry-run]
"""
import os
import re
import sys

DRY = '--dry-run' in sys.argv
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET_DIRS = ['models', 'controllers', 'api', 'utils']

# TO_CHAR(SYSDATE, 'YYYY') - TO_CHAR( <anything not a paren> , 'YYYY')
AGE_RE = re.compile(
    r"TO_CHAR\(\s*SYSDATE\s*,\s*'YYYY'\s*\)"
    r"\s*-\s*"
    r"TO_CHAR\(\s*([^,()]+?)\s*,\s*'YYYY'\s*\)",
    re.I)

SYSDATE_RE = re.compile(r'\bSYSDATE\b', re.I)


def patch(text):
    n_age = n_sys = 0

    def age_sub(m):
        nonlocal n_age
        n_age += 1
        col = m.group(1).strip()
        return (f"EXTRACT(YEAR FROM CURRENT_DATE) "
                f"- EXTRACT(YEAR FROM {col})")

    text = AGE_RE.sub(age_sub, text)
    text, n_sys = SYSDATE_RE.subn('CURRENT_TIMESTAMP', text)
    return text, n_age, n_sys


def main():
    total_age = total_sys = 0
    for d in TARGET_DIRS:
        base = os.path.join(ROOT, d)
        if not os.path.isdir(base):
            continue
        for dirpath, _, files in os.walk(base):
            for fn in files:
                if not fn.endswith('.js'):
                    continue
                path = os.path.join(dirpath, fn)
                with open(path, encoding='utf-8', errors='replace',
                          newline='') as f:
                    src = f.read()
                out, n_age, n_sys = patch(src)
                if n_age or n_sys:
                    rel = os.path.relpath(path, ROOT)
                    print(f"  {rel:<32} age-expr={n_age}  sysdate={n_sys}")
                    total_age += n_age
                    total_sys += n_sys
                    if not DRY:
                        with open(path, 'w', encoding='utf-8',
                                  newline='') as f:
                            f.write(out)
    mode = 'would patch' if DRY else 'patched'
    print(f"\n{mode}: {total_age} age expressions, "
          f"{total_sys} SYSDATE references")


if __name__ == '__main__':
    main()
