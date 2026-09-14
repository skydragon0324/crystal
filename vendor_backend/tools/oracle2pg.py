#!/usr/bin/env python3
"""
Oracle -> PostgreSQL schema converter for the vendor_backend project.

Usage:  python3 tools/oracle2pg.py sql sql_pg

Handles the patterns actually present in this schema:
  * CREATE SEQUENCE  ... NOCACHE            -> PG-legal CREATE SEQUENCE
  * VARCHAR2 / NUMBER / DATE / CLOB / NCLOB -> PG types
  * Oracle "BEFORE INSERT ... :NEW.pk := seq.NEXTVAL" triggers
                                            -> column DEFAULT nextval(...)
  * COMMENT ON COLUMN "T"."C"               -> unquoted (lower-case) form
  * SYSDATE, `/` terminators, quoted UPPER identifiers

Triggers that are NOT the plain PK-assign pattern are left out of the output
and written to _MANUAL_REVIEW.sql instead - they need real plpgsql.
"""
import os
import re
import sys

# ---------------------------------------------------------------- datatypes

def convert_types(sql: str) -> str:
    # VARCHAR2(n CHAR|BYTE) / NVARCHAR2(n) -> VARCHAR(n)
    sql = re.sub(r'\bN?VARCHAR2\s*\(\s*(\d+)\s*(?:CHAR|BYTE)?\s*\)',
                 r'VARCHAR(\1)', sql, flags=re.I)
    sql = re.sub(r'\bN?VARCHAR2\b', 'VARCHAR', sql, flags=re.I)

    # NUMBER(p,s) -> NUMERIC(p,s)
    sql = re.sub(r'\bNUMBER\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)',
                 r'NUMERIC(\1,\2)', sql, flags=re.I)

    # NUMBER(p) -> smallest integer type that fits
    def num_p(m):
        p = int(m.group(1))
        if p <= 4:
            return 'SMALLINT'
        if p <= 9:
            return 'INTEGER'
        if p <= 18:
            return 'BIGINT'
        return f'NUMERIC({p})'
    sql = re.sub(r'\bNUMBER\s*\(\s*(\d+)\s*\)', num_p, sql, flags=re.I)

    # bare NUMBER -> BIGINT (these are PKs / FKs / counters in this schema)
    sql = re.sub(r'\bNUMBER\b(?!\s*\()', 'BIGINT', sql, flags=re.I)

    # Oracle DATE carries a time component -> TIMESTAMP, never PG DATE
    sql = re.sub(r'\bDATE\b(?=\s*(DEFAULT|NOT\s+NULL|NULL|,|\)|$))',
                 'TIMESTAMP', sql, flags=re.I)

    sql = re.sub(r'\bN?CLOB\b', 'TEXT', sql, flags=re.I)
    sql = re.sub(r'\bBLOB\b', 'BYTEA', sql, flags=re.I)
    sql = re.sub(r'\bRAW\s*\(\s*\d+\s*\)', 'BYTEA', sql, flags=re.I)
    sql = re.sub(r'\bSYSDATE\b', 'CURRENT_TIMESTAMP', sql, flags=re.I)
    return sql


# ---------------------------------------------------------------- sequences

SEQ_RE = re.compile(
    r'CREATE\s+SEQUENCE\s+"?(\w+)"?(.*?);',
    re.I | re.S)

PG_BIGINT_MAX = 9223372036854775807


def convert_sequences(sql: str) -> str:
    def repl(m):
        name = m.group(1).lower()
        body = m.group(2)
        start = re.search(r'START\s+WITH\s+(\d+)', body, re.I)
        inc = re.search(r'INCREMENT\s+BY\s+(\d+)', body, re.I)
        minv = re.search(r'MINVALUE\s+(\d+)', body, re.I)
        parts = [f'CREATE SEQUENCE IF NOT EXISTS {name}']
        parts.append(f'INCREMENT BY {inc.group(1) if inc else 1}')
        parts.append(f'MINVALUE {minv.group(1) if minv else 1}')
        parts.append(f'MAXVALUE {PG_BIGINT_MAX}')          # Oracle max > int8
        parts.append(f'START WITH {start.group(1) if start else 1}')
        return ' '.join(parts) + ';'
    return SEQ_RE.sub(repl, sql)


# ---------------------------------------------------------------- triggers

# Oracle statement blocks are terminated by a lone "/" on its own line.
TRIGGER_BLOCK_RE = re.compile(
    r'CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\b.*?(?:\n\s*/\s*(?:\n|$))',
    re.I | re.S)

# the auto-increment pattern used ~118 times in this schema
PK_TRIGGER_RE = re.compile(
    r'CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+"?(\w+)"?\s+'
    r'BEFORE\s+INSERT\s+ON\s+"?(\w+)"?\s+'
    r'FOR\s+EACH\s+ROW\s+'
    r'BEGIN\s+'
    r'IF\s+:NEW\.(\w+)\s+IS\s+NULL\s+THEN\s+'
    r'SELECT\s+"?(\w+)"?\.NEXTVAL\s+'
    r'INTO\s+:NEW\.\w+\s+'
    r'FROM\s+dual\s*;\s*'
    r'END\s+IF\s*;\s*'
    r'END\s*;',
    re.I | re.S)


def convert_triggers(sql: str, manual: list, source: str):
    """Replace PK triggers with sequence defaults; quarantine the rest."""
    out = []
    last = 0
    for blk in TRIGGER_BLOCK_RE.finditer(sql):
        out.append(sql[last:blk.start()])
        last = blk.end()
        body = blk.group(0)
        m = PK_TRIGGER_RE.search(body)
        if m:
            _, table, col, seq = m.groups()
            table, col, seq = table.lower(), col.lower(), seq.lower()
            out.append(
                f"ALTER TABLE {table} ALTER COLUMN {col} "
                f"SET DEFAULT nextval('{seq}');\n"
                f"ALTER SEQUENCE {seq} OWNED BY {table}.{col};\n\n")
        else:
            name = re.search(r'TRIGGER\s+"?(\w+)"?', body, re.I)
            manual.append((source, name.group(1) if name else '?', body.strip()))
            out.append(f"-- [MANUAL] trigger moved to _MANUAL_REVIEW.sql\n\n")
    out.append(sql[last:])
    return ''.join(out)


# ---------------------------------------------------------------- misc

def cleanup(sql: str) -> str:
    # COMMENT ON COLUMN "TAB"."COL" -> tab.col   (PG folds unquoted to lower)
    sql = re.sub(r'"(\w+)"\."(\w+)"',
                 lambda m: f'{m.group(1).lower()}.{m.group(2).lower()}', sql)
    # any remaining bare "UPPERCASE" identifier -> unquoted lowercase
    sql = re.sub(r'"([A-Z0-9_]+)"', lambda m: m.group(1).lower(), sql)
    # stray PL/SQL block terminators
    sql = re.sub(r'^\s*/\s*$', '', sql, flags=re.M)
    # Oracle-only storage / cache clauses
    sql = re.sub(r'\b(NOCACHE|NOORDER|NOCYCLE|ENABLE|NOVALIDATE)\b', '',
                 sql, flags=re.I)
    sql = re.sub(r'\bFROM\s+dual\b', '', sql, flags=re.I)
    sql = re.sub(r'\n{3,}', '\n\n', sql)
    return sql


def convert(sql: str, manual: list, source: str) -> str:
    sql = sql.replace('\r', '')
    sql = convert_triggers(sql, manual, source)
    sql = convert_sequences(sql)
    sql = convert_types(sql)
    sql = cleanup(sql)
    return sql


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else 'sql'
    dst = sys.argv[2] if len(sys.argv) > 2 else 'sql_pg'
    os.makedirs(dst, exist_ok=True)
    manual = []
    files = sorted(f for f in os.listdir(src) if f.endswith('.sql'))
    for fn in files:
        # newline='' keeps \r\r\n intact; universal-newline mode would turn it
        # into two \n and double-space the whole output.
        with open(os.path.join(src, fn), encoding='utf-8',
                  errors='replace', newline='') as f:
            raw = f.read()
        converted = convert(raw, manual, fn)
        header = (f"-- Converted from Oracle: {fn}\n"
                  f"-- Generated by tools/oracle2pg.py - review before running.\n\n")
        with open(os.path.join(dst, fn), 'w', encoding='utf-8') as f:
            f.write(header + converted)
        print(f"  {fn}")

    with open(os.path.join(dst, '_MANUAL_REVIEW.sql'), 'w', encoding='utf-8') as f:
        f.write("-- Triggers that are NOT the plain PK auto-increment pattern.\n"
                "-- Each needs a hand-written plpgsql function + CREATE TRIGGER.\n\n")
        for source, name, body in manual:
            f.write(f"-- ==== {source} :: {name} ====\n{body}\n\n")

    print(f"\nconverted {len(files)} files -> {dst}/")
    print(f"triggers needing manual work: {len(manual)}")
    for source, name, _ in manual:
        print(f"  - {name}  ({source})")


if __name__ == '__main__':
    main()
