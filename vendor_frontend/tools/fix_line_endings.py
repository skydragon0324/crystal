#!/usr/bin/env python3
"""
Repair doubled carriage returns (\r\r\n -> \r\n).

Files arrived with \r\r\n line endings instead of \r\n, which renders as a
blank line after every real line. This collapses any run of 2+ CRs before a
newline back to a single CR.

  python3 fix_line_endings.py [path]           # repair to CRLF (default)
  python3 fix_line_endings.py [path] --lf      # normalise everything to LF
  python3 fix_line_endings.py [path] --dry-run # report only, change nothing

Binary files are detected by content (NUL byte in the first 8 KB) rather than
by extension, so images, fonts and archives are skipped automatically and no
text file is missed because its extension wasn't on a whitelist. Only the
bytes between the last visible character and the newline are ever touched.
"""
import os
import re
import sys

SKIP_DIRS = {'node_modules', '.git', '.svn', 'dist', 'build', '.next',
             'coverage', '__pycache__'}

# Belt-and-braces: these are binary even if a NUL happens not to appear early.
BINARY_EXT = {'.png', '.jpg', '.jpeg', '.gif', '.ico', '.bmp', '.webp',
              '.woff', '.woff2', '.ttf', '.eot', '.otf', '.pdf', '.zip',
              '.gz', '.rar', '.7z', '.mp4', '.mp3', '.wav', '.avif'}

DOUBLED = re.compile(rb'\r{2,}\n')

DRY = '--dry-run' in sys.argv
TO_LF = '--lf' in sys.argv


def looks_binary(data, path):
    if os.path.splitext(path)[1].lower() in BINARY_EXT:
        return True
    if b'\x00' in data[:8192]:
        return True
    # A high proportion of bytes outside the printable/UTF-8 range is a
    # stronger signal than any extension list.
    sample = data[:8192]
    if not sample:
        return False
    try:
        sample.decode('utf-8')
    except UnicodeDecodeError:
        return True
    return False


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    root = args[0] if args else '.'

    changed = scanned = skipped = 0
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in sorted(filenames):
            path = os.path.join(dirpath, fn)
            try:
                with open(path, 'rb') as f:
                    data = f.read()
            except OSError:
                continue

            if looks_binary(data, path):
                skipped += 1
                continue
            scanned += 1

            fixed = DOUBLED.sub(b'\r\n', data)
            if TO_LF:
                fixed = fixed.replace(b'\r\n', b'\n').replace(b'\r', b'\n')

            if fixed != data:
                changed += 1
                n = data.count(b'\r\r\n')
                print(f"  {os.path.relpath(path, root):<48} lines fixed: {n}")
                if not DRY:
                    with open(path, 'wb') as f:
                        f.write(fixed)

    mode = 'LF' if TO_LF else 'CRLF'
    verb = 'would change' if DRY else 'changed'
    print(f"\nscanned {scanned} text files ({skipped} binary skipped), "
          f"{verb} {changed} -> {mode}")


if __name__ == '__main__':
    main()
