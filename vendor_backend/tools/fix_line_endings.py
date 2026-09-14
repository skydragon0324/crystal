#!/usr/bin/env python3
"""
Repair doubled carriage returns.

Every source file in this project arrived with \r\r\n line endings instead
of \r\n, which shows up as a blank line after every real line. This
collapses any run of 2+ CRs before a newline back to a single CR.

  python3 tools/fix_line_endings.py            # repair to CRLF (default)
  python3 tools/fix_line_endings.py --lf       # normalise everything to LF
  python3 tools/fix_line_endings.py --dry-run  # report only, change nothing

Only the bytes between the last visible character and the newline are
touched; file content is otherwise byte-identical. Binary files and
anything under node_modules/.git are skipped.
"""
import os
import re
import sys

TEXT_EXT = {'.js', '.json', '.sql', '.md', '.txt', '.yml', '.yaml',
            '.html', '.css', '.env', '.example', '.bak', '.reference'}
TEXT_NAMES = {'.babelrc', '.gitignore', '.env', '.npmrc', '.editorconfig'}
SKIP_DIRS = {'node_modules', '.git', '.svn', 'dist', 'build'}

DRY = '--dry-run' in sys.argv
TO_LF = '--lf' in sys.argv

# 2+ CRs immediately before a LF  ->  the run is the corruption
DOUBLED = re.compile(rb'\r{2,}\n')


def is_text(path):
    name = os.path.basename(path)
    if name in TEXT_NAMES:
        return True
    return os.path.splitext(name)[1].lower() in TEXT_EXT


def looks_binary(b):
    return b'\x00' in b[:8192]


def main():
    root = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('-') else '.'
    changed = scanned = 0
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            path = os.path.join(dirpath, fn)
            if not is_text(path):
                continue
            with open(path, 'rb') as f:
                data = f.read()
            if looks_binary(data):
                continue
            scanned += 1

            fixed = DOUBLED.sub(b'\r\n', data)
            if TO_LF:
                fixed = fixed.replace(b'\r\n', b'\n').replace(b'\r', b'\n')

            if fixed != data:
                changed += 1
                before = data.count(b'\r\r\n')
                rel = os.path.relpath(path, root)
                print(f"  {rel:<44} doubled-CR lines fixed: {before}")
                if not DRY:
                    with open(path, 'wb') as f:
                        f.write(fixed)

    mode = 'LF' if TO_LF else 'CRLF'
    verb = 'would change' if DRY else 'changed'
    print(f"\nscanned {scanned} text files, {verb} {changed} -> {mode}")


if __name__ == '__main__':
    main()
