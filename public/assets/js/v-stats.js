// Estadísticas y plan de estudio.
import { h, icon, pct, num, duration, fdate, fts, plural, toast } from './dom.js';
import { api } from './api.js';
import { line, bars, heatmap } from './charts.js';
import { S, reload, blocks, topicList, topicById, settings } from './state.js';
import { taskAction } from './v-home.js';

export async function stats() {
  const [s] = await Promise.all([api.get('/stats?days=190'), reload()]);
  const t = s.totals, acc = t.ok + t.ko ? (100 * t.ok) / (t.ok + t.ko) : null;
  const avgMs = t.answers ? t.ms / t.answers : 0;
  const kpi = (v, l, sub) => h('div', { class: 'card stat' }, h('span', { class: 'v' }, v), h('span', { class: 'l' }, l), sub ? h('span', { class: 'hint' }, sub) : null);

  // últimos 30 días
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const x = s.daily[k];
    days.push({ label: d.getDate() + '/' + (d.getMonth() + 1), ok: x?.ok || 0, ko: x ? x.q - x.ok : 0 });
  }
  const daily = {};
  for (const [k, v] of Object.entries(s.daily)) daily[k] = v.q + v.c;

  // simulacros
  const sims = s.exams.filter((e) => e.kind === 'simulacro' && e.points != null).reverse();
  const tests = s.exams.filter((e) => e.kind !== 'simulacro' && e.total).reverse().slice(-20);

  // tabla por tema
  let sortKey = 'global', dir = 1;
  const tbody = h('tbody');
  const rows = () => topicList().map((tp) => ({ tp, p: s.topics[tp.id] }));
  const drawTable = () => {
    const key = { global: (r) => r.tp.global, mastery: (r) => r.p.mastery, acc: (r) => r.p.acc ?? -1, seen: (r) => r.p.seen / Math.max(1, r.p.q), due: (r) => r.p.due }[sortKey];
    tbody.replaceChildren(...rows().sort((a, b) => (key(a) - key(b)) * dir).map(({ tp, p }) => h('tr', null,
      h('td', null, h('a', { href: '#/tema/' + tp.id }, `T${tp.global}. ${tp.short}`)),
      h('td', null, h('span', { class: 'chip ' + tp.block }, tp.blockNum)),
      h('td', { class: 'nowrap' }, `${p.seen}/${p.q}`),
      h('td', { style: { minWidth: '7rem' } }, h('div', { class: 'bar thin ' + (p.acc == null ? '' : p.acc >= 70 ? 'ok' : p.acc >= 50 ? 'warn' : 'ko') }, h('i', { style: { width: (p.acc ?? 0) + '%' } }))),
      h('td', { class: 'nowrap' }, p.acc != null ? pct(p.acc) : '—'),
      h('td', { class: 'nowrap' }, p.mastery + '%'),
      h('td', null, p.due ? h('span', { class: 'chip warn' }, p.due) : '—'))));
  };
  const th = (label, key) => h('th', { style: { cursor: key ? 'pointer' : 'default' }, onclick: key ? () => { dir = sortKey === key ? -dir : 1; sortKey = key; drawTable(); } : null }, label);
  drawTable();

  const blockCards = blocks().map((b) => {
    let q = 0, seen = 0, ok = 0, ko = 0, m = 0;
    b.topics.forEach((tp) => { const p = s.topics[tp.id]; q += p.q; seen += p.seen; ok += p.ok; ko += p.ko; m += (p.mastery / 100) * p.q; });
    const mastery = q ? Math.round((100 * m) / q) : 0;
    return h('div', { class: 'card' }, h('div', { class: 'row between' }, h('strong', null, `Bloque ${b.num}`), h('span', { class: 'chip ' + b.id }, mastery + '%')),
      h('div', { class: 'small muted mb' }, b.title), h('div', { class: 'bar ' + b.id }, h('i', { style: { width: mastery + '%' } })),
      h('div', { class: 'small muted mt' }, `${seen}/${q} vistas · acierto ${ok + ko ? pct((100 * ok) / (ok + ko)) : '—'}`));
  });

  return h('div', null, h('h1', null, 'Estadísticas'),
    h('div', { class: 'grid g4 mb' },
      kpi(t.answers, 'respuestas registradas', `${plural(t.cardReviews, 'repaso', 'repasos')} de tarjetas`), kpi(acc != null ? pct(acc) : '—', 'acierto global'),
      kpi(`${t.distinct}/${t.bank}`, 'preguntas distintas vistas', pct((100 * t.distinct) / Math.max(1, t.bank)) + ' del banco'),
      kpi(avgMs ? (avgMs / 1000).toFixed(1).replace('.', ',') + ' s' : '—', 'tiempo medio por pregunta', `Racha: ${plural(s.streak, 'día', 'días')}`)),
    h('div', { class: 'grid g4 mb' }, blockCards),
    h('div', { class: 'grid g2' },
      h('div', { class: 'card' }, h('h2', null, 'Actividad (30 días)'), bars(days), h('div', { class: 'legend' }, h('span', null, h('i', { style: { background: 'var(--ok)' } }), 'Aciertos'), h('span', null, h('i', { style: { background: 'var(--ko)' } }), 'Fallos'))),
      h('div', { class: 'card' }, h('h2', null, 'Simulacros (nota estimada /100)'),
        sims.length >= 1 ? line(sims.map((e) => ({ x: fts(e.finished).split(' ').slice(0, 2).join(' '), y: e.points })), { refs: [{ y: 50, label: 'Mínimo 25 + 25', color: 'var(--warn)' }] })
          : h('div', { class: 'empty' }, 'Haz tu primer simulacro para ver la evolución.'))),
    tests.length ? h('div', { class: 'card mt' }, h('h2', null, 'Tests recientes (nota /10)'), line(tests.map((e) => ({ x: fts(e.finished).split(' ').slice(0, 2).join(' '), y: e.total.outOfTen })), { max: 10, refs: [{ y: 5, label: 'Aprobado', color: 'var(--warn)' }] })) : null,
    h('div', { class: 'card mt' }, h('h2', null, 'Constancia (26 semanas)'), heatmap(daily, { weeks: 26 })),
    h('div', { class: 'card mt' }, h('h2', null, 'Detalle por tema'), h('div', { class: 'scroll-x' }, h('table', { class: 't' },
      h('thead', null, h('tr', null, th('Tema', 'global'), th('Bl.'), th('Vistas', 'seen'), th(''), th('Acierto', 'acc'), th('Dominio', 'mastery'), th('Repasar', 'due'))), tbody))));
}

const PHASES = {
  estudio: ['Estudio', 'b1', 'Primera vuelta: leer, subrayar y hacer tests de cada tema.'],
  consolidacion: ['Consolidación', 'b2', 'Segunda vuelta con tests largos y tarjetas.'],
  simulacros: ['Simulacros', 'b4', 'Simulacros completos y análisis de fallos.'],
  final: ['Repaso final', 'b3', 'Sin temas nuevos: repaso ligero y descanso.'],
};

export async function plan() {
  const p = await api.get('/plan');
  await reload();
  if (!p.ready) {
    return h('div', null, h('h1', null, 'Plan de estudio'), h('div', { class: 'card empty' }, icon('calendar'), h('p', null, p.reason), h('a', { class: 'btn primary', href: '#/ajustes' }, 'Ir a Ajustes')));
  }
  const done = new Set(p.done);
  const today = p.today;
  const wk = (iso) => { const [y, m, d] = iso.split('-').map(Number); const dt = new Date(y, m - 1, d); const day = (dt.getDay() + 6) % 7; dt.setDate(dt.getDate() - day); return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0'); };
  const weeks = new Map();
  p.days.forEach((d) => { const k = wk(d.date); if (!weeks.has(k)) weeks.set(k, []); weeks.get(k).push(d); });
  const thisWeek = wk(today);

  const dayEl = (d) => h('div', { class: `day phase-${d.phase}${d.date === today ? ' today' : ''}${d.date < today ? ' past' : ''}` },
    h('div', { class: 'row between' }, h('strong', null, fdate(d.date, { weekday: true, year: false }), d.date === today ? h('span', { class: 'chip primary', style: { marginLeft: '.5rem' } }, 'Hoy') : null), h('span', { class: 'chip' }, PHASES[d.phase][0])),
    d.tasks.map((t) => {
      const row = h('div', { class: 'task' + (done.has(t.key) ? ' done' : '') });
      row.append(h('input', { type: 'checkbox', checked: done.has(t.key) || null, 'aria-label': 'Hecho', onchange: async (e) => {
        try { await api.post('/plan/done', { key: t.key, done: e.target.checked }); row.classList.toggle('done', e.target.checked); } catch (err) { toast(err.message, 'err'); e.target.checked = !e.target.checked; } } }),
      h('div', { class: 'task-label' }, t.label), taskAction(t));
      return row;
    }));

  return h('div', null, h('h1', null, 'Plan de estudio'),
    h('div', { class: 'grid g4 mb' },
      h('div', { class: 'card stat' }, h('span', { class: 'v' }, p.daysLeft), h('span', { class: 'l' }, `días hasta el examen (${fdate(p.exam)})`)),
      h('div', { class: 'card stat' }, h('span', { class: 'v' }, p.studyDays), h('span', { class: 'l' }, 'días de estudio disponibles')),
      h('div', { class: 'card stat' }, h('span', { class: 'v' }, `${Math.round((100 * p.days.filter((d) => d.tasks.every((t) => done.has(t.key))).length) / p.days.length)}%`), h('span', { class: 'l' }, 'días completados')),
      h('div', { class: 'card stat' }, h('span', { class: 'v' }, settings().hours_per_day + ' h'), h('span', { class: 'l' }, 'de estudio al día (Ajustes)'))),
    p.tight ? h('div', { class: 'callout warn' }, 'Tiempo justo: hay menos días de estudio que temas, así que se agrupan varios temas por día. Considera ampliar los días de estudio en Ajustes.') : null,
    h('div', { class: 'grid g4 mb' }, Object.entries(p.phases).map(([k, v]) => h('div', { class: 'card' }, h('div', { class: 'row between' }, h('strong', null, PHASES[k][0]), h('span', { class: 'chip ' + PHASES[k][1] }, plural(v.days, 'día', 'días'))),
      h('div', { class: 'small muted' }, `${fdate(v.from, { year: false })} → ${fdate(v.to, { year: false })}`), h('div', { class: 'small mt' }, PHASES[k][2])))),
    h('div', { class: 'stack' }, [...weeks.entries()].map(([k, days]) => {
      const past = k < thisWeek;
      const det = h('details', { open: !past && (k === thisWeek || k <= wk(addDays(today, 7))) || null }, h('summary', { style: { cursor: 'pointer', fontWeight: 700, padding: '.4rem 0' } },
        `Semana del ${fdate(k, { year: false })}`, h('span', { class: 'muted' }, ` · ${days.filter((d) => d.tasks.every((t) => done.has(t.key))).length}/${days.length} días completos`)),
      h('div', { class: 'stack mt' }, days.map(dayEl)));
      return det;
    })));
}

function addDays(iso, n) { const [y, m, d] = iso.split('-').map(Number); const dt = new Date(y, m - 1, d + n); return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0'); }
