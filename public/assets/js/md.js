// Renderizador de Markdown mínimo y seguro (construye nodos DOM; nunca inserta HTML).
// Soporta: títulos, listas anidadas, tablas, citas, bloques de código, **negrita**, *cursiva*,
// `código`, ==resaltado==, [enlaces](url) y avisos con «> [!EXAMEN] …» (EXAMEN, OJO, TRUCO, NOTA).
import { h } from './dom.js';

const SAFE_URL = /^(https?:\/\/|mailto:|#\/)/i;

export function inline(text) {
  const out = [];
  const re = /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*)|(==[^=\n]+?==)|(\[[^\]\n]+\]\([^)\s]+\))|(\*[^*\s][^*\n]*?\*)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (m[1]) out.push(h('code', null, t.slice(1, -1)));
    else if (m[2]) out.push(h('strong', null, inline(t.slice(2, -2))));
    else if (m[3]) out.push(h('mark', null, inline(t.slice(2, -2))));
    else if (m[4]) {
      const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(t);
      if (mm && SAFE_URL.test(mm[2])) {
        const ext = !mm[2].startsWith('#');
        out.push(h('a', { href: mm[2], ...(ext ? { target: '_blank', rel: 'noopener noreferrer' } : {}) }, inline(mm[1])));
      } else out.push(t);
    } else out.push(h('em', null, inline(t.slice(1, -1))));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const isBlank = (l) => /^\s*$/.test(l);
const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

export function render(src, { toc } = {}) {
  const root = h('div', { class: 'md' });
  blocks(String(src || '').replace(/\r\n?/g, '\n').split('\n'), root, toc);
  return root;
}

function blocks(lines, root, toc) {
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }

    const fence = /^\s*```\s*([\w+-]*)\s*$/.exec(line);
    if (fence) {
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++;
      root.append(h('pre', null, h('code', { 'data-lang': fence[1] || null }, buf.join('\n'))));
      continue;
    }
    const hd = /^(#{1,4})\s+(.*?)\s*#*$/.exec(line);
    if (hd) {
      const level = hd[1].length;
      const el = h('h' + level, { id: toc ? 'sec-' + toc.length : null }, inline(hd[2]));
      if (toc && level >= 2) toc.push({ level, text: hd[2].replace(/[*`=]/g, ''), el });
      root.append(el);
      i++;
      continue;
    }
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) { root.append(h('hr')); i++; continue; }

    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && !isBlank(lines[i])) rows.push(cells(lines[i++]));
      root.append(h('table', null,
        h('thead', null, h('tr', null, head.map((c) => h('th', null, inline(c))))),
        h('tbody', null, rows.map((r) => h('tr', null, head.map((_, k) => h('td', null, inline(r[k] ?? ''))))))));
      continue;
    }
    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      let cls = '', tag = null;
      const m = /^\[!(EXAMEN|OJO|TRUCO|NOTA)\]\s*(.*)$/i.exec(buf[0] || '');
      if (m) {
        cls = 'c-' + m[1].toLowerCase();
        tag = { EXAMEN: 'Cae en examen', OJO: 'Ojo', TRUCO: 'Truco', NOTA: 'Nota' }[m[1].toUpperCase()];
        buf[0] = m[2];
      }
      const bq = h('blockquote', { class: cls || null }, tag ? h('span', { class: 'tag' }, tag) : null);
      blocks(buf, bq);
      root.append(bq);
      continue;
    }
    if (LIST.test(line)) { i = list(lines, i, root); continue; }

    const buf = [line];
    i++;
    while (i < lines.length && !isBlank(lines[i]) && !/^\s*(```|#{1,4}\s|>|([-*+]|\d+[.)])\s)/.test(lines[i])
      && !(lines[i].includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1]))) buf.push(lines[i++]);
    const text = buf.map((l) => l.trim()).join(' ');
    root.append(h('p', null, inline(text)));
  }
}

function list(lines, start, root) {
  const first = LIST.exec(lines[start]);
  const baseIndent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const el = h(ordered ? 'ol' : 'ul');
  let i = start;
  while (i < lines.length) {
    const m = LIST.exec(lines[i]);
    if (!m || m[1].length < baseIndent) break;
    if (m[1].length > baseIndent) break; // lo gestiona la recursión del ítem anterior
    const li = h('li', null, inline(m[3]));
    i++;
    // continuaciones y sublistas
    while (i < lines.length) {
      const l = lines[i];
      if (isBlank(l)) {
        const nxt = lines[i + 1];
        if (nxt !== undefined && LIST.test(nxt) && LIST.exec(nxt)[1].length > baseIndent) { i++; continue; }
        break;
      }
      const sm = LIST.exec(l);
      if (sm && sm[1].length > baseIndent) { i = list(lines, i, li); continue; }
      if (!sm && /^\s{2,}\S/.test(l) && l.search(/\S/) > baseIndent) { li.append(' ', inline(l.trim())); i++; continue; }
      break;
    }
    el.append(li);
  }
  root.append(el);
  return i;
}
