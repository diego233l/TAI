// Estado compartido de la aplicación y utilidades de navegación.
import { api } from './api.js';
import { toast } from './dom.js';

export const S = { boot: null };
// app.js registra aquí funciones que las vistas necesitan sin importar app.js (evita ciclos).
export const hooks = { rerenderNav: () => {} };

export async function reload() {
  S.boot = await api.get('/bootstrap');
  applyTheme(S.boot.settings.theme);
  return S.boot;
}

export function applyTheme(t) {
  const r = document.documentElement;
  if (t === 'light' || t === 'dark') r.setAttribute('data-theme', t); else r.removeAttribute('data-theme');
  try { localStorage.setItem('tai-theme', t || 'auto'); } catch { /* sin almacenamiento */ }
}

export const blocks = () => S.boot.temario.bloques;
export const topicList = () => blocks().flatMap((b) => b.topics.map((t) => ({ ...t, block: b.id, blockNum: b.num, blockTitle: b.title, practico: b.practico })));
export const topicById = (id) => topicList().find((t) => t.id === id);
export const blockById = (id) => blocks().find((b) => b.id === id);
export const progress = (tid) => S.boot.progress[tid];
export const settings = () => S.boot.settings;

export function blockStats(bid) {
  const b = blockById(bid);
  let q = 0, seen = 0, mastery = 0, due = 0, ok = 0, ko = 0;
  for (const t of b.topics) {
    const p = progress(t.id);
    q += p.q; seen += p.seen; due += p.due; ok += p.ok; ko += p.ko;
    mastery += (p.mastery / 100) * p.q;
  }
  return { q, seen, due, mastery: q ? Math.round((100 * mastery) / q) : 0, acc: ok + ko ? (100 * ok) / (ok + ko) : null };
}

export function overallMastery() {
  let q = 0, m = 0;
  for (const t of topicList()) { const p = progress(t.id); q += p.q; m += (p.mastery / 100) * p.q; }
  return q ? Math.round((100 * m) / q) : 0;
}

export function daysLeft() {
  const d = S.boot.settings.exam_date;
  if (!d) return null;
  const [y, m, dd] = d.split('-').map(Number);
  const [ty, tm, td] = S.boot.today.split('-').map(Number);
  return Math.round((new Date(y, m - 1, dd) - new Date(ty, tm - 1, td)) / 86400000);
}

export const go = (path) => { location.hash = '#' + path; };

/** Crea una sesión de test en el servidor y abre el corredor. */
export async function startQuiz(cfg) {
  try {
    const r = await api.post('/quiz', cfg);
    go('/quiz/' + r.id);
  } catch (e) {
    toast(e.message, 'err');
  }
}

export const blockClass = (bid) => bid;
export const STATUS = {
  pendiente: { label: 'Pendiente', cls: '' },
  estudiando: { label: 'Estudiando', cls: 'primary' },
  repasar: { label: 'Repasar', cls: 'warn' },
  dominado: { label: 'Dominado', cls: 'ok' },
};

/** Clase de color según el dominio de un tema (m0 sin empezar … m3 dominado). */
export const masteryClass = (p) => (p.seen === 0 ? 'm0' : p.mastery < 35 ? 'm1' : p.mastery < 70 ? 'm2' : 'm3');

/** Temas más débiles: con al menos 3 preguntas vistas, por menor dominio. */
export function weakTopics(n = 5) {
  return topicList().map((t) => ({ t, p: progress(t.id) }))
    .filter(({ p }) => p.seen >= 3 && p.acc != null)
    .sort((a, b) => a.p.mastery - b.p.mastery || a.p.acc - b.p.acc)
    .slice(0, n);
}
