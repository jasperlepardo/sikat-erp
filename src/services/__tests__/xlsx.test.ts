/**
 * The minimal .xlsx reader: zip directory parsing (stored and deflated entries), finding the first
 * sheet, shared and inline strings, entities, plain numbers, and date-formatted cells.
 */
import { describe, expect, it } from 'vitest';
import { readXlsxText } from '../xlsx';

// ── A tiny zip writer (no CRCs: the reader doesn't check them) ───────────────

type Entry = { name: string; data: string | Uint8Array; method?: number };

async function deflate(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function zip(entries: Entry[], { badCentral = false } = {}): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const data = typeof e.data === 'string' ? enc.encode(e.data) : e.data;
    const method = e.method ?? 0;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, method, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(local.buffer), name, data);

    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, badCentral ? 0 : 0x02014b50, true);
    c.setUint16(10, method, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, data.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const centralSize = central.reduce((n, b) => n + b.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, entries.length, true);
  eocd.setUint16(10, entries.length, true);
  eocd.setUint32(12, centralSize, true);
  eocd.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, new Uint8Array(eocd.buffer)] as BlobPart[]);
}

// ── Workbook parts ──────────────────────────────────────────────────────────

const workbook = '<workbook><sheets><sheet name="Rates" sheetId="1" r:id="rId1"/></sheets></workbook>';
const rels = (target: string) =>
  `<Relationships><Relationship Id="rId9" Target="other.xml"/><Relationship Id="rId1" Type="worksheet" Target="${target}"/></Relationships>`;
const shared = '<sst><si><t>Currency</t></si><si><r><t>US </t></r><r><t xml:space="preserve">Dollar</t></r></si><si><t>R&amp;D &lt;x&gt; &quot;q&quot; &apos;a&apos; &#x41;&#66;</t></si></sst>';
// cellXfs index 0 general, 1 built-in date (14), 2 custom date (164), 3 custom number with a quoted "d" (165).
const styles = `<styleSheet>
  <numFmts><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="&quot;day&quot; 0.00"/></numFmts>
  <cellXfs count="4"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/><xf numFmtId="165"/></cellXfs>
</styleSheet>`;
const sheet = (rows: string) => `<worksheet><sheetData>${rows}</sheetData></worksheet>`;
const rows = [
  '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c><c r="D1" t="s"><v>9</v></c></row>',
  '<row r="2"><c r="A2" t="inlineStr"><is><t>Multi\tline\nname</t></is></c><c r="B2" t="str"><v>a&amp;b</v></c><c r="C2" t="e"><v>#N/A</v></c><c r="D2" s="0"/></row>',
  '<row r="3"><c r="A3"><v>3.5E-3</v></c><c r="B3" s="1"><v>46300</v></c><c r="C3" s="2"><v>46300.75</v></c><c r="D3" s="3"><v>12.5</v></c></row>',
  '<row r="4"><c><v>0.1</v></c><c><v>NaN</v></c><c t="s"><v>2</v></c></row>',
].join('');

const book = (extra: Entry[] = [], sheetName = 'xl/worksheets/sheet1.xml') =>
  zip([
    { name: 'xl/workbook.xml', data: workbook },
    { name: 'xl/_rels/workbook.xml.rels', data: rels('worksheets/sheet1.xml') },
    { name: 'xl/sharedStrings.xml', data: shared },
    { name: 'xl/styles.xml', data: styles },
    { name: sheetName, data: sheet(rows) },
    ...extra,
  ]);

describe('readXlsxText', () => {
  it('reads the first sheet as tab-separated text', async () => {
    const text = await readXlsxText(book());
    expect(text.split('\n')).toEqual([
      'Currency\t\tUS Dollar\t', // a gap column stays empty; an unknown shared string is blank
      'Multi line name\ta&b\t#N/A\t',
      '0.0035\t05 October 2026\t05 October 2026\t12.5',
      `0.1\t\tR&D <x> "q" 'a' AB`, // cells without refs fill left to right
    ]);
  });

  it('follows an absolute relationship target', async () => {
    const blob = zip([
      { name: 'xl/workbook.xml', data: workbook },
      { name: 'xl/_rels/workbook.xml.rels', data: rels('/xl/worksheets/data.xml') },
      { name: 'xl/worksheets/data.xml', data: sheet('<row><c t="inlineStr"><is><t>ok</t></is></c></row>') },
    ]);
    expect(await readXlsxText(blob)).toBe('ok');
  });

  it('falls back to the first sheetN.xml without a workbook, a matching relationship, or a target', async () => {
    const only = (extra: Entry[]) =>
      zip([...extra, { name: 'xl/worksheets/sheet2.xml', data: sheet('<row><c><v>7</v></c></row>') }]);
    expect(await readXlsxText(only([]))).toBe('7');
    expect(await readXlsxText(only([{ name: 'xl/workbook.xml', data: workbook }, { name: 'xl/_rels/workbook.xml.rels', data: '<Relationships/>' }]))).toBe('7');
    expect(await readXlsxText(only([{ name: 'xl/workbook.xml', data: workbook }, { name: 'xl/_rels/workbook.xml.rels', data: '<Relationships><Relationship Id="rId1"/></Relationships>' }]))).toBe('7');
  });

  it('inflates deflated entries', async () => {
    const blob = zip([{ name: 'xl/worksheets/sheet1.xml', data: await deflate(sheet('<row><c t="inlineStr"><is><t>packed</t></is></c></row>')), method: 8 }]);
    expect(await readXlsxText(blob)).toBe('packed');
  });

  it('rejects files that are not workbooks', async () => {
    await expect(readXlsxText(new Blob(['plain text, not a zip']))).rejects.toThrow('no zip directory');
    await expect(readXlsxText(zip([{ name: 'readme.txt', data: 'hi' }]))).rejects.toThrow('No worksheet found');
    await expect(readXlsxText(zip([{ name: 'xl/worksheets/sheet1.xml', data: 'x', method: 12 }]))).rejects.toThrow('Unsupported compression');
    // A corrupt central directory reads as an empty archive.
    await expect(readXlsxText(zip([{ name: 'xl/worksheets/sheet1.xml', data: sheet('') }], { badCentral: true }))).rejects.toThrow('No worksheet found');
  });
});
