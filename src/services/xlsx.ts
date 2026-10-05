/**
 * A minimal .xlsx reader: turns the first worksheet into tab-separated text, one
 * line per row, so text parsers (e.g. `parseBspBulletin`) can read uploaded
 * spreadsheets the same way they read pasted ones. No dependency — the file is
 * unzipped with the browser's DecompressionStream.
 *
 * Numbers are written in plain decimal form (no exponents); cells formatted as
 * dates are written as "05 October 2026".
 */

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Built-in Excel number formats that are dates. */
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

export async function readXlsxText(file: Blob): Promise<string> {
  const zip = await unzip(await file.arrayBuffer());
  const text = async (path: string) => {
    const bytes = zip.get(path);
    return bytes ? new TextDecoder().decode(await bytes()) : undefined;
  };

  const sheetPath = (await firstSheetPath(text)) ?? [...zip.keys()].find((p) => /^xl\/worksheets\/sheet\d*\.xml$/.test(p));
  const sheet = sheetPath ? await text(sheetPath) : undefined;
  if (!sheet) throw new Error('No worksheet found — is this an .xlsx file?');

  const strings = sharedStrings((await text('xl/sharedStrings.xml')) ?? '');
  const dateStyles = dateStyleIndexes((await text('xl/styles.xml')) ?? '');

  const lines: string[] = [];
  for (const [, row] of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const [, attrs, body = ''] of row.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(attrs, 'r');
      const col = ref ? columnIndex(ref) : cells.length;
      const type = attr(attrs, 't');
      const style = Number(attr(attrs, 's') ?? 0);
      const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = '';
      if (type === 's' && raw != null) value = strings[Number(raw)] ?? '';
      else if (type === 'inlineStr') value = textRuns(body);
      else if (type === 'str' || type === 'e') value = decode(raw ?? '');
      else if (raw != null) value = dateStyles.has(style) ? serialToDate(Number(raw)) : plainNumber(Number(raw));
      while (cells.length < col) cells.push('');
      cells[col] = value.replace(/[\t\r\n]+/g, ' ').trim();
    }
    lines.push(cells.join('\t'));
  }
  return lines.join('\n');
}

/** The first sheet in workbook order, via the workbook's relationships. */
async function firstSheetPath(text: (path: string) => Promise<string | undefined>) {
  const workbook = await text('xl/workbook.xml');
  const rels = await text('xl/_rels/workbook.xml.rels');
  const id = workbook?.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  if (!id || !rels) return undefined;
  const rel = [...rels.matchAll(/<Relationship\b([^>]*)\/?>/g)].map((m) => m[1]).find((a) => attr(a, 'Id') === id);
  const target = rel ? attr(rel, 'Target') : undefined;
  if (!target) return undefined;
  return target.startsWith('/') ? target.slice(1) : `xl/${target}`;
}

function sharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textRuns(m[1]));
}

/** All <t> runs in a string item, joined (rich text splits a string into runs). */
function textRuns(xml: string): string {
  return [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join('');
}

/** Indexes into cellXfs whose number format is a date. */
function dateStyleIndexes(xml: string): Set<number> {
  const custom = new Map<number, string>();
  for (const [, attrs] of xml.matchAll(/<numFmt\b([^>]*)\/?>/g)) {
    custom.set(Number(attr(attrs, 'numFmtId')), decode(attr(attrs, 'formatCode') ?? ''));
  }
  const isDate = (id: number) => {
    if (BUILTIN_DATE_FORMATS.has(id)) return true;
    const code = custom.get(id);
    // Drop quoted literals and [colour]/[locale] tags before looking for d/m/y.
    return code ? /[dmy]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]/g, '')) : false;
  };
  const xfs = xml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? '';
  const result = new Set<number>();
  [...xfs.matchAll(/<xf\b([^>]*)>/g)].forEach(([, attrs], i) => {
    if (isDate(Number(attr(attrs, 'numFmtId') ?? 0))) result.add(i);
  });
  return result;
}

/** Excel's 1900 date system: serial 1 is 1900-01-01, with the 1900 leap-year bug. */
function serialToDate(serial: number): string {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000);
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** 3.5E-3 → "0.0035"; float noise is trimmed to 10 significant digits. */
function plainNumber(n: number): string {
  if (!Number.isFinite(n)) return '';
  return Number(n.toPrecision(10)).toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 });
}

function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? 'A') n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

function attr(attrs: string, name: string): string | undefined {
  return attrs.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1];
}

function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Zip entries by path; each is read lazily. Stored and deflated entries only. */
async function unzip(buf: ArrayBuffer): Promise<Map<string, () => Promise<Uint8Array>>> {
  const view = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not an .xlsx file (no zip directory found).');

  const entries = new Map<string, () => Promise<Uint8Array>>();
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const local = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(buf, p + 46, nameLen));
    p += 46 + nameLen + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);

    entries.set(name, async () => {
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const data = new Uint8Array(buf, start, size);
      if (method === 0) return data;
      if (method !== 8) throw new Error(`Unsupported compression in ${name}.`);
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    });
  }
  return entries;
}
