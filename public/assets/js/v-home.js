// Panel de inicio.
import { h, icon, pct, fdate, plural, toast } from './dom.js';
import { api } from './api.js';
import { ring, heatmap } from './charts.js';
import { S, reload, blocks, topicList, topicById, progress, blockStats, overallMastery, daysLeft, go, startQuiz, masteryClass, weakTopics, settings, hooks } from './state.js';

export default async function home() {
  await reload();
  hooks.rerenderNav();
  const b = S.boot;
  const d = daysLeft();
  const goal = settings().daily_goal;
  const todayQ = b.todayStats.q;

  const countdown = h('div', { class: 'card countdown' },
    h('div', { class: 'stat' },
      h('span', { class: 'l' }, 'Tiempo hasta el examen'),
      d == null ? h('span', { class: 'v' }, '—') : d > 0 ? h('span', { class: 'v' }, d, h('small', { class: 'muted', style: { fontSize: '1rem', fontWeight: 600 } }, d === 1 ? ' día' : ' días'))
        : h('span', { class: 'v' }, d === 0 ? '¡Hoy!' : 'Hecho'),
      d == null
        ? h('a', { class: 'btn sm primary', href: '#/ajustes' }, icon('calendar'), 'Fijar fecha del examen')
        : h('span', { class: 'l' }, fdate(settings().exam_date, { weekday: true }))));

  const today = h('div', { class: 'card' },
    h('div', { class: 'kpi' },
      ring(Math.min(100, (100 * todayQ) / goal), { size: 84, stroke: 9, label: todayQ + '' }),
      h('div', { class: 'stat' },
        h('span', { class: 'l' }, 'Hoy'),
        h('strong', null, `${todayQ} / ${goal} preguntas`),
        h('span', { class: 'chip ' + (b.streak ? 'warn' : '') }, icon('flame'), b.streak ? plural(b.streak, 'día de racha', 'días de racha') : 'Sin racha aún'),
        h('span', { class: 'hint' }, `${b.todayStats.c} tarjetas repasadas`))));

  const due = b.due;
  const review = h('div', { class: 'card' },
    h('div', { class: 'stat' },
      h('span', { class: 'l' }, 'Repaso espaciado pendiente'),
      h('span', { class: 'v' }, due.questions + due.cards),
      h('span', { class: 'hint' }, `${plural(due.questions, 'pregunta', 'preguntas')} · ${plural(due.cards, 'tarjeta', 'tarjetas')}`)),
    h('div', { class: 'row mt' },
      h('a', { class: 'btn primary sm' + (due.questions ? '' : ' disabled'), href: '#/repaso' }, icon('repeat'), 'Repasar preguntas'),
      h('a', { class: 'btn sm' + (due.cards ? '' : ' disabled'), href: '#/tarjetas' }, icon('layers'), 'Tarjetas')));

  // Plan de hoy
  const planCard = h('div', { class: 'card' }, h('div', { class: 'row between' }, h('h2', { class: 'mb0' }, 'Plan de hoy'), h('a', { class: 'small', href: '#/plan' }, 'Ver plan completo')));
  const plan = b.plan;
  if (!plan.ready) {
    planCard.append(h('p', { class: 'muted mt' }, plan.reason), h('a', { class: 'btn primary', href: '#/ajustes' }, 'Configurar plan'));
  } else if (!plan.day) {
    planCard.append(h('div', { class: 'empty' }, icon('check'), h('p', null, 'Hoy es día de descanso según tu calendario. Descansar también es estudiar.')));
  } else {
    planCard.append(h('p', { class: 'hint mt' }, `Fase: ${plan.phase} · ${plan.daysLeft} días para el examen`));
    for (const t of plan.day.tasks) planCard.append(taskRow(t, plan));
  }

  // Mapa del temario
  const grid = h('div', { class: 'topic-grid' });
  for (const t of topicList()) {
    const p = progress(t.id);
    grid.append(h('a', {
      class: 'topic-cell ' + masteryClass(p), href: '#/tema/' + t.id,
      title: `Tema ${t.global}: ${t.short} — dominio ${p.mastery}%`,
    }, t.global));
  }
  const map = h('div', { class: 'card' },
    h('div', { class: 'row between' }, h('h2', { class: 'mb0' }, 'Mapa del temario'), h('span', { class: 'chip primary' }, `Dominio global ${overallMastery()}%`)),
    h('div', { class: 'mt' }, grid),
    h('div', { class: 'legend mt' },
      legend('var(--heat0)', 'Sin empezar'), legend('#e8a33b', 'Flojo'), legend('#5ba7d6', 'En progreso'), legend('#2f9e5f', 'Dominado')));

  // Progreso por bloque
  const blocksCard = h('div', { class: 'card' }, h('h2', null, 'Progreso por bloque'));
  for (const bl of blocks()) {
    const s = blockStats(bl.id);
    blocksCard.append(h('div', { class: 'mb' },
      h('div', { class: 'row between small' }, h('span', null, h('strong', null, `Bloque ${bl.num}`), ' · ', bl.title.split(' y ')[0]), h('strong', null, s.mastery + '%')),
      h('div', { class: 'bar ' + bl.id }, h('i', { style: { width: s.mastery + '%' } })),
      h('div', { class: 'xs muted' }, `${s.seen}/${s.q} preguntas vistas${s.acc != null ? ' · acierto ' + pct(s.acc) : ''}`)));
  }

  // Puntos débiles
  const weak = weakTopics(4);
  const weakCard = h('div', { class: 'card' }, h('h2', null, 'Puntos débiles'));
  if (!weak.length) {
    weakCard.append(h('p', { class: 'muted' }, 'Aún no hay datos suficientes. Haz algunos tests y aquí aparecerán los temas donde más fallas.'));
  } else {
    for (const { t, p } of weak) {
      weakCard.append(h('a', { class: 'row between', href: '#/tema/' + t.id, style: { padding: '.35rem 0', color: 'inherit', textDecoration: 'none' } },
        h('span', { class: 'small' }, `T${t.global} · ${t.short}`), h('span', { class: 'chip ko' }, pct(p.acc))));
    }
    weakCard.append(h('button', { class: 'btn sm mt', onclick: () => startQuiz({ kind: 'test', topics: weak.map((w) => w.t.id), n: 20, mode: 'estudio' }) }, icon('target'), 'Reforzar estos temas'));
  }

  // Último simulacro
  const le = b.lastExam;
  const lastCard = h('div', { class: 'card' }, h('h2', null, 'Último resultado'));
  if (!le) lastCard.append(h('p', { class: 'muted' }, 'Todavía no has hecho ningún test cronometrado.'), h('a', { class: 'btn sm', href: '#/simulacro' }, 'Hacer un simulacro'));
  else lastCard.append(
    h('p', { class: 'mb0' }, h('strong', null, le.title)),
    h('div', { class: 'row mt' }, le.points != null ? h('span', { class: 'score-big' }, le.points.toString().replace('.', ','), h('small', { class: 'muted', style: { fontSize: '1rem' } }, ' / 100')) : h('span', { class: 'score-big' }, (le.total?.outOfTen ?? 0).toString().replace('.', ','), h('small', { class: 'muted', style: { fontSize: '1rem' } }, ' / 10'))),
    h('a', { class: 'btn sm mt', href: '#/quiz/' + le.id }, 'Ver corrección'));

  // Actividad
  const stats = await api.get('/stats?days=190');
  const daily = {};
  for (const [k, v] of Object.entries(stats.daily)) daily[k] = v.q + v.c;
  const act = h('div', { class: 'card' }, h('h2', null, 'Constancia'), heatmap(daily, { weeks: 26 }),
    h('p', { class: 'hint mb0' }, `${stats.totals.answers} respuestas en total · ${stats.totals.distinct} preguntas distintas vistas de ${stats.totals.bank}`));

  return h('div', null,
    h('h1', null, 'Panel de estudio'),
    h('div', { class: 'hero mb' }, countdown, today, review),
    h('div', { class: 'grid g-main' }, h('div', { class: 'stack' }, planCard, map, act), h('div', { class: 'stack' }, blocksCard, weakCard, lastCard)));
}

const legend = (c, t) => h('span', null, h('i', { style: { background: c } }), t);

function taskRow(t, plan) {
  const done = plan.done.includes(t.key);
  const row = h('div', { class: 'task' + (done ? ' done' : '') });
  const cb = h('input', {
    type: 'checkbox', checked: done || null, 'aria-label': 'Marcar como hecho',
    onchange: async (e) => {
      try { await api.post('/plan/done', { key: t.key, done: e.target.checked }); row.classList.toggle('done', e.target.checked); }
      catch (err) { toast(err.message, 'err'); e.target.checked = !e.target.checked; }
    },
  });
  row.append(cb, h('div', { class: 'task-label' }, t.label), taskAction(t));
  return row;
}

export function taskAction(t) {
  const btn = (label, fn, ic = 'play') => h('button', { class: 'btn sm', onclick: fn }, icon(ic), label);
  switch (t.type) {
    case 'estudio': return btn('Abrir', () => go('/tema/' + t.topic), 'book');
    case 'test': return btn('Test', () => startQuiz({ kind: 'test', topics: t.topics || [t.topic], n: t.n || 20, mode: 'estudio' }));
    case 'tarjetas': return btn('Tarjetas', () => go('/tarjetas' + (t.topics || t.topic ? '?topics=' + (t.topics || [t.topic]).join(',') : '')), 'layers');
    case 'repaso': return btn('Repasar', () => go('/repaso'), 'repeat');
    case 'falladas': return btn('Falladas', () => startQuiz({ kind: 'test', origen: 'falladas', n: 30, mode: 'estudio' }), 'target');
    case 'debiles': return btn('Reforzar', () => {
      const w = weakTopics(3).map((x) => x.t.id);
      startQuiz({ kind: 'test', topics: w.length ? w : undefined, n: 30, mode: 'estudio' });
    }, 'target');
    case 'simulacro': return btn('Empezar', () => go('/simulacro'), 'timer');
    default: return null;
  }
}
