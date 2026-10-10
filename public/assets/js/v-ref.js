// Recursos de consulta: glosario, chuletas, normativa y búsqueda global.
import { h, icon, plural } from './dom.js';
import { api } from './api.js';
import { render } from './md.js';
import { S, reload, blocks, topicById } from './state.js';

const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function highlight(text, tokens) {
  if (!tokens.length) return text;
  const folded = fold(text);
  const marks = new Array(text.length).fill(false);
  // la normalización NFD puede cambiar longitudes; solo resaltamos si coinciden
  if (folded.length !== text.length) return text;
  for (const t of tokens) { let i = -1; while ((i = folded.indexOf(t, i + 1)) >= 0) for (let k = 0; k < t.length; k++) marks[i + k] = true; }
  const out = []; let buf = '', on = false;
  for (let i = 0; i < text.length; i++) {
    if (marks[i] !== on) { out.push(on ? h('mark', { class: 'hl' }, buf) : buf); buf = ''; on = marks[i]; }
    buf += text[i];
  }
  out.push(on ? h('mark', { class: 'hl' }, buf) : buf);
  return out;
}

export async function glosario(ctx) {
  const { items } = await api.get('/glosario');
  const cats = [...new Set(items.map((i) => i.c))];
  let q = ctx.query.q || '', cat = '';
  const list = h('div', { class: 'card' }), count = h('span', { class: 'hint' });
  const chips = h('div', { class: 'row' });
  const input = h('input', { type: 'search', placeholder: 'Buscar siglas o conceptos…', value: q, 'aria-label': 'Buscar en el glosario', oninput: (e) => { q = e.target.value; draw(); } });
  const draw = () => {
    const toks = fold(q).split(/\s+/).filter(Boolean);
    const res = items.filter((i) => (!cat || i.c === cat) && toks.every((t) => fold(i.t + ' ' + i.d).includes(t)));
    chips.replaceChildren(h('button', { class: 'chip btn-like', 'aria-pressed': cat === '' ? 'true' : 'false', onclick: () => { cat = ''; draw(); } }, 'Todas'),
      ...cats.map((c) => h('button', { class: 'chip btn-like', 'aria-pressed': cat === c ? 'true' : 'false', onclick: () => { cat = c; draw(); } }, c)));
    count.textContent = `${res.length} de ${items.length} entradas`;
    list.replaceChildren(...(res.length ? res.map((i) => h('div', { class: 'task' }, h('div', { style: { minWidth: '9rem', maxWidth: '9rem', fontWeight: 700 } }, highlight(i.t, toks)),
      h('div', { class: 'task-label' }, highlight(i.d, toks), h('div', { class: 'xs muted' }, i.c)))) : [h('div', { class: 'empty' }, 'Sin resultados.')]));
  };
  draw();
  return h('div', null, h('h1', null, 'Glosario y siglas'), h('div', { class: 'stack' }, input, chips, count, list));
}

export async function chuletas() {
  const { items } = await api.get('/chuletas');
  return h('div', null, h('h1', null, 'Chuletas'), h('p', { class: 'muted' }, 'Resúmenes de una página para repasar justo antes de un test o del examen.'),
    items.length ? h('div', { class: 'grid g-auto' }, items.map((c) => h('a', { class: 'topic-card', href: '#/chuleta/' + c.slug, style: { '--c': 'var(--primary)' } }, h('div', { class: 'row' }, icon('info'), h('h3', null, c.title))))) : h('div', { class: 'card empty' }, 'Aún no hay chuletas.'));
}

export async function chuleta(ctx) {
  const c = await api.get('/chuleta/' + ctx.params[0]);
  return h('div', null, h('div', { class: 'row between mb' }, h('a', { class: 'btn ghost sm', href: '#/chuletas' }, icon('back'), 'Chuletas'), h('button', { class: 'btn sm', onclick: () => window.print() }, 'Imprimir')),
    h('div', { class: 'card' }, render(c.md)));
}

export async function normativa() {
  const [{ items }] = await Promise.all([api.get('/normativa'), reload()]);
  let q = '';
  const host = h('div', { class: 'stack' });
  const draw = () => {
    host.replaceChildren();
    const toks = fold(q).split(/\s+/).filter(Boolean);
    for (const b of blocks()) {
      const rows = [];
      for (const t of b.topics) {
        const norms = items.filter((n) => (n.topics || []).includes(t.id) && toks.every((k) => fold(n.title + ' ' + (n.note || '')).includes(k)));
        if (!norms.length) continue;
        rows.push(h('div', { class: 'mt' }, h('a', { href: '#/tema/' + t.id, style: { fontWeight: 700 } }, `Tema ${t.global}. ${t.short}`),
          norms.map((n) => h('div', { class: 'task' }, h('div', { class: 'task-label' }, h('strong', null, n.title), n.note ? h('div', { class: 'small muted' }, n.note) : null),
            n.url ? h('a', { class: 'btn sm', href: n.url, target: '_blank', rel: 'noopener noreferrer' }, icon('link'), 'Abrir') : null))));
      }
      if (rows.length) host.append(h('div', { class: 'card' }, h('div', { class: 'row' }, h('span', { class: 'chip ' + b.id }, `Bloque ${b.num}`), h('strong', null, b.title)), rows));
    }
    if (!host.firstChild) host.append(h('div', { class: 'card empty' }, 'Sin resultados.'));
  };
  draw();
  return h('div', null, h('h1', null, 'Normativa de referencia'),
    h('div', { class: 'callout warn' }, 'Enlaces a textos oficiales (BOE, EUR-Lex). Las normas se modifican con frecuencia: antes del examen comprueba siempre la versión consolidada vigente.'),
    h('div', { class: 'field mt' }, h('input', { type: 'search', placeholder: 'Filtrar normas…', 'aria-label': 'Filtrar normas', oninput: (e) => { q = e.target.value; draw(); } })), host);
}

export async function buscar(ctx) {
  const q = ctx.query.q || '';
  const r = q ? await api.get('/search?q=' + encodeURIComponent(q)) : { results: [] };
  const groups = {};
  r.results.forEach((x) => (groups[x.type] ||= []).push(x));
  const labels = { tema: 'Temas', apuntes: 'En los apuntes', glosario: 'Glosario', chuleta: 'Chuletas', pregunta: 'Preguntas' };
  const toks = fold(q).split(/\s+/).filter(Boolean);
  return h('div', null, h('h1', null, q ? `Resultados para «${q}»` : 'Búsqueda'),
    !q ? h('div', { class: 'card empty' }, 'Escribe en la barra superior para buscar en apuntes, preguntas, glosario y chuletas.')
      : !r.results.length ? h('div', { class: 'card empty' }, 'No se ha encontrado nada. Prueba con otra palabra.')
        : h('div', { class: 'stack' }, Object.entries(labels).filter(([k]) => groups[k]).map(([k, label]) => h('div', { class: 'card' }, h('h3', null, label, h('span', { class: 'muted' }, ` · ${groups[k].length}`)),
          groups[k].map((x) => h('a', { class: 'task', href: x.href, style: { color: 'inherit', textDecoration: 'none' } }, h('div', { class: 'task-label' }, h('strong', null, highlight(x.title, toks)), h('div', { class: 'small muted' }, highlight(x.text, toks))), icon('right')))))));
}
