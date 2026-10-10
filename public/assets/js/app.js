// Punto de entrada: estructura de la página, enrutador por hash y atajos globales.
import { h, icon, clear, toast } from './dom.js';
import { api } from './api.js';
import { S, reload, applyTheme, daysLeft, hooks } from './state.js';
import home from './v-home.js';
import { temario, tema } from './v-temario.js';
import { testConfig, runner, simulacro, repaso } from './v-quiz.js';
import { tarjetas } from './v-cards.js';
import { supuestos } from './v-supuestos.js';
import { stats, plan } from './v-stats.js';
import { herramientas } from './v-tools.js';
import { glosario, chuletas, chuleta, normativa, buscar } from './v-ref.js';
import ajustes from './v-settings.js';

try { const t = localStorage.getItem('tai-theme'); if (t) applyTheme(t); } catch { /* ignorar */ }

const routes = [
  [/^\/$/, home, 'home'],
  [/^\/temario$/, temario, 'temario'],
  [/^\/tema\/(b\dt\d+)$/, tema, 'temario'],
  [/^\/test$/, testConfig, 'test'],
  [/^\/quiz\/(\d+)$/, runner, null],
  [/^\/simulacro$/, simulacro, 'simulacro'],
  [/^\/repaso$/, repaso, 'repaso'],
  [/^\/tarjetas$/, tarjetas, 'tarjetas'],
  [/^\/supuestos$/, supuestos, 'supuestos'],
  [/^\/stats$/, stats, 'stats'],
  [/^\/plan$/, plan, 'plan'],
  [/^\/herramientas(?:\/(\w+))?$/, herramientas, 'herramientas'],
  [/^\/glosario$/, glosario, 'glosario'],
  [/^\/chuletas$/, chuletas, 'chuletas'],
  [/^\/chuleta\/([\w-]+)$/, chuleta, 'chuletas'],
  [/^\/normativa$/, normativa, 'normativa'],
  [/^\/buscar$/, buscar, null],
  [/^\/ajustes$/, ajustes, 'ajustes'],
];

const NAV = [
  ['home', '/', 'home', 'Inicio'],
  ['temario', '/temario', 'book', 'Temario'],
  ['_', 'Practicar'],
  ['test', '/test', 'list', 'Test personalizado'],
  ['repaso', '/repaso', 'repeat', 'Repaso del día', 'due'],
  ['tarjetas', '/tarjetas', 'layers', 'Tarjetas', 'cards'],
  ['supuestos', '/supuestos', 'briefcase', 'Supuestos prácticos'],
  ['simulacro', '/simulacro', 'timer', 'Simulacro oficial'],
  ['_', 'Seguimiento'],
  ['stats', '/stats', 'chart', 'Estadísticas'],
  ['plan', '/plan', 'calendar', 'Plan de estudio'],
  ['_', 'Recursos'],
  ['herramientas', '/herramientas', 'wrench', 'Herramientas'],
  ['glosario', '/glosario', 'search', 'Glosario y siglas'],
  ['chuletas', '/chuletas', 'info', 'Chuletas'],
  ['normativa', '/normativa', 'scale', 'Normativa'],
  ['_', ''],
  ['ajustes', '/ajustes', 'sliders', 'Ajustes'],
];

const appEl = document.getElementById('app');
let mainEl, navEl, shell, leaveFns = [], token = 0;

function buildShell() {
  const nav = h('nav', { class: 'nav', 'aria-label': 'Principal' });
  navEl = nav;
  const side = h('aside', { class: 'sidebar' },
    h('div', { class: 'brand' }, h('div', { class: 'logo' }, 'T'), h('div', null, 'TAI · C1', h('small', null, 'Técnico Auxiliar de Informática'))),
    nav,
    h('div', { class: 'side-foot', id: 'side-foot' }));
  const searchInput = h('input', {
    type: 'search', id: 'gsearch', placeholder: 'Buscar en apuntes, preguntas, siglas…', 'aria-label': 'Buscar',
    onkeydown: (e) => { if (e.key === 'Enter' && e.target.value.trim()) { location.hash = '#/buscar?q=' + encodeURIComponent(e.target.value.trim()); e.target.blur(); } },
  });
  const themeBtn = h('button', { class: 'btn ghost icon', title: 'Cambiar tema', 'aria-label': 'Cambiar tema', onclick: toggleTheme }, icon('moon'));
  const top = h('header', { class: 'topbar' },
    h('button', { class: 'btn ghost icon menu-btn', 'aria-label': 'Abrir menú', onclick: () => shell.classList.toggle('nav-open') }, icon('menu')),
    h('div', { class: 'search' }, icon('search'), searchInput, h('kbd', null, '/')),
    h('div', { class: 'grow' }),
    h('a', { class: 'chip primary', id: 'countdown', href: '#/ajustes', title: 'Días hasta el examen' }),
    themeBtn);
  mainEl = h('main', { id: 'main', tabindex: '-1' });
  shell = h('div', { class: 'app' }, side, h('div', { class: 'scrim', onclick: () => shell.classList.remove('nav-open') }), h('div', { class: 'main-col' }, top, mainEl));
  clear(appEl).append(shell);
  renderNav();
}

async function toggleTheme() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark'
    || (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
  const t = dark ? 'light' : 'dark';
  applyTheme(t);
  S.boot.settings.theme = t;
  api.post('/settings', { theme: t }).catch(() => {});
}

function renderNav(active) {
  if (!navEl) return;
  clear(navEl);
  const due = S.boot?.due || { questions: 0, cards: 0 };
  for (const it of NAV) {
    if (it[0] === '_') { navEl.append(it[1] ? h('div', { class: 'label' }, it[1]) : h('div', { class: 'sep' })); continue; }
    const [key, path, ic, label, badge] = it;
    const n = badge === 'due' ? due.questions : badge === 'cards' ? due.cards : 0;
    navEl.append(h('a', { href: '#' + path, 'aria-current': key === active ? 'page' : null }, icon(ic), label, n ? h('span', { class: 'count' }, n > 99 ? '99+' : n) : null));
  }
  const cd = document.getElementById('countdown');
  if (cd) {
    const d = S.boot ? daysLeft() : null;
    cd.replaceChildren(icon('clock'), d == null ? 'Fija la fecha del examen' : d > 0 ? `${d} días para el examen` : d === 0 ? '¡Hoy es el examen!' : 'Examen realizado');
  }
  const foot = document.getElementById('side-foot');
  if (foot) foot.textContent = S.boot ? `${S.boot.totals.bank} preguntas · ${S.boot.bank.cards} tarjetas` : '';
}

hooks.rerenderNav = () => renderNav(currentKey);
const onLeave = (fn) => leaveFns.push(fn);

let currentKey = null;
async function route() {
  const my = ++token;
  const hash = location.hash.slice(1) || '/';
  const [path, qs] = hash.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  for (const fn of leaveFns.splice(0)) { try { fn(); } catch { /* ignorar */ } }
  shell?.classList.remove('nav-open');

  let hit = null;
  for (const [re, view, key] of routes) {
    const m = re.exec(path);
    if (m) { hit = { view, key, params: m.slice(1) }; break; }
  }
  if (!hit) { hit = { view: () => notFound(), key: null, params: [] }; }
  currentKey = hit.key;
  try {
    if (!S.boot) await reload();
    if (my !== token) return;
    if (!shell) buildShell();
    renderNav(hit.key);
    mainEl.replaceChildren(h('p', { class: 'boot' }, 'Cargando…'));
    const node = await hit.view({ params: hit.params, query, onLeave, path });
    if (my !== token) return;
    mainEl.replaceChildren(node);
    window.scrollTo(0, 0);
    document.title = (mainEl.querySelector('h1')?.textContent || 'TAI') + ' · TAI C1';
  } catch (e) {
    if (my !== token) return;
    if (!shell) buildShell();
    mainEl.replaceChildren(h('div', { class: 'card' }, h('h2', null, 'No se ha podido cargar'), h('p', { class: 'muted' }, e.message || String(e)),
      h('button', { class: 'btn', onclick: () => location.reload() }, 'Reintentar')));
    console.error(e);
  }
}

function notFound() {
  return h('div', { class: 'card empty' }, h('h2', null, 'Página no encontrada'), h('a', { class: 'btn primary', href: '#/' }, 'Ir al inicio'));
}

document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    document.getElementById('gsearch')?.focus();
  }
});
window.addEventListener('hashchange', route);
window.addEventListener('error', (e) => { if (e.message && !/ResizeObserver/.test(e.message)) console.error(e.error || e.message); });
window.addEventListener('unhandledrejection', (e) => { if (e.reason?.status === 0) toast('Sin conexión con el servidor', 'err'); });
route();
