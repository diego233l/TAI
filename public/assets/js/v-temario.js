// Temario (lista de bloques/temas) y página de cada tema.
import { h, icon, pct, plural, debounce, toast } from './dom.js';
import { api } from './api.js';
import { render } from './md.js';
import { S, reload, blocks, progress, blockStats, topicById, STATUS, startQuiz, go, masteryClass } from './state.js';

export async function temario() {
  await reload();
  let filter = 'todos';
  const host = h('div');
  const chips = h('div', { class: 'row' });

  const draw = () => {
    chips.replaceChildren(...['todos', 'pendiente', 'estudiando', 'repasar', 'dominado'].map((f) =>
      h('button', { class: 'chip btn-like', 'aria-pressed': filter === f ? 'true' : 'false', onclick: () => { filter = f; draw(); } },
        f === 'todos' ? 'Todos' : STATUS[f].label)));
    host.replaceChildren();
    for (const b of blocks()) {
      const st = blockStats(b.id);
      const topics = b.topics.filter((t) => filter === 'todos' || progress(t.id).status === filter);
      if (!topics.length) continue;
      host.append(h('div', { class: 'block-head' },
        h('div', { class: 'num ' + b.id }, b.num),
        h('div', { class: 'grow' }, h('h2', { class: 'mb0' }, `Bloque ${b.num}. ${b.title}`),
          h('span', { class: 'hint' }, `${b.topics.length} temas · ${st.q} preguntas · dominio ${st.mastery}%${b.practico ? ' · entra en el supuesto práctico' : ''}`)),
        h('button', { class: 'btn sm', onclick: () => startQuiz({ kind: 'test', blocks: [b.id], n: 25, mode: 'estudio' }) }, icon('play'), 'Test del bloque')));
      host.append(h('div', { class: 'grid g-auto' }, topics.map((t) => topicCard(t, b))));
    }
    if (!host.firstChild) host.append(h('div', { class: 'empty' }, 'No hay temas con ese estado.'));
  };
  draw();

  return h('div', null,
    h('div', { class: 'row between mb' }, h('h1', { class: 'mb0' }, 'Temario oficial'),
      h('a', { class: 'small', href: S.boot.temario.convocatoria.url, target: '_blank', rel: 'noopener noreferrer' }, icon('link'), 'Convocatoria ' + S.boot.temario.convocatoria.ref)),
    h('p', { class: 'muted' }, '33 temas en 4 bloques, tal como figuran en el Anexo V de la convocatoria. Los bloques III y IV también se examinan en el supuesto práctico.'),
    chips, host);
}

function topicCard(t, b) {
  const p = progress(t.id);
  return h('a', { class: 'topic-card ' + b.id, href: '#/tema/' + t.id },
    h('div', { class: 'row between nowrap' }, h('span', { class: 'chip ' + b.id }, `Tema ${t.global}`), h('span', { class: 'chip ' + STATUS[p.status].cls }, STATUS[p.status].label)),
    h('h3', null, t.short),
    h('div', { class: 'bar thin ' + b.id }, h('i', { style: { width: p.mastery + '%' } })),
    h('div', { class: 'row small muted' },
      h('span', null, `${p.q} preguntas`), p.cards ? h('span', null, `· ${p.cards} tarjetas`) : null,
      p.acc != null ? h('span', null, `· ${pct(p.acc)} acierto`) : null,
      p.due ? h('span', { class: 'chip warn' }, p.due + ' para repasar') : null,
      !p.notes ? h('span', { class: 'chip' }, 'sin apuntes') : null));
}

export async function tema(ctx) {
  const id = ctx.params[0];
  const d = await api.get('/topic/' + id);
  const t = topicById(id);
  const b = blocks().find((x) => x.id === t.block);
  const p = d.stats;
  let tab = ctx.query.tab || 'apuntes';
  const body = h('div');
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const TABS = [['apuntes', 'Apuntes'], ['practicar', 'Practicar'], ['tarjetas', `Tarjetas (${d.cards.length})`], ['normativa', 'Normativa'], ['notas', 'Mis notas']];

  const statusSel = h('select', {
    'aria-label': 'Estado del tema', class: 'sm',
    onchange: async (e) => {
      try { await api.post('/topic/' + id, { status: e.target.value }); S.boot.progress[id].status = e.target.value; toast('Estado guardado'); }
      catch (err) { toast(err.message, 'err'); }
    },
  }, Object.entries(STATUS).map(([k, v]) => h('option', { value: k, selected: d.state.status === k || null }, v.label)));

  const draw = () => {
    tabs.replaceChildren(...TABS.map(([k, label]) => h('button', { role: 'tab', 'aria-selected': tab === k ? 'true' : 'false', onclick: () => { tab = k; draw(); } }, label)));
    body.replaceChildren(({ apuntes, practicar, tarjetas, normativa, notas })[tab]());
  };

  function apuntes() {
    if (!d.md.trim()) return h('div', { class: 'callout warn' }, h('strong', null, 'Apuntes en preparación. '), 'Este tema aún no tiene resumen escrito; puedes estudiarlo con el temario oficial y practicar con sus preguntas.');
    const toc = [];
    const md = render(d.md, { toc });
    const tocEl = h('nav', { class: 'toc card flat', 'aria-label': 'Índice' }, h('strong', { class: 'small' }, 'En esta página'),
      toc.map((e) => h('a', { class: 'l' + e.level, onclick: () => e.el.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, e.text)));
    return h('div', { class: 'with-toc' }, h('div', { class: 'card' }, md), tocEl);
  }

  function practicar() {
    const mk = (label, cfg, ic = 'play', primary = false) => h('button', { class: 'btn' + (primary ? ' primary' : ''), onclick: () => startQuiz({ kind: 'test', topics: [id], mode: 'estudio', ...cfg }) }, icon(ic), label);
    const nuevas = p.q - p.seen;
    return h('div', { class: 'stack' },
      h('div', { class: 'card' }, h('h3', null, 'Estado de este tema'),
        h('div', { class: 'grid g4' },
          kpi(p.q, 'preguntas en el banco'), kpi(`${p.seen}/${p.q}`, 'vistas'), kpi(p.acc != null ? pct(p.acc) : '—', 'acierto histórico'), kpi(p.mastery + '%', 'dominio estimado')),
        h('div', { class: 'bar mt ' + b.id }, h('i', { style: { width: p.mastery + '%' } }))),
      h('div', { class: 'card' }, h('h3', null, 'Test de este tema'),
        p.q === 0 ? h('p', { class: 'muted' }, 'Todavía no hay preguntas para este tema.') : h('div', { class: 'row' },
          mk('10 preguntas', { n: 10 }, 'play', true), mk('20 preguntas', { n: 20 }), mk('40 preguntas', { n: 40 }), mk('Todas', { n: 200 }),
          mk(`Solo nuevas (${nuevas})`, { n: 20, origen: 'nuevas' }, 'zap'), mk(`Falladas (${p.wrong})`, { n: 20, origen: 'falladas' }, 'target'),
          mk(`Para repasar (${p.due})`, { n: 20, origen: 'pendientes' }, 'repeat'), mk('Marcadas', { n: 20, origen: 'marcadas' }, 'star'),
          mk('Cronometrado (20 · 24 min)', { n: 20, mode: 'examen', minutes: 24 }, 'timer'))),
      d.supuestos.length ? h('div', { class: 'card' }, h('h3', null, 'Supuestos prácticos relacionados'),
        d.supuestos.map((s) => h('div', { class: 'row between task' }, h('span', null, s.title, h('span', { class: 'muted' }, ` · ${s.n} preguntas`)),
          h('button', { class: 'btn sm', onclick: () => startQuiz({ kind: 'supuesto', supuesto: s.id, mode: 'estudio' }) }, icon('play'), 'Resolver')))) : null);
  }

  function tarjetas() {
    if (!d.cards.length) return h('div', { class: 'card empty' }, 'Este tema aún no tiene tarjetas.');
    return h('div', { class: 'stack' },
      h('div', { class: 'row' }, h('a', { class: 'btn primary', href: '#/tarjetas?topics=' + id }, icon('layers'), 'Estudiar tarjetas de este tema'), h('span', { class: 'hint' }, `${p.cardsSeen}/${d.cards.length} vistas`)),
      h('div', { class: 'card' }, d.cards.map((c) => h('details', { style: { padding: '.5rem 0', borderBottom: '1px solid var(--border)' } },
        h('summary', { style: { cursor: 'pointer', fontWeight: 600 } }, c.f), h('div', { class: 'mt muted', style: { whiteSpace: 'pre-line' } }, c.b)))));
  }

  function normativa() {
    if (!d.normativa.length) return h('div', { class: 'card empty' }, 'Sin normativa asociada a este tema.');
    return h('div', { class: 'card' }, h('p', { class: 'hint' }, 'Enlaces al texto consolidado oficial. Comprueba siempre la versión vigente: la normativa cambia.'),
      d.normativa.map((n) => h('div', { class: 'task' }, h('div', { class: 'task-label' }, h('strong', null, n.title), n.note ? h('div', { class: 'small muted' }, n.note) : null),
        n.url ? h('a', { class: 'btn sm', href: n.url, target: '_blank', rel: 'noopener noreferrer' }, icon('link'), 'Abrir') : null)));
  }

  function notas() {
    const saved = h('span', { class: 'hint' }, 'Se guarda automáticamente');
    const save = debounce(async (v) => { try { await api.post('/topic/' + id, { notes: v }); saved.textContent = 'Guardado'; } catch (e) { saved.textContent = 'Error al guardar'; } }, 700);
    return h('div', { class: 'card' }, h('h3', null, 'Tus notas sobre este tema'),
      h('textarea', { style: { minHeight: '14rem' }, placeholder: 'Esquemas, trucos mnemotécnicos, dudas para repasar…', oninput: (e) => { saved.textContent = 'Guardando…'; save(e.target.value); } }, d.state.notes),
      h('div', { class: 'mt' }, saved));
  }

  draw();
  const nav = (n, dir) => n ? h('a', { class: 'btn sm', href: '#/tema/' + n.id }, dir < 0 ? icon('left') : null, `T${n.global}`, dir > 0 ? icon('right') : null) : null;

  return h('div', null,
    h('div', { class: 'row between mb' },
      h('div', { class: 'row' }, h('a', { class: 'btn ghost sm', href: '#/temario' }, icon('back'), 'Temario'), h('span', { class: 'chip ' + b.id }, `Bloque ${b.num} · Tema ${t.global}`),
        t.practico ? h('span', { class: 'chip' }, 'Supuesto práctico') : null),
      h('div', { class: 'row' }, nav(d.prev, -1), statusSel, nav(d.next, 1))),
    h('h1', null, t.short),
    h('p', { class: 'official' }, h('strong', null, 'Epígrafe oficial: '), t.title),
    tabs, body);
}

const kpi = (v, l) => h('div', { class: 'stat' }, h('span', { class: 'v', style: { fontSize: '1.5rem' } }, v), h('span', { class: 'l' }, l));
