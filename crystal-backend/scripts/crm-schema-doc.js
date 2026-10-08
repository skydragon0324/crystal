'use strict';

/**
 * WRITES docs/crm-database.md - every CRM table and every one of its fields -
 * and its Word copy docs/crm-database.docx (through crm-docs-word.js).
 *
 *   node scripts/crm-schema-doc.js            (needs the development database)
 *   node scripts/crm-schema-doc.js --dump     (structure as JSON, for writing descriptions)
 *
 * The structure is not parsed out of sql/schema.sql: the file is run into a
 * throwaway schema and the database's own catalog is read back - types,
 * required, defaults, keys, the values each CHECK allows, comments - so the
 * document cannot disagree with what PostgreSQL builds. The schema is dropped
 * either way. What a field MEANS comes from scripts/crm-schema-doc.fields.js,
 * and where a table is USED from the code that names it.
 */
const fs = require('fs');
const path = require('path');
const db = require('../src/config/db');

const ROOT = path.join(__dirname, '..');
const SCHEMA = 'crm_doc_build';
const OUT = path.join(ROOT, 'docs', 'crm-database.md');

async function build() {
  await db.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [SCHEMA]);
  await db.raw('CREATE SCHEMA ??', [SCHEMA]);
  await db.raw('SET search_path TO ??, public', [SCHEMA]);
  await db.raw(fs.readFileSync(path.join(ROOT, 'sql', 'schema.sql'), 'utf8'));
}

/** The values a single-column CHECK (... IN (...)) allows, keyed by column. */
function allowedValues(definitions) {
  const byColumn = {};
  definitions.forEach(function (definition) {
    // Only a column's own list; a rule that combines conditions lists a subset.
    if (/\b(AND|OR)\b/.test(definition)) return;
    const column = (definition.match(/^CHECK \(+\(?([a-z_0-9]+)\)?(?:::text)? = ANY/) || [])[1];
    if (!column) return;
    const list = (definition.match(/ARRAY\[(.*?)\]/) || [])[1] || '';
    const values = list.split(',').map(function (item) {
      return item.replace(/::[a-z ]+(\[\])?/g, '').replace(/[()'\s]/g, '');
    }).filter(Boolean);
    if (values.length) byColumn[column] = values;
  });
  return byColumn;
}

async function introspect() {
  const tables = (await db.raw(
    `SELECT c.relname AS name, c.relkind AS kind, obj_description(c.oid, 'pg_class') AS comment
       FROM pg_class c WHERE c.relnamespace = ?::regnamespace AND c.relkind IN ('r','v') AND c.relname ~ '^(crm_|v_crm_)'
      ORDER BY c.relname`, [SCHEMA])).rows;
  const columns = (await db.raw(
    `SELECT c.table_name, c.column_name, c.ordinal_position, c.is_nullable, c.column_default, c.is_identity,
            format_type(a.atttypid, a.atttypmod) AS type, col_description(a.attrelid, a.attnum) AS comment
       FROM information_schema.columns c
       JOIN pg_attribute a ON a.attrelid = (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass AND a.attname = c.column_name
      WHERE c.table_schema = ? AND c.table_name ~ '^(crm_|v_crm_)'
      ORDER BY c.table_name, c.ordinal_position`, [SCHEMA])).rows;
  const constraints = (await db.raw(
    `SELECT conrelid::regclass::text AS table_name, conname, contype, pg_get_constraintdef(oid) AS definition,
            array_to_string(ARRAY(SELECT attname FROM pg_attribute WHERE attrelid = conrelid AND attnum = ANY(conkey) ORDER BY attnum), ',') AS columns,
            confrelid::regclass::text AS target
       FROM pg_constraint WHERE connamespace = ?::regnamespace AND contype IN ('p','f','u','c')`, [SCHEMA])).rows;
  const indexes = (await db.raw(
    `SELECT tablename AS table_name, indexdef FROM pg_indexes WHERE schemaname = ? AND indexdef LIKE 'CREATE UNIQUE%'`, [SCHEMA])).rows;

  const strip = function (text) { return String(text || '').split(SCHEMA + '.').join(''); };
  constraints.forEach(function (row) { row.columns = row.columns ? row.columns.split(',') : []; });
  return tables.map(function (table) {
    const own = constraints.filter(function (row) { return strip(row.table_name) === table.name; });
    const checks = own.filter(function (row) { return row.contype === 'c'; }).map(function (row) { return row.definition; });
    const allowed = allowedValues(checks);
    const primary = (own.filter(function (row) { return row.contype === 'p'; })[0] || {}).columns || [];
    const foreign = {};
    own.filter(function (row) { return row.contype === 'f' && row.columns.length === 1; }).forEach(function (row) {
      foreign[row.columns[0]] = strip(row.target) + '.' + (row.definition.match(/REFERENCES [^(]+\(([^)]+)\)/) || [])[1]
        + (/ON DELETE CASCADE/.test(row.definition) ? ' (cascade delete)' : /ON DELETE SET NULL/.test(row.definition) ? ' (set null on delete)' : '');
    });
    const unique = own.filter(function (row) { return row.contype === 'u'; }).map(function (row) { return row.columns; })
      .concat(indexes.filter(function (row) { return row.table_name === table.name && !/_pkey /.test(row.indexdef); })
        .map(function (row) {
          const cols = (row.indexdef.match(/\(([^)]*)\)/) || [])[1] || '';
          return cols.split(',').map(function (c) { return c.trim(); }).concat(/ WHERE /.test(row.indexdef) ? ['(partial: ' + row.indexdef.split(' WHERE ')[1] + ')'] : []);
        }));
    return {
      name: table.name,
      kind: table.kind === 'v' ? 'view' : 'table',
      comment: table.comment,
      primary: primary,
      unique: unique.filter(function (cols, index, all) { return all.findIndex(function (other) { return other.join() === cols.join(); }) === index; }),
      checks: checks.filter(function (definition) { return !/= ANY/.test(definition) || /\b(AND|OR)\b/.test(definition); }).map(function (definition) {
        // Readable rules: drop the casts PostgreSQL adds when it prints a constraint.
        return strip(definition).replace(/::(character varying|[a-z]+)(\(\d+\))?(\[\])?/g, '')
          .replace(/ = ANY \(\(ARRAY\[([^\]]*)\]\)\)/g, ' IN ($1)').replace(/ = ANY \(ARRAY\[([^\]]*)\]\)/g, ' IN ($1)');
      }),
      columns: columns.filter(function (row) { return row.table_name === table.name; }).map(function (row) {
        return {
          name: row.column_name,
          type: row.type,
          required: row.is_nullable === 'NO',
          default: row.is_identity === 'YES' ? 'identity' : row.column_default ? strip(row.column_default).replace(/::[a-z ]+(\[\])?/g, '') : null,
          references: foreign[row.column_name] || null,
          allowed: allowed[row.column_name] || null,
          comment: row.comment
        };
      })
    };
  });
}

/* ------------------------------------------------------------ where each table is used */

function filesUnder(dir, pattern) {
  const out = [];
  (function walk(current) {
    fs.readdirSync(current, { withFileTypes: true }).forEach(function (entry) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'node_modules' && entry.name !== 'tests') walk(full); } else if (pattern.test(entry.name)) out.push(full);
    });
  })(dir);
  return out;
}

function usage(tableNames) {
  const sources = filesUnder(path.join(ROOT, 'src'), /\.js$/)
    .filter(function (file) { return !/[\\/]db[\\/]migrations[\\/]/.test(file); })
    .concat(filesUnder(path.join(ROOT, 'scripts'), /^(demo-crm|check-crm|crm-[a-z-]+)\.js$/));
  const texts = sources.map(function (file) { return { file: path.relative(path.join(ROOT, '..'), file).split(path.sep).join('/'), text: fs.readFileSync(file, 'utf8') }; });
  const used = {};
  tableNames.forEach(function (name) {
    const re = new RegExp("['\"` ]" + name + "(?![a-z_])");
    used[name] = texts.filter(function (source) { return re.test(source.text); }).map(function (source) { return source.file; });
  });
  return used;
}

/* ------------------------------------------------------------ the document */

function cell(text) { return String(text == null ? '' : text).replace(/\|/g, '\\|').replace(/\r?\n/g, ' '); }

/* The anchor GitHub and VS Code give a heading. */
function anchor(heading) { return heading.toLowerCase().replace(/[^a-z0-9 _-]/g, '').replace(/ /g, '-'); }

/* PostgreSQL's long type names, in the short form schema.sql is written in. */
function shortType(type) {
  return String(type)
    .replace(/^character varying/, 'varchar').replace(/^character\b/, 'char')
    .replace(/^timestamp with time zone$/, 'timestamptz').replace(/^timestamp without time zone$/, 'timestamp')
    .replace(/^integer$/, 'int').replace(/^boolean$/, 'bool').replace(/^double precision$/, 'float8');
}

/* Where a table is used: file names grouped by folder, short enough for a table cell. */
function codeList(files) {
  if (!files.length) return 'none outside the schema';
  const byFolder = {};
  files.forEach(function (file) {
    const parts = file.split('/');
    const folder = parts.slice(1, -1).join('/');
    (byFolder[folder] = byFolder[folder] || []).push(parts[parts.length - 1].replace(/\.js$/, ''));
  });
  return Object.keys(byFolder).sort().map(function (folder) { return '`' + folder + '/`: ' + byFolder[folder].join(', '); }).join('<br>');
}

function render(tables, used, fields) {
  const lines = [];
  const push = function (line) { lines.push(line === undefined ? '' : line); };
  push('# CRM database reference');
  push();
  push('Every CRM table and view, field by field. Business rules and screens are explained in [crm-logic.md](crm-logic.md).');
  push();
  push('> Generated by `npm run crm:docs` (`scripts/crm-schema-doc.js`) from `sql/schema.sql`, built into a throwaway');
  push('> schema and read back from the PostgreSQL catalog. Do not edit by hand: change the schema or');
  push('> `scripts/crm-schema-doc.fields.js` and regenerate. A Word copy with the same tables is written beside it');
  push('> (`crm-database.docx`).');
  push();
  push('## Conventions');
  push();
  push('| Topic | Rule |');
  push('|---|---|');
  fields.conventions.forEach(function (pair) { push('| **' + pair[0] + '** | ' + cell(pair[1]) + ' |'); });
  push();
  push('In the field tables, **Req.** means NOT NULL, **(PK)** marks the primary key, and **Links to / allowed values**');
  push("shows the foreign key (→) and the values the column's CHECK constraint allows.");
  push();

  const grouped = new Set([].concat.apply([], fields.groups.map(function (group) { return group.tables; })));
  const ungrouped = tables.filter(function (table) { return !grouped.has(table.name); }).map(function (table) { return table.name; });
  if (ungrouped.length) throw new Error('tables missing from a group: ' + ungrouped.join(', '));

  push('## Contents');
  push();
  push('| # | Area | What it holds | Tables |');
  push('|---:|---|---|---:|');
  fields.groups.forEach(function (group, index) {
    push('| ' + (index + 1) + ' | [' + group.title + '](#' + anchor((index + 1) + '. ' + group.title) + ') | ' + cell(group.intro || '') + ' | ' + group.tables.length + ' |');
  });
  push();

  const missing = [];
  fields.groups.forEach(function (group, index) {
    push('## ' + (index + 1) + '. ' + group.title);
    push();
    if (group.intro) { push(group.intro); push(); }
    push('| Table | Kind | Purpose |');
    push('|---|---|---|');
    group.tables.forEach(function (name) {
      const table = tables.filter(function (row) { return row.name === name; })[0];
      if (!table) throw new Error('grouped table not in the schema: ' + name);
      const doc = fields.tables[name] || {};
      push('| [' + name + '](#' + name + ') | ' + table.kind + ' | ' + cell(doc.purpose || table.comment || '') + ' |');
    });
    push();

    group.tables.forEach(function (name) {
      const table = tables.filter(function (row) { return row.name === name; })[0];
      const doc = fields.tables[name] || {};
      push('### ' + name);
      push();
      push(doc.purpose || table.comment || '');
      push();
      const facts = [];
      if (doc.purpose && table.comment && doc.purpose !== table.comment) facts.push(['Schema comment', cell(table.comment)]);
      if (doc.usedBy) facts.push(['Used by', cell(doc.usedBy)]);
      if (table.primary.length) facts.push(['Primary key', '`' + table.primary.join('`, `') + '`']);
      if (table.unique.length) facts.push(['Unique', table.unique.map(function (cols) { return cell('(' + cols.join(', ') + ')'); }).join('<br>')]);
      if (table.checks.length) facts.push(['Rules', table.checks.map(function (check) { return '`' + cell(check) + '`'; }).join('<br>')]);
      facts.push(['Code', codeList(used[name] || [])]);
      push('| About | |');
      push('|---|---|');
      facts.forEach(function (fact) { push('| **' + fact[0] + '** | ' + fact[1] + ' |'); });
      push();
      push('| Field | Type | Req. | Default | Links to / allowed values | Meaning |');
      push('|---|---|:---:|---|---|---|');
      table.columns.forEach(function (column) {
        const meaning = (doc.fields && doc.fields[column.name]) || column.comment || fields.common[column.name];
        if (!meaning) missing.push(name + '.' + column.name);
        const refs = [column.references ? '→ `' + column.references + '`' : null,
          column.allowed ? column.allowed.map(function (value) { return '`' + value + '`'; }).join(', ') : null].filter(Boolean).join('<br>');
        const key = table.primary.indexOf(column.name) !== -1 ? ' (PK)' : '';
        push('| `' + column.name + '`' + key + ' | ' + cell(shortType(column.type)) + ' | ' + (column.required ? 'yes' : '') + ' | '
          + (column.default ? '`' + cell(column.default) + '`' : '') + ' | ' + refs + ' | ' + cell(meaning || '') + ' |');
      });
      push();
    });
  });
  return { text: lines.join('\n'), missing: missing };
}

async function main() {
  await build();
  const tables = await introspect();
  await db.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [SCHEMA]);
  if (process.argv.indexOf('--dump') !== -1) {
    process.stdout.write(JSON.stringify(tables.map(function (table) {
      return { name: table.name, comment: table.comment, columns: table.columns.map(function (column) {
        return [column.name, column.type, column.references || '', (column.allowed || []).join('/'), column.comment || ''].join(' | ');
      }) };
    }), null, 1));
    return;
  }
  const fields = require('./crm-schema-doc.fields');
  const result = render(tables, usage(tables.map(function (table) { return table.name; })), fields);
  if (result.missing.length) {
    console.error(result.missing.length + ' fields have no description:\n  ' + result.missing.join('\n  '));
    process.exitCode = 1;
    return;
  }
  fs.writeFileSync(OUT, result.text + '\n');
  console.log('written: ' + OUT + ' (' + tables.length + ' tables and views)');
  /* The Word copy: the same document with real tables, for reading outside an editor. */
  const word = OUT.replace(/\.md$/, '.docx');
  await require('./crm-docs-word').convert(OUT, word, { landscape: true });
  console.log('written: ' + word);
}

main().catch(function (err) { console.error(err.message); process.exitCode = 1; })
  .finally(async function () {
    try { await db.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [SCHEMA]); } catch (e) { /* best effort */ }
    await db.destroy();
  });
