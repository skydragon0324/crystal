'use strict';

/**
 * WORD COPIES OF THE CRM DOCS: docs/crm-logic.md and docs/crm-database.md
 * as .docx files with real tables, headings for the navigation pane and a
 * header row repeated on every page.
 *
 *   node scripts/crm-docs-word.js             (both, from the .md files as they are)
 *   npm run crm:docs                          (regenerates crm-database.md first, then both)
 *
 * The markdown is the source; this reads only the subset the two files use:
 * #-headings, paragraphs, "-" and "1." lists (nested by two spaces), pipe
 * tables, "> " notes, and inline `code`, **bold**, _italic_, [links](...) and
 * <br> inside table cells.
 */
const fs = require('fs');
const path = require('path');
const {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, LevelFormat, Packer, PageNumber, PageOrientation,
  Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType
} = require('docx');

const DOCS = path.join(__dirname, '..', 'docs');
const FONT = 'Calibri';
const MONO = 'Consolas';
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'BFC5CE' };
const HEADER_FILL = 'E8ECF2';

/* A4, 2 cm margins. Widths in DXA (1440 per inch). */
const A4 = { width: 11906, height: 16838 };
const MARGIN = 1134;

/* ------------------------------------------------------------ inline text */

/** `code`, **bold**, _italic_ and [text](link) as runs; links keep their text only. */
function runs(text, base) {
  const style = base || {};
  const out = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|(?:^|(?<=[\s(]))_[^_]+_(?=$|[\s).,;:])|\[[^\]]+\]\([^)]*\))/g;
  let last = 0;
  let match;
  const plain = function (value) { if (value) out.push(new TextRun(Object.assign({ text: value, font: FONT }, style))); };
  while ((match = pattern.exec(text)) !== null) {
    plain(text.slice(last, match.index));
    const token = match[0];
    if (token[0] === '`') {
      out.push(new TextRun(Object.assign({}, style, { text: token.slice(1, -1), font: MONO, size: style.size ? style.size - 1 : 19 })));
    } else if (token.startsWith('**')) {
      runs(token.slice(2, -2), Object.assign({}, style, { bold: true })).forEach(function (run) { out.push(run); });
    } else if (token[0] === '_') {
      runs(token.slice(1, -1), Object.assign({}, style, { italics: true })).forEach(function (run) { out.push(run); });
    } else {
      runs(token.slice(1, token.indexOf('](')), Object.assign({}, style, { color: '1F5FAD' })).forEach(function (run) { out.push(run); });
    }
    last = match.index + token.length;
  }
  plain(text.slice(last));
  return out;
}

/* ------------------------------------------------------------ tables */

function splitRow(line) {
  const cells = [];
  let current = '';
  let code = false;
  const body = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === '\\' && body[i + 1] === '|') { current += '|'; i += 1; continue; }
    if (ch === '`') code = !code;
    if (ch === '|' && !code) { cells.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

/** Column widths from how much each column holds: long text gets room, short codes do not. */
function widths(rows, total) {
  const count = rows[0].length;
  const weight = [];
  for (let col = 0; col < count; col += 1) {
    const lengths = rows.map(function (row) {
      return String(row[col] || '').split('<br>').reduce(function (most, part) {
        return Math.max(most, part.replace(/[`*]/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').length);
      }, 0);
    });
    const average = lengths.reduce(function (sum, value) { return sum + value; }, 0) / lengths.length;
    const longest = Math.max.apply(null, lengths);
    weight.push(Math.max(4, Math.min(Math.max(average * 1.4, Math.min(longest, 26)), 90)));
  }
  const sum = weight.reduce(function (a, b) { return a + b; }, 0);
  const out = weight.map(function (value) { return Math.floor((value / sum) * total); });
  out[out.length - 1] += total - out.reduce(function (a, b) { return a + b; }, 0);
  return out;
}

function table(lines, total) {
  const header = splitRow(lines[0]);
  const align = splitRow(lines[1]).map(function (spec) {
    return /^:-+:$/.test(spec) ? AlignmentType.CENTER : /-+:$/.test(spec) ? AlignmentType.RIGHT : AlignmentType.LEFT;
  });
  const body = lines.slice(2).map(splitRow);
  const columns = widths([header].concat(body), total);
  const cellOf = function (text, index, isHeader) {
    const parts = String(text || '').split(/<br\s*\/?>/);
    return new TableCell({
      width: { size: columns[index], type: WidthType.DXA },
      borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
      shading: isHeader ? { fill: HEADER_FILL, type: ShadingType.CLEAR, color: 'auto' } : undefined,
      margins: { top: 40, bottom: 40, left: 80, right: 80 },
      children: parts.map(function (part) {
        return new Paragraph({ alignment: align[index], spacing: { before: 0, after: 0 },
          children: runs(part, Object.assign({ size: 18 }, isHeader ? { bold: true } : {})) });
      })
    });
  };
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: columns,
    rows: [new TableRow({ tableHeader: true, children: header.map(function (text, index) { return cellOf(text, index, true); }) })]
      .concat(body.map(function (row) {
        return new TableRow({ cantSplit: true, children: header.map(function (unused, index) { return cellOf(row[index], index, false); }) });
      }))
  });
}

/* ------------------------------------------------------------ blocks */

const HEADINGS = [HeadingLevel.TITLE, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];

function blocks(markdown, total) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  const spacer = function () { out.push(new Paragraph({ spacing: { before: 0, after: 60 }, children: [] })); };
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      out.push(new Paragraph({ heading: HEADINGS[heading[1].length], keepNext: true, children: runs(heading[2]) }));
      i += 1;
      continue;
    }

    if (/^\s*\|/.test(line) && lines[i + 1] && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(lines[i]); i += 1; }
      out.push(table(rows, total));
      spacer();
      continue;
    }

    if (/^>\s?/.test(line)) {
      const note = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { note.push(lines[i].replace(/^>\s?/, '')); i += 1; }
      out.push(new Paragraph({
        border: { left: { style: BorderStyle.SINGLE, size: 18, color: '9AA5B4', space: 8 } },
        indent: { left: 200 }, spacing: { after: 120 },
        children: runs(note.join(' '), { color: '4A5568', italics: true })
      }));
      continue;
    }

    const item = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
    if (item) {
      // A list item runs on over indented lines that are not items themselves.
      let text = item[3];
      i += 1;
      while (i < lines.length && lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s+/.test(lines[i]) && !/^\s*\|/.test(lines[i])) {
        text += ' ' + lines[i].trim();
        i += 1;
      }
      const level = Math.min(2, Math.floor(item[1].length / 2));
      out.push(new Paragraph({
        numbering: { reference: /\d/.test(item[2]) ? 'numbers' : 'bullets', level: level },
        spacing: { after: 40 }, children: runs(text)
      }));
      // An indented table under a list item belongs to it; it is drawn after the item.
      continue;
    }

    const paragraph = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*\||>|\s*([-*]|\d+\.)\s)/.test(lines[i])) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    out.push(new Paragraph({ spacing: { after: 120 }, children: runs(paragraph.join(' ')) }));
  }
  return out;
}

/* ------------------------------------------------------------ the document */

async function convert(source, target, options) {
  const opts = options || {};
  const landscape = !!opts.landscape;
  const pageWidth = landscape ? A4.height : A4.width;
  const total = pageWidth - 2 * MARGIN;
  const markdown = fs.readFileSync(source, 'utf8');
  const title = (markdown.match(/^#\s+(.*)$/m) || [])[1] || path.basename(source);

  const bulletLevels = [0, 1, 2].map(function (level) {
    return { level: level, format: LevelFormat.BULLET, text: ['•', '◦', '▪'][level], alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 360 * (level + 1), hanging: 260 } } } };
  });
  const numberLevels = [0, 1, 2].map(function (level) {
    return { level: level, format: LevelFormat.DECIMAL, text: '%' + (level + 1) + '.', alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 360 * (level + 1), hanging: 300 } } } };
  });

  const doc = new Document({
    title: title,
    creator: 'Crystal CRM',
    styles: {
      default: { document: { run: { font: FONT, size: 20 } } },
      paragraphStyles: [
        { id: 'Title', name: 'Title', basedOn: 'Normal', run: { size: 40, bold: true, color: '1A2B48' }, paragraph: { spacing: { after: 200 } } },
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 30, bold: true, color: '1A2B48' }, paragraph: { spacing: { before: 360, after: 140 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 25, bold: true, color: '1F5FAD' }, paragraph: { spacing: { before: 280, after: 100 }, outlineLevel: 1 } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 22, bold: true, color: '2D3748' }, paragraph: { spacing: { before: 220, after: 80 }, outlineLevel: 2 } }
      ]
    },
    numbering: { config: [{ reference: 'bullets', levels: bulletLevels }, { reference: 'numbers', levels: numberLevels }] },
    sections: [{
      properties: {
        page: {
          size: Object.assign({}, A4, landscape ? { orientation: PageOrientation.LANDSCAPE } : {}),
          margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN }
        }
      },
      footers: {
        default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [
          new TextRun({ text: title + '  ·  page ', font: FONT, size: 16, color: '718096' }),
          new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: '718096' })
        ] })] })
      },
      children: blocks(markdown, total)
    }]
  });
  fs.writeFileSync(target, await Packer.toBuffer(doc));
}

module.exports = { convert: convert };

if (require.main === module) {
  (async function () {
    await convert(path.join(DOCS, 'crm-logic.md'), path.join(DOCS, 'crm-logic.docx'));
    console.log('written: docs/crm-logic.docx');
    await convert(path.join(DOCS, 'crm-database.md'), path.join(DOCS, 'crm-database.docx'), { landscape: true });
    console.log('written: docs/crm-database.docx');
  }()).catch(function (err) { console.error(err); process.exitCode = 1; });
}
