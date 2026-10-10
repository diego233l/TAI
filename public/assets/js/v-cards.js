// Tarjetas de memoria con repetición espaciada (otra vez / difícil / bien / fácil).
import { h, icon, plural, toast } from './dom.js';
import { api } from './api.js';
import { inline } from './md.js';
import { reload, blocks, topicList, topicById, progress, hooks } from './state.js';

export async function tarjetas(ctx) {
  await reload();
  hooks.rerenderNav();
  const host = h('div');
  const topicsQ = ctx.query.topics || '';
  if (topicsQ) { start({ scope: 'learn', topics: topicsQ, limit: 40, fallback: true }); } else setup();
  return host;

  function setup() {
    const totals = { due: 0, all: 0, seen: 0 };
    topicList().forEach((t) => { const p = progress(t.id); totals.due += p.cardsDue; totals.all += p.cards; totals.seen += p.cardsSeen; });
    const cfg = { scope: totals.due ? 'due' : 'learn', block: '', limit: 30 };
    const draw = () => {
      const chip = (grp, v, label, get = () => cfg[grp]) => h('button', { class: 'chip btn-like', 'aria-pressed': get() === v ? 'true' : 'false', onclick: () => { cfg[grp] = v; draw(); } }, label);
      host.replaceChildren(h('h1', null, 'Tarjetas de memoria'),
        h('div', { class: 'grid g-main' },
          h('div', { class: 'card' },
            h('p', null, `Tienes ${plural(totals.all, 'tarjeta', 'tarjetas')} (${totals.seen} vistas, `, h('strong', null, `${totals.due} para repasar hoy`), ').'),
            h('h3', null, '¿Qué quieres repasar?'),
            h('div', { class: 'row' }, chip('scope', 'due', `Pendientes (${totals.due})`), chip('scope', 'learn', 'Pendientes + nuevas'), chip('scope', 'new', `Solo nuevas (${totals.all - totals.seen})`), chip('scope', 'all', 'Todas (práctica libre)')),
            h('h3', { class: 'mt' }, 'Bloque'),
            h('div', { class: 'row' }, chip('block', '', 'Todos'), blocks().map((b) => chip('block', b.id, `Bloque ${b.num}`))),
            h('h3', { class: 'mt' }, 'Tarjetas por sesión'),
            h('div', { class: 'row' }, [15, 30, 60, 200].map((n) => chip('limit', n, n === 200 ? 'Todas' : n))),
            h('button', { class: 'btn primary lg mt', onclick: () => start({ scope: cfg.scope, block: cfg.block, limit: cfg.limit }) }, icon('play'), 'Empezar')),
          h('div', { class: 'card' }, h('h3', null, 'Cómo funciona'),
            h('ul', null, h('li', null, 'Lee la pregunta, intenta recordar y ', h('strong', null, 'voltea'), ' la tarjeta (Espacio).'),
              h('li', null, 'Valora con honestidad: ', h('strong', null, 'Otra vez'), ' (1), ', h('strong', null, 'Difícil'), ' (2), ', h('strong', null, 'Bien'), ' (3), ', h('strong', null, 'Fácil'), ' (4).'),
              h('li', null, 'Las que fallas vuelven en la misma sesión; las que sabes se espacian más cada vez.'),
              h('li', null, 'Si hay fecha de examen, ningún intervalo supera el 40 % del tiempo restante.')))));
    };
    draw();
  }

  async function start({ scope, block, topics, limit, fallback }) {
    const q = new URLSearchParams({ scope, limit });
    if (block) q.set('block', block);
    if (topics) q.set('topics', topics);
    let r = await api.get('/cards?' + q);
    if (!r.items.length && fallback) { q.set('scope', 'all'); r = await api.get('/cards?' + q); }
    if (!r.items.length) {
      host.replaceChildren(h('h1', null, 'Tarjetas de memoria'), h('div', { class: 'card empty' }, icon('check'), h('p', null, scope === 'due' ? 'No hay tarjetas pendientes. ¡Buen trabajo!' : 'No hay tarjetas con esos filtros.'),
        h('button', { class: 'btn', onclick: setup }, 'Volver')));
      return;
    }
    session(r.items);
  }

  function session(items) {
    const queue = [...items];
    const total = items.length;
    let flipped = false, done = 0, again = 0;
    const draw = () => {
      if (!queue.length) { finish(); return; }
      const c = queue[0], t = topicById(c.topic);
      const face = h('div', { class: 'card flash-card', tabindex: 0, role: 'button', 'aria-label': flipped ? 'Respuesta' : 'Pregunta. Pulsa para ver la respuesta', onclick: flip, onkeydown: (e) => { if (e.key === 'Enter') flip(); } },
        h('div', null, h('span', { class: 'side' }, flipped ? 'Respuesta' : 'Pregunta'), h('div', { class: 'body' }, inline(flipped ? c.b : c.f)),
          !flipped ? h('p', { class: 'hint mt2' }, 'Toca o pulsa Espacio para voltear') : null));
      host.replaceChildren(
        h('div', { class: 'qhead' }, h('button', { class: 'btn ghost sm', onclick: exit }, icon('x'), 'Salir'),
          h('span', { class: 'chip ' + t?.block }, `T${t?.global} · ${t?.short}`), c.new ? h('span', { class: 'chip primary' }, 'Nueva') : null,
          h('div', { class: 'bar' }, h('i', { style: { width: (100 * done) / total + '%' } })), h('span', { class: 'muted small' }, `${queue.length} restantes`)),
        h('div', { class: 'flash' }, face),
        flipped ? h('div', { class: 'grades' }, [[1, 'Otra vez', 'danger'], [2, 'Difícil', ''], [3, 'Bien', 'primary'], [4, 'Fácil', 'ok']].map(([g, l, cls]) => h('button', { class: 'btn lg ' + cls, onclick: () => grade(g) }, h('kbd', null, g), ' ', l)))
          : h('div', { class: 'center mt' }, h('button', { class: 'btn primary lg', onclick: flip }, icon('eye'), 'Mostrar respuesta')));
    };
    const flip = () => { flipped = !flipped; draw(); };
    const grade = async (g) => {
      const c = queue.shift();
      try { await api.post('/cards/grade', { cid: c.id, grade: g }); } catch (e) { toast(e.message, 'err'); queue.unshift(c); return; }
      if (g === 1) { queue.push(c); again++; } else done++;
      flipped = false; draw();
    };
    const exit = () => { document.removeEventListener('keydown', onKey); reload().then(() => { hooks.rerenderNav(); setup(); }); };
    const finish = () => {
      document.removeEventListener('keydown', onKey);
      reload().then(() => hooks.rerenderNav());
      host.replaceChildren(h('h1', null, 'Sesión completada'), h('div', { class: 'card center' }, h('div', { class: 'score-big' }, total), h('p', { class: 'muted' }, `tarjetas repasadas · ${again} veces “otra vez”`),
        h('div', { class: 'row', style: { justifyContent: 'center' } }, h('button', { class: 'btn primary', onclick: exit }, 'Otra sesión'), h('a', { class: 'btn', href: '#/' }, 'Inicio'))));
    };
    const onKey = (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || e.ctrlKey || e.metaKey) return;
      if (e.key === ' ' || e.key === 'Enter') { if (!queue.length) return; e.preventDefault(); flip(); }
      else if (flipped && '1234'.includes(e.key) && e.key) grade(+e.key);
    };
    document.addEventListener('keydown', onKey);
    ctx.onLeave(() => document.removeEventListener('keydown', onKey));
    draw();
  }
}
