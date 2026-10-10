// Strukturu určuje původní PDF. Model překládá pouze text identifikovaných bloků.
export interface DocumentBlock {
  id: string; text: string; marker: string; indent: number; size: number;
  gap: number; bold: boolean; italic: boolean; family: string;
}
export interface DocumentLayout { version: 'pdf-layout-1'; blocks: DocumentBlock[] }
const prefix = 'PDF_LAYOUT_V1\n';

// Čte pouze náš formát; běžný text ze staršího překladu zůstává běžným textem.
export function readLayout(text: string): DocumentLayout | null {
  if (!text.startsWith(prefix)) return null;
  const value = JSON.parse(text.slice(prefix.length));
  if (!value || value.version !== 'pdf-layout-1' || !Array.isArray(value.blocks) || value.blocks.some((b:any)=>
    !b || typeof b.id!=='string' || typeof b.text!=='string' || typeof b.marker!=='string' ||
    !['serif','sans-serif','monospace'].includes(b.family) || typeof b.bold!=='boolean' || typeof b.italic!=='boolean' ||
    ![b.indent,b.size,b.gap].every(Number.isFinite) || b.size<=0 || b.size>12 || b.indent<0 || b.gap<0 || b.gap>3
  )) throw Error('Neplatná struktura stránky.');
  if (new Set(value.blocks.map((b:DocumentBlock)=>b.id)).size!==value.blocks.length || value.blocks.some((b:DocumentBlock)=>!b.id)) throw Error('Neplatná identifikace bloků stránky.');
  return value;
}
export function writeLayout(blocks: DocumentBlock[]): string {
  return blocks.length ? prefix + JSON.stringify({ version: 'pdf-layout-1', blocks }) : '';
}

// Řadí text geometricky a spojuje jen pokračování stejného odstavce či odrážky.
export function extractLayout(items: any[], styles: Record<string, any>, viewport: any): string {
  const pieces = items.filter(it => typeof it.str === 'string' && it.str.trim()).map(it => {
    const [x, y] = viewport.convertToViewportPoint(it.transform[4], it.transform[5]);
    const font = styles[it.fontName]?.fontFamily || '';
    return {text: it.str.trim(), x, y, width: Math.abs(it.width),
      size: Math.hypot(it.transform[2], it.transform[3]) || Math.abs(it.height) || 10,
      bold: /bold|black|heavy|semibold/i.test(it.fontName + font), italic: /italic|oblique/i.test(it.fontName + font),
      family: /sans|arial|helvetica|calibri/i.test(font) ? 'sans-serif' : /mono|courier|consolas/i.test(font) ? 'monospace' : 'serif'};
  }).sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: typeof pieces[] = [];
  for (const piece of pieces) {
    const row = [...rows].reverse().find(r => Math.abs(r[0].y - piece.y) <= Math.max(2, Math.max(r[0].size, piece.size) * .42));
    if (row) row.push(piece); else rows.push([piece]);
  }
  // Samostatné sloupce/tabulkové buňky nesléváme přes velkou mezeru do jedné věty.
  const lines: Array<typeof pieces[number] & {end: number}> = [];
  for (const row of rows) {
    row.sort((a,b) => a.x - b.x);
    let line: typeof lines[number] | undefined;
    for (const p of row) {
      const gap = line ? p.x - line.end : 0;
      if (!line || gap > p.size * 4) {
        line = {...p, end: p.x + p.width}; lines.push(line);
      } else {
        line.text += (gap > p.size * .12 ? ' ' : '') + p.text;
        line.end = p.x + p.width;
        // Odrážkový symbol často používá jiný font než vlastní text.
        if (p.text.length > 2) { line.size=p.size; line.bold=p.bold; line.italic=p.italic; line.family=p.family; }
      }
    }
  }
  if (!lines.length) return '';
  const bodySize = [...lines].sort((a,b)=>a.size-b.size)[Math.floor(lines.length / 2)].size;
  const left = Math.min(...lines.map(l=>l.x));
  const blocks: DocumentBlock[] = [];
  let previous: typeof lines[number] | undefined;
  let contentX = 0;
  for (const line of lines) {
    const match = line.text.match(/^([•●○◦▪▫■□‣⁃]|[o·]|[-–]|\d+[.)]|[a-zA-Z][.)])\s+(.+)$/u);
    const marker = match?.[1] || '';
    const text = match?.[2] || line.text;
    const gap = previous ? line.y - previous.y : 0;
    const last = blocks[blocks.length - 1];
    const heading = line.bold || line.size > bodySize * 1.15;
    const continuation = last && previous && !marker && !heading && !last.bold &&
      gap > line.size * .5 && gap <= line.size * 1.6 &&
      Math.abs(line.x - contentX) < line.size * .8 && Math.abs(line.size - previous.size) < .6;
    if (continuation) {
      // Odstraní pouze měkké dělení; skutečný spojovník (third-party) zachová.
      last.text = last.text.endsWith('\u00ad') ? last.text.slice(0,-1) + text : last.text.endsWith('-') ? last.text + text : last.text + ' ' + text;
    } else {
      blocks.push({id:`b${blocks.length}`, text, marker,
        indent: Math.max(0, (line.x - left) / bodySize), size: line.size / bodySize,
        gap: previous ? Math.max(.2, Math.min(3, (gap - line.size) / bodySize)) : 0,
        bold: line.bold || line.size > bodySize * 1.15, italic: line.italic, family: line.family});
      contentX = line.x + (marker ? line.size * 1.5 : 0);
    }
    previous=line;
  }
  return writeLayout(blocks);
}

// Do modelu posílá pouze texty; odsazení, fonty a značky zůstávají v prohlížeči.
export function translationInput(source: string): string {
  const layout=readLayout(source);
  return layout ? prefix + JSON.stringify({blocks:layout.blocks.map(({id,text})=>({id,text}))}) : source;
}
export function plainText(source: string): string {
  const layout=readLayout(source);
  return layout ? layout.blocks.map(b=>' '.repeat(Math.min(30,Math.round(b.indent*2)))+(b.marker?b.marker+' ':'')+b.text).join('\n\n') : source;
}

// Nepřijme ztracený, duplicitní ani přidaný blok; model nesmí přepsat strukturu PDF.
export function mergeTranslation(source: string, translated: string): string {
  const layout=readLayout(source);
  if (!layout) return translated;
  try {
    const result=JSON.parse(translated.replace(/^```(?:json)?\s*|\s*```$/g, '').trim());
    if (!Array.isArray(result.blocks) || result.blocks.length!==layout.blocks.length) throw Error();
    const values=new Map<string,string>();
    for (const b of result.blocks) {
      if (typeof b.id!=='string'||typeof b.text!=='string'||!b.text.trim()||values.has(b.id)) throw Error();
      values.set(b.id,b.text);
    }
    if (layout.blocks.some(b=>!values.has(b.id))) throw Error();
    return writeLayout(layout.blocks.map(b=>({...b,text:values.get(b.id)!})));
  } catch { throw Error('Překlad nevrátil všechny části stránky ve správné struktuře. Zkus stránku přeložit znovu.'); }
}

// Escapování je společné pro obrazovku i tisk; text PDF ani modelu není HTML.
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
}
export function documentHtml(text: string): string {
  const layout=readLayout(text);
  if (!layout) return `<div style="white-space:pre-wrap">${escapeHtml(text)}</div>`;
  return '<div class="document-layout">'+layout.blocks.map(b=>{
    const indent=Math.min(24,Math.max(0,b.indent));
    return `<div class="document-block" data-block="${escapeHtml(b.id)}" style="margin-left:min(${indent}em,35%);margin-top:${b.gap}em;font-size:${b.size}em;font-weight:${b.bold?700:400};font-style:${b.italic?'italic':'normal'};font-family:${b.family};${b.marker?'display:flex;gap:.55em;':''}">${b.marker?`<span class="document-marker" aria-hidden="true">${escapeHtml(b.marker)}</span>`:''}<span class="document-text">${escapeHtml(b.text)}</span></div>`;
  }).join('')+'</div>';
}
export const documentCss = `.document-layout{font:14px/1.45 Arial,sans-serif;color:#20252b;text-align:left;overflow-wrap:break-word}.document-block{break-inside:avoid;white-space:pre-wrap}.document-text{min-width:0}.document-marker{flex:0 0 1em;text-align:center}.document-layout .document-block:first-child{margin-top:0!important}@media(max-width:600px){.document-layout{font-size:14px}}`;
