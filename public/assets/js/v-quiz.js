// Tests: configuración, corredor (estudio / examen), simulacro oficial, repaso y resultados.
import { h, icon, pct, num, mmss, duration, plural, toast, dialog, confirmBox, seeded, hashStr, shuffled, debounce, fts } from './dom.js';
import { api } from './api.js';
import { render, inline } from './md.js';
import { ring } from './charts.js';
import { S, reload, blocks, topicList, topicById, progress, settings, go, startQuiz, hooks } from './state.js';

const LETTERS = ['A', 'B', 'C', 'D'];

// ============================================================ configuración
export async function testConfig(ctx) {
  await reload();
  const sel = new Set(ctx.query.topics ? ctx.query.topics.split(',') : ctx.query.block ? blocks().find((b) => b.id === ctx.query.block)?.topics.map((t) => t.id) || [] : []);
  const cfg = { n: 20, origen: 'todas', mode: 'estudio', minutes: 24 };
  const scope = h('div');

  const drawScope = () => {
    scope.replaceChildren(
      h('div', { class: 'row mb' }, h('button', { class: 'btn sm', onclick: () => { topicList().forEach((t) => sel.add(t.id)); drawScope(); } }, 'Todo el temario'),
        h('button', { class: 'btn sm', onclick: () => { sel.clear(); drawScope(); } }, 'Ninguno'),
        h('span', { class: 'hint' }, sel.size ? `${sel.size} temas seleccionados` : 'Sin selección = todo el temario')),
      blocks().map((b) => h('div', { class: 'mb' },
        h('div', { class: 'row' }, h('span', { class: 'chip ' + b.id }, `Bloque ${b.num}`), h('strong', { class: 'small' }, b.title),
          h('button', { class: 'btn ghost sm', onclick: () => { const all = b.topics.every((t) => sel.has(t.id)); b.topics.forEach((t) => (all ? sel.delete(t.id) : sel.add(t.id))); drawScope(); } }, 'Alternar bloque')),
        h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: '.25rem .8rem', marginTop: '.4rem' } },
          b.topics.map((t) => h('label', { class: 'check small' },
            h('input', { type: 'checkbox', checked: sel.has(t.id) || null, onchange: (e) => { e.target.checked ? sel.add(t.id) : sel.delete(t.id); drawScope(); } }),
            `T${t.global}. ${t.short}`, h('span', { class: 'muted' }, ` (${progress(t.id).q})`)))))));
  };
  drawScope();

  const chips = (name, opts, get, set) => {
    const wrap = h('div', { class: 'row' });
    const draw = () => wrap.replaceChildren(...opts.map(([v, label]) => h('button', { class: 'chip btn-like', 'aria-pressed': get() === v ? 'true' : 'false', onclick: () => { set(v); draw(); } }, label)));
    draw();
    return wrap;
  };
  const minutesField = h('div', { class: 'field', style: { display: 'none' } },
    h('label', { for: 'mins' }, 'Tiempo (minutos)'), h('input', { id: 'mins', type: 'number', min: 1, max: 240, value: cfg.minutes, oninput: (e) => { cfg.minutes = +e.target.value; } }),
    h('span', { class: 'hint' }, 'El examen oficial da ~1,2 minutos por pregunta.'));
  const nInput = h('input', { type: 'number', min: 1, max: 200, value: cfg.n, style: { width: '6rem' }, oninput: (e) => { cfg.n = +e.target.value; cfg.minutes = Math.max(1, Math.round(cfg.n * 1.2)); document.getElementById('mins').value = cfg.minutes; } });

  const start = () => {
    const topics = [...sel];
    startQuiz({ kind: 'test', topics: topics.length && topics.length < topicList().length ? topics : undefined, n: Math.max(1, cfg.n || 20), origen: cfg.origen, mode: cfg.mode, minutes: cfg.mode === 'examen' ? cfg.minutes : undefined });
  };

  return h('div', null,
    h('h1', null, 'Test personalizado'),
    h('div', { class: 'grid g-main' },
      h('div', { class: 'card' }, h('h2', null, '1. ¿Qué quieres practicar?'), scope),
      h('div', { class: 'stack' },
        h('div', { class: 'card' }, h('h2', null, '2. Número de preguntas'),
          h('div', { class: 'row' }, chips('n', [[10, '10'], [20, '20'], [30, '30'], [50, '50'], [80, '80']], () => cfg.n, (v) => { cfg.n = v; nInput.value = v; cfg.minutes = Math.round(v * 1.2); document.getElementById('mins').value = cfg.minutes; }), nInput)),
        h('div', { class: 'card' }, h('h2', null, '3. ¿Cuáles?'),
          chips('o', [['todas', 'Mezcla inteligente'], ['nuevas', 'Solo nuevas'], ['falladas', 'Falladas'], ['pendientes', 'Para repasar'], ['marcadas', 'Marcadas']], () => cfg.origen, (v) => { cfg.origen = v; }),
          h('p', { class: 'hint mt' }, 'La mezcla inteligente prioriza lo nuevo, lo que has fallado y lo que toca repasar.')),
        h('div', { class: 'card' }, h('h2', null, '4. Modo'),
          chips('m', [['estudio', 'Estudio · corrige al momento'], ['examen', 'Examen · corrige al final']], () => cfg.mode, (v) => { cfg.mode = v; minutesField.style.display = v === 'examen' ? '' : 'none'; }),
          h('div', { class: 'mt' }, minutesField),
          h('p', { class: 'hint' }, 'En modo examen la respuesta errónea resta 1/3 y la que dejes en blanco no penaliza, como en el examen real.')),
        h('button', { class: 'btn primary lg', onclick: start }, icon('play'), 'Empezar'))));
}

// ============================================================ repaso del día
export async function repaso() {
  await reload();
  const due = S.boot.due;
  return h('div', null, h('h1', null, 'Repaso del día'),
    h('div', { class: 'card' },
      due.questions
        ? [h('p', null, h('strong', null, plural(due.questions, 'pregunta', 'preguntas')), ' toca repasar hoy según tu calendario de repetición espaciada.'),
          h('p', { class: 'muted' }, 'Las que fallas vuelven pronto; las que aciertas se espacian cada vez más (1 → 3 → ~7 → … días), siempre con un repaso antes del examen.'),
          h('div', { class: 'row' }, h('button', { class: 'btn primary lg', onclick: () => startQuiz({ kind: 'repaso', n: 20 }) }, icon('play'), 'Repasar 20'),
            h('button', { class: 'btn', onclick: () => startQuiz({ kind: 'repaso', n: 50 }) }, 'Repasar 50'), h('button', { class: 'btn', onclick: () => startQuiz({ kind: 'repaso', n: 200 }) }, 'Todas'))]
        : [h('div', { class: 'empty' }, icon('check'), h('h2', null, '¡Todo al día!'), h('p', null, 'No tienes preguntas pendientes de repaso. Aprovecha para avanzar con temas nuevos o hacer un test.'),
          h('div', { class: 'row', style: { justifyContent: 'center' } }, h('a', { class: 'btn primary', href: '#/test' }, 'Crear un test'), h('a', { class: 'btn', href: '#/temario' }, 'Ir al temario')))]),
    due.cards ? h('div', { class: 'card mt' }, h('p', null, `Además tienes ${plural(due.cards, 'tarjeta', 'tarjetas')} pendientes.`), h('a', { class: 'btn', href: '#/tarjetas' }, icon('layers'), 'Repasar tarjetas')) : null);
}

// ============================================================ simulacro oficial
export async function simulacro() {
  await reload();
  const stats = await api.get('/stats?days=30');
  const per = { b1: 0, b2: 0, b3: 0, b4: 0 };
  topicList().forEach((t) => { per[t.block] += progress(t.id).q; });
  const sups = S.boot.supuestos;
  const supN = { b3: sups.filter((s) => s.block === 'b3').reduce((a, s) => a + s.n, 0), b4: sups.filter((s) => s.block === 'b4').reduce((a, s) => a + s.n, 0) };
  const totalQ = per.b1 + per.b2 + per.b3 + per.b4;
  const ex = S.boot.temario.examen;
  const warn = totalQ < 80 || supN.b3 < 20 || supN.b4 < 20;

  const preset = (title, sub, cfg, primary) => h('div', { class: 'card' }, h('h3', null, title), h('p', { class: 'muted small' }, sub),
    h('button', { class: 'btn lg' + (primary ? ' primary' : ''), onclick: () => startQuiz({ kind: 'simulacro', ...cfg }) }, icon('timer'), 'Empezar'));

  const hist = stats.exams.filter((e) => e.kind === 'simulacro');
  return h('div', null, h('h1', null, 'Simulacro oficial'),
    h('div', { class: 'callout' }, h('strong', null, 'Así es el examen real (convocatoria ' + S.boot.temario.convocatoria.ref + '): '),
      `ejercicio único de ${ex.minutos} minutos con dos partes eliminatorias. Parte 1: ${ex.parte1.preguntas} preguntas tipo test de todo el temario. Parte 2: un supuesto práctico a elegir entre el Bloque III y el Bloque IV (${ex.parte2.preguntas} preguntas). Cada error resta 1/3, el blanco no penaliza. Cada parte se puntúa sobre 50 y hay que sacar al menos 25 en ambas.`),
    warn ? h('div', { class: 'callout warn' }, `Banco actual: ${totalQ} preguntas de test · ${supN.b3} de supuestos del Bloque III · ${supN.b4} del Bloque IV. Para un simulacro completo se necesitan al menos 80 / 20 / 20; el simulacro se adaptará a lo disponible.`) : null,
    h('div', { class: 'grid g3' },
      preset('Oficial · 80 + 20', `120 minutos. Parte 1 con ${ex.parte1.preguntas} preguntas y Parte 2 con un supuesto a elegir.`, { n1: 80, n2: 20, minutes: 120 }, true),
      preset('Medio · 40 + 10', '60 minutos. Para días de menos tiempo, con las mismas reglas.', { n1: 40, n2: 10, minutes: 60 }),
      preset('Solo Parte 1 · 80', '96 minutos. Para entrenar el ritmo del cuestionario.', { n1: 80, n2: 0, minutes: 96 })),
    h('div', { class: 'card mt2' }, h('h2', null, 'Estrategia de examen'),
      h('ul', null,
        h('li', null, h('strong', null, 'Responde si puedes descartar al menos una opción. '), 'Con 4 opciones al azar la esperanza es 0 (0,25 − 0,75/3); con 3 opciones que quedan es +0,11; con 2, +0,33.'),
        h('li', null, h('strong', null, 'Ritmo: '), '~1,2 min por pregunta. Haz una primera pasada rápida y vuelve a las marcadas.'),
        h('li', null, h('strong', null, 'Supuesto práctico: '), 'elige el bloque (III o IV) en el que te sientas más seguro y no cambies a mitad del examen.'),
        h('li', null, h('strong', null, 'Objetivo de seguridad: '), `en simulacros, ≥ ${Math.min(95, settings().cut_pct + 15)} % de nota directa en cada parte (el corte real lo fija el Tribunal; nunca menos del 30 %).`))),
    h('div', { class: 'card mt' }, h('h2', null, 'Tus simulacros'),
      hist.length ? h('div', { class: 'scroll-x' }, h('table', { class: 't' }, h('thead', null, h('tr', null, ['Fecha', 'Tipo', 'Parte 1', 'Parte 2', 'Total', ''].map((x) => h('th', null, x)))),
        h('tbody', null, hist.map((e) => h('tr', null, h('td', null, fts(e.finished)), h('td', null, e.title), h('td', null, e.p1 ? `${e.p1.pct}% · ${num(e.p1.points)} pts` : '—'),
          h('td', null, e.p2 ? `${e.p2.pct}% · ${num(e.p2.points)} pts` : 'No corregida'), h('td', null, h('strong', null, num(e.points)), e.passed ? h('span', { class: 'chip ok', style: { marginLeft: '.4rem' } }, 'Apto') : h('span', { class: 'chip ko', style: { marginLeft: '.4rem' } }, 'No apto')),
          h('td', null, h('a', { href: '#/quiz/' + e.id }, 'Ver'))))))) : h('p', { class: 'muted' }, 'Aún no has hecho ningún simulacro.')));
}

// ============================================================ corredor
function orderFor(q, examId, shuffle) {
  const idx = [0, 1, 2, 3];
  return shuffle && !q.ns ? shuffled(idx, seeded(hashStr(examId + ':' + q.id))) : idx;
}

function flatten(d) {
  const out = [];
  d.layout.forEach((s) => s.groups.forEach((g) => g.qids.forEach((qid) => { if (d.questions[qid]) out.push({ qid, section: s, group: g }); })));
  return out;
}

export async function runner(ctx) {
  const id = +ctx.params[0];
  const d = await api.get('/exam/' + id);
  if (d.finished) return results(d);
  return d.mode === 'examen' ? examRunner(d, ctx) : studyRunner(d, ctx);
}

function qText(q) { return h('div', { class: 'qtext' }, render(q.q)); }

async function reportDialog(qid) {
  const kind = h('select', null, [['error', 'La respuesta correcta es otra'], ['enunciado', 'Enunciado ambiguo o mal redactado'], ['desactualizada', 'Normativa desactualizada'], ['otro', 'Otro']].map(([v, l]) => h('option', { value: v }, l)));
  const msg = h('textarea', { placeholder: '¿Qué has visto? (opcional)', style: { minHeight: '5rem' } });
  const ok = await dialog({ title: 'Reportar un problema', body: h('div', null, h('div', { class: 'field' }, h('label', null, 'Tipo'), kind), h('div', { class: 'field' }, h('label', null, 'Comentario'), msg)),
    actions: [{ label: 'Cancelar', value: false }, { label: 'Enviar', value: true, primary: true }] });
  if (!ok) return;
  try { await api.post('/report', { qid, kind: kind.value, msg: msg.value }); toast('Gracias. Queda guardado en Ajustes → Revisión de preguntas.'); } catch (e) { toast(e.message, 'err'); }
}

async function toggleFlag(q, btn) {
  const on = !q.flag;
  try { await api.post('/flag', { qid: q.id, flagged: on }); q.flag = on ? 1 : 0; btn.classList.toggle('flagged-on', !!q.flag); toast(on ? 'Pregunta marcada para repasar' : 'Marca quitada'); } catch (e) { toast(e.message, 'err'); }
}

// ------------------------------------------------------------ modo estudio
function studyRunner(d, ctx) {
  const items = flatten(d);
  const ans = { ...d.answers };
  let i = items.findIndex((it) => !(it.qid in ans));
  if (i < 0) i = items.length - 1;
  let t0 = Date.now(), busy = false, flagBtnRef = null;
  const root = h('div');
  const counts = () => { let ok = 0, ko = 0, bl = 0; for (const [qid, v] of Object.entries(ans)) { const q = d.questions[qid]; if (v == null) bl++; else if (q?.a != null) (v === q.a ? ok++ : ko++); } return { ok, ko, bl, done: Object.keys(ans).length }; };

  const draw = () => {
    const it = items[i], q = d.questions[it.qid], answered = it.qid in ans, order = orderFor(q, d.id, d.shuffle);
    const c = counts();
    const chosen = ans[it.qid];
    const opts = h('div', { class: 'opts', role: 'group', 'aria-label': 'Opciones' }, order.map((orig, pos) => {
      const cls = ['opt'];
      if (answered) {
        cls.push('locked');
        if (orig === q.a) cls.push('right'); else if (orig === chosen) cls.push('wrong');
      }
      return h('button', { class: cls.join(' '), 'data-pos': pos, onclick: () => pick(orig), disabled: answered || busy || null },
        h('span', { class: 'ltr' }, LETTERS[pos]), h('span', { class: 'txt' }, inline(q.o[orig])));
    }));
    const flagBtn = flagBtnRef = h('button', { class: 'btn sm ghost' + (q.flag ? ' flagged-on' : ''), title: 'Marcar para repasar (F)', onclick: (e) => toggleFlag(q, e.currentTarget) }, icon('star'), 'Marcar');
    const explain = answered ? h('div', { class: 'explain' },
      chosen == null ? h('p', { class: 'mb0' }, h('strong', null, 'En blanco. '), 'La correcta era ', h('strong', null, LETTERS[order.indexOf(q.a)]), '.')
        : chosen === q.a ? h('p', { class: 'mb0', style: { color: 'var(--ok)' } }, h('strong', null, '¡Correcto!'))
          : h('p', { class: 'mb0', style: { color: 'var(--ko)' } }, h('strong', null, 'Incorrecto. '), 'La correcta es ', h('strong', null, LETTERS[order.indexOf(q.a)]), '.'),
      q.e ? h('div', { class: 'mt' }, render(q.e)) : null, q.ref ? h('div', { class: 'ref' }, icon('book'), ' ', q.ref) : null) : null;

    const grp = it.group;
    root.replaceChildren(
      h('div', { class: 'qhead' },
        h('a', { class: 'btn ghost sm', href: '#/temario' }, icon('x'), 'Salir'),
        h('strong', null, d.title), h('span', { class: 'muted small' }, `${i + 1} / ${items.length}`),
        h('div', { class: 'bar' }, h('i', { style: { width: (100 * c.done) / items.length + '%' } })),
        h('span', { class: 'chip ok' }, icon('check'), c.ok), h('span', { class: 'chip ko' }, icon('x'), c.ko), c.bl ? h('span', { class: 'chip' }, c.bl + ' en blanco') : null),
      grp.enunciado ? h('details', { class: 'card enun', open: true }, h('summary', { style: { cursor: 'pointer', fontWeight: 700 } }, grp.title || 'Enunciado'), h('div', { class: 'mt' }, render(grp.enunciado))) : null,
      h('div', { class: 'card qcard' },
        h('div', { class: 'row small muted mb' }, q.topic ? h('span', { class: 'chip ' + topicById(q.topic)?.block }, `T${topicById(q.topic)?.global} · ${topicById(q.topic)?.short}`) : null),
        qText(q), opts, explain,
        h('div', { class: 'qactions' },
          h('button', { class: 'btn ghost', disabled: i === 0 || null, onclick: () => go_(i - 1) }, icon('left'), 'Anterior'),
          !answered ? h('button', { class: 'btn', disabled: busy || null, title: 'No lo sé (N)', onclick: () => pick(null) }, 'No lo sé') : null,
          answered ? h('button', { class: 'btn primary', onclick: next }, i === items.length - 1 ? 'Terminar' : 'Siguiente', icon('right')) : null,
          h('span', { class: 'grow' }), flagBtn,
          h('button', { class: 'btn sm ghost', title: 'Reportar error', onclick: () => reportDialog(q.id) }, icon('alert'), 'Reportar'))),
      h('p', { class: 'hint center mt' }, h('kbd', null, '1'), '–', h('kbd', null, '4'), ' responder · ', h('kbd', null, 'N'), ' no lo sé · ', h('kbd', null, 'Enter'), ' siguiente · ', h('kbd', null, 'F'), ' marcar'));
    if (!answered) t0 = Date.now();
  };

  const go_ = (n) => { i = Math.max(0, Math.min(items.length - 1, n)); draw(); window.scrollTo(0, 0); };
  const next = async () => {
    if (i < items.length - 1) { go_(i + 1); return; }
    if (counts().done < items.length) { const k = items.findIndex((it) => !(it.qid in ans)); if (k >= 0) { go_(k); toast('Quedan preguntas sin responder'); return; } }
    try { await api.post('/exam/' + d.id + '/finish', {}); const fin = await api.get('/exam/' + d.id); hooks.rerenderNav(); document.removeEventListener('keydown', onKey); root.replaceChildren(results(fin)); window.scrollTo(0, 0); } catch (e) { toast(e.message, 'err'); }
  };
  const pick = async (orig) => {
    const it = items[i], q = d.questions[it.qid];
    if (it.qid in ans || busy) return;
    busy = true;
    try {
      const r = await api.post('/exam/' + d.id + '/answer', { qid: it.qid, chosen: orig, ms: Date.now() - t0 });
      ans[it.qid] = r.chosen; q.a = r.a; q.e = r.e; q.ref = r.ref;
    } catch (e) { toast(e.message, 'err'); }
    busy = false; draw();
    root.querySelector('.btn.primary')?.focus({ preventScroll: true });
  };

  const onKey = (e) => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.modal-bg')) return;
    const it = items[i], answered = it.qid in ans, k = e.key.toLowerCase();
    const pos = '1234'.indexOf(k) >= 0 ? '1234'.indexOf(k) : 'abcd'.indexOf(k);
    if (!answered && k.length === 1 && pos >= 0) { pick(orderFor(d.questions[it.qid], d.id, d.shuffle)[pos]); }
    else if (!answered && (k === 'n' || k === '0')) pick(null);
    else if (k === 'f') flagBtnRef?.click();
    else if ((k === 'enter' || k === 'arrowright') && answered) { e.preventDefault(); next(); }
    else if (k === 'arrowleft') go_(i - 1);
  };
  document.addEventListener('keydown', onKey);
  ctx.onLeave(() => document.removeEventListener('keydown', onKey));
  draw();
  return root;
}

// ------------------------------------------------------------ modo examen
function examRunner(d, ctx) {
  const items = flatten(d);
  const ans = { ...d.answers };
  const marks = { ...d.marks };
  let choice = d.choice;
  const bySection = (sid) => items.filter((it) => it.section.id === sid);
  const sections = d.layout.filter((s) => bySection(s.id).length);
  let cur = Math.max(0, items.findIndex((it) => !(it.qid in ans) || ans[it.qid] == null));
  let sec = items[cur].section.id;
  let finishing = false;
  const deadline = d.remaining != null ? Date.now() + d.remaining * 1000 : null;
  const root = h('div');
  const timerEl = h('span', { class: 'timer', 'aria-live': 'off' }, deadline ? mmss(d.remaining) : '--:--');

  const isP2 = (s) => s.id.startsWith('p2-');
  const save = debounce(() => doSave(), 1000);
  const doSave = () => api.post('/exam/' + d.id + '/save', { answers: ans, marks, choice }, { keepalive: true }).catch(() => {});
  const iv = setInterval(doSave, 20000);
  ctx.onLeave(() => { clearInterval(iv); clearInterval(tick); doSave(); document.removeEventListener('keydown', onKey); });
  const tick = setInterval(() => {
    if (!deadline) return;
    const left = Math.max(0, (deadline - Date.now()) / 1000);
    timerEl.textContent = mmss(left);
    timerEl.classList.toggle('low', left < 300);
    if (left <= 0 && !finishing) { finishing = true; toast('Se acabó el tiempo. Corrigiendo…'); finish(true); }
  }, 250);

  const draw = () => {
    const it = items[cur], q = d.questions[it.qid], s = it.section;
    const list = bySection(s.id);
    const posInSec = list.indexOf(it);
    const order = orderFor(q, d.id, d.shuffle);
    const chosen = ans[it.qid];
    const answeredN = (sid) => bySection(sid).filter((x) => ans[x.qid] != null).length;

    const tabs = sections.length > 1 ? h('div', { class: 'tabs', role: 'tablist' }, sections.map((x) => h('button', {
      role: 'tab', 'aria-selected': x.id === sec ? 'true' : 'false', onclick: () => { sec = x.id; cur = items.indexOf(bySection(x.id)[0]); draw(); },
    }, x.title.replace('Parte 2 · Supuesto práctico del ', 'P2 · ').replace('Parte 1 · ', 'P1 · '), h('span', { class: 'muted' }, ` ${answeredN(x.id)}/${bySection(x.id).length}`)))) : null;

    const nav = h('div', { class: 'qnav' }, list.map((x, k) => h('button', {
      class: [ans[x.qid] != null ? 'ans' : '', marks[x.qid] ? 'mark' : '', x === it ? 'cur' : ''].join(' '), title: 'Pregunta ' + (k + 1), 'aria-label': 'Ir a la pregunta ' + (k + 1),
      onclick: () => { cur = items.indexOf(x); draw(); },
    }, k + 1)));

    const opts = h('div', { class: 'opts', role: 'group' }, order.map((orig, pos) => h('button', {
      class: 'opt' + (chosen === orig ? ' sel' : ''), 'aria-pressed': chosen === orig ? 'true' : 'false', onclick: () => pick(orig),
    }, h('span', { class: 'ltr' }, LETTERS[pos]), h('span', { class: 'txt' }, inline(q.o[orig])))));

    const p2banner = isP2(s) ? h('div', { class: 'callout ' + (choice === s.id ? 'ok' : 'warn') },
      choice === s.id ? [icon('check'), ' Has elegido este supuesto: ', h('strong', null, 'solo se corregirá este.')]
        : [icon('alert'), ' Solo se corrige ', h('strong', null, 'un'), ' supuesto. ', choice ? 'Ahora tienes elegido el otro. ' : 'Se elegirá este al contestar. ',
          h('button', { class: 'btn sm', onclick: () => { choice = s.id; save(); draw(); } }, 'Elegir este supuesto')]) : null;

    root.replaceChildren(
      h('div', { class: 'qhead' }, h('strong', null, d.title), h('span', { class: 'grow' }),
        deadline ? [icon('clock'), timerEl] : null,
        h('button', { class: 'btn primary', onclick: () => finish(false) }, icon('check'), 'Terminar')),
      h('div', { class: 'qwrap exam' },
        h('div', null, tabs, p2banner,
          it.group.enunciado ? h('details', { class: 'card enun', open: true }, h('summary', { style: { cursor: 'pointer', fontWeight: 700 } }, it.group.title || 'Enunciado'), h('div', { class: 'mt' }, render(it.group.enunciado))) : null,
          h('div', { class: 'card qcard' },
            h('div', { class: 'row between small muted mb' }, h('span', null, `Pregunta ${posInSec + 1} de ${list.length}`), marks[it.qid] ? h('span', { class: 'chip warn' }, 'Marcada para revisar') : null),
            qText(q), opts,
            h('div', { class: 'qactions' },
              h('button', { class: 'btn ghost', disabled: cur === 0 || null, onclick: () => step(-1) }, icon('left'), 'Anterior'),
              h('button', { class: 'btn', onclick: () => step(1), disabled: cur === items.length - 1 || null }, 'Siguiente', icon('right')),
              h('span', { class: 'grow' }),
              chosen != null ? h('button', { class: 'btn sm ghost', onclick: () => { ans[it.qid] = null; save(); draw(); } }, 'Borrar respuesta') : null,
              h('button', { class: 'btn sm ghost' + (marks[it.qid] ? ' flagged-on' : ''), title: 'Marcar para revisar (M)', onclick: () => { marks[it.qid] ? delete marks[it.qid] : (marks[it.qid] = 1); save(); draw(); } }, icon('flag'), 'Revisar'))),
          h('p', { class: 'hint center mt' }, 'Error: −1/3 · En blanco: 0 · ', h('kbd', null, '1'), '–', h('kbd', null, '4'), ' responder · ', h('kbd', null, '←'), h('kbd', null, '→'), ' navegar · ', h('kbd', null, 'M'), ' marcar')),
        h('div', { class: 'sticky-side' }, h('div', { class: 'card' }, h('h3', null, 'Preguntas'), nav,
          h('div', { class: 'legend mt' }, h('span', null, h('i', { style: { background: 'var(--primary-soft)', border: '1px solid var(--primary)' } }), 'Contestada'), h('span', null, h('i', { style: { background: 'var(--warn)' } }), 'Revisar'))))));
  };

  const step = (n) => { cur = Math.max(0, Math.min(items.length - 1, cur + n)); sec = items[cur].section.id; draw(); window.scrollTo(0, 0); };
  const pick = (orig) => {
    const it = items[cur];
    ans[it.qid] = ans[it.qid] === orig ? null : orig;
    if (isP2(it.section) && !choice && ans[it.qid] != null) choice = it.section.id;
    save(); draw();
  };

  async function finish(auto) {
    if (!auto) {
      const total = (sid) => bySection(sid).length;
      const lines = sections.map((s) => `${s.title.replace('Parte 2 · Supuesto práctico del ', 'Supuesto ')}: ${bySection(s.id).filter((x) => ans[x.qid] != null).length} / ${total(s.id)} contestadas`);
      const markedN = Object.keys(marks).length;
      const noChoice = sections.some(isP2) && !choice;
      const ok = await dialog({
        title: '¿Terminar y corregir?',
        body: h('div', null, h('ul', null, lines.map((l) => h('li', null, l))), markedN ? h('p', null, `Tienes ${markedN} pregunta(s) marcada(s) para revisar.`) : null,
          noChoice ? h('div', { class: 'callout warn' }, 'No has elegido ningún supuesto práctico: la Parte 2 no se corregiría.') : null,
          h('p', { class: 'muted' }, 'Recuerda: las preguntas en blanco no penalizan.')),
        actions: [{ label: 'Seguir', value: false }, { label: 'Terminar y corregir', value: true, primary: true }],
      });
      if (!ok) return;
    }
    clearInterval(tick); clearInterval(iv); finishing = true;
    try {
      await api.post('/exam/' + d.id + '/finish', { answers: ans, marks, choice });
      const fin = await api.get('/exam/' + d.id);
      hooks.rerenderNav();
      document.removeEventListener('keydown', onKey);
      root.replaceChildren(results(fin));
      window.scrollTo(0, 0);
    } catch (e) { toast(e.message, 'err'); finishing = false; }
  }

  const onKey = (e) => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.modal-bg')) return;
    const k = e.key.toLowerCase();
    const p = '1234'.indexOf(k) >= 0 ? '1234'.indexOf(k) : 'abcd'.indexOf(k);
    if (k.length === 1 && p >= 0) pick(orderFor(d.questions[items[cur].qid], d.id, d.shuffle)[p]);
    else if (k === 'arrowright') step(1); else if (k === 'arrowleft') step(-1);
    else if (k === 'm') { const q = items[cur].qid; marks[q] ? delete marks[q] : (marks[q] = 1); save(); draw(); }
  };
  document.addEventListener('keydown', onKey);
  draw();
  return root;
}

// ============================================================ resultados
export function results(d) {
  const r = d.result || {};
  const items = flatten(d);
  const total = r.total || { ok: 0, ko: 0, blank: 0, n: 0, outOfTen: 0 };
  let filter = 'todas';
  const review = h('div', { class: 'stack' });
  const chips = h('div', { class: 'row' });
  const cutPct = r.cut ?? 50;

  const status = (it) => {
    const q = d.questions[it.qid], v = d.answers[it.qid];
    if (v == null) return 'blank';
    return v === q.a ? 'ok' : 'ko';
  };
  const drawReview = () => {
    chips.replaceChildren(...[['todas', 'Todas'], ['ko', 'Falladas'], ['blank', 'En blanco'], ['mark', 'Marcadas']].map(([k, l]) =>
      h('button', { class: 'chip btn-like', 'aria-pressed': filter === k ? 'true' : 'false', onclick: () => { filter = k; drawReview(); } }, l)));
    review.replaceChildren();
    let shownGroup = null, n = 0;
    items.forEach((it, idx) => {
      const st = status(it), q = d.questions[it.qid];
      const inactive = it.section.id.startsWith('p2-') && r.choice !== it.section.id && st === 'blank';
      if (inactive) return;
      if (filter === 'ko' && st !== 'ko') return;
      if (filter === 'blank' && st !== 'blank') return;
      if (filter === 'mark' && !(d.marks[it.qid] || q.flag)) return;
      n++;
      if (it.group.enunciado && shownGroup !== it.group) {
        shownGroup = it.group;
        review.append(h('details', { class: 'card enun' }, h('summary', { style: { cursor: 'pointer', fontWeight: 700 } }, it.group.title || 'Enunciado'), h('div', { class: 'mt' }, render(it.group.enunciado))));
      }
      const order = orderFor(q, d.id, d.shuffle), chosen = d.answers[it.qid];
      review.append(h('div', { class: 'review-item ' + st },
        h('div', { class: 'row between small muted mb' }, h('span', null, `#${idx + 1}`, q.topic ? h('span', { class: 'chip ' + topicById(q.topic)?.block, style: { marginLeft: '.5rem' } }, `T${topicById(q.topic)?.global}`) : null),
          h('span', { class: 'chip ' + (st === 'ok' ? 'ok' : st === 'ko' ? 'ko' : '') }, st === 'ok' ? 'Acierto' : st === 'ko' ? 'Fallo' : 'En blanco')),
        qText(q),
        h('div', { class: 'opts' }, order.map((orig, pos) => h('div', { class: 'opt' + (orig === q.a ? ' right' : orig === chosen ? ' wrong' : '') }, h('span', { class: 'ltr' }, LETTERS[pos]), h('span', { class: 'txt' }, inline(q.o[orig]))))),
        q.e || q.ref ? h('div', { class: 'explain' }, q.e ? render(q.e) : null, q.ref ? h('div', { class: 'ref' }, icon('book'), ' ', q.ref) : null) : null,
        h('div', { class: 'qactions' }, h('button', { class: 'btn sm ghost' + (q.flag ? ' flagged-on' : ''), onclick: (e) => toggleFlag(q, e.currentTarget) }, icon('star'), 'Marcar'),
          h('button', { class: 'btn sm ghost', onclick: () => reportDialog(q.id) }, icon('alert'), 'Reportar'))));
    });
    if (!n) review.append(h('div', { class: 'empty' }, 'Nada que mostrar con este filtro.'));
  };

  const partCard = (title, p, note) => h('div', { class: 'card' }, h('div', { class: 'row between' }, h('h3', { class: 'mb0' }, title), p ? h('span', { class: 'chip ' + (p.pass ? 'ok' : 'ko') }, p.pass ? 'Supera el corte' : 'Por debajo del corte') : h('span', { class: 'chip' }, 'No corregida')),
    p ? h('div', { class: 'kpi mt' }, ring(p.pct, { size: 92, stroke: 10, color: p.pass ? 'var(--ok)' : 'var(--ko)' }),
      h('div', null, h('div', { class: 'score-big' }, num(p.points, 1), h('small', { class: 'muted', style: { fontSize: '1rem' } }, ' / 50')),
        h('div', { class: 'small muted' }, `${plural(p.ok, 'acierto', 'aciertos')} · ${plural(p.ko, 'error', 'errores')} · ${p.blank} en blanco`), h('div', { class: 'small muted' }, `Directa ${num(p.direct, 2)} de ${p.max} (corte ${num(p.minDirect, 1)})`)))
      : h('p', { class: 'muted mt' }, note || ''));

  const byTopic = Object.entries(r.byTopic || {}).filter(([t]) => t).map(([t, v]) => ({ t, ...v, acc: v.ok + v.ko ? (100 * v.ok) / (v.ok + v.ko) : null })).sort((a, b) => (a.acc ?? 101) - (b.acc ?? 101));
  const failIds = items.filter((it) => status(it) !== 'ok' && !it.group.enunciado && d.questions[it.qid].topic).map((it) => it.qid);

  const head = d.kind === 'simulacro'
    ? h('div', null,
      h('div', { class: 'card', style: { borderLeft: '6px solid ' + (r.passed ? 'var(--ok)' : 'var(--ko)') } },
        h('div', { class: 'row between' }, h('div', null, h('div', { class: 'small muted' }, 'Nota estimada del ejercicio'), h('div', { class: 'score-big' }, num(r.points, 1), h('small', { class: 'muted', style: { fontSize: '1.2rem' } }, ' / 100'))),
          h('div', { class: 'right' }, h('span', { class: 'chip ' + (r.passed ? 'ok' : 'ko'), style: { fontSize: '1rem' } }, r.passed ? 'APTO (estimado)' : 'NO APTO (estimado)'), h('div', { class: 'small muted mt' }, `Tiempo: ${duration(r.elapsed || 0)}`))),
        h('p', { class: 'hint mb0 mt' }, `Estimación orientativa con un corte del ${cutPct} % de la nota directa (ajustable en Ajustes). El corte real lo fija el Tribunal, nunca por debajo del 30 %. Hay que superar ambas partes.`)),
      h('div', { class: 'grid g2 mt' }, partCard('Parte 1 · Cuestionario', r.p1), partCard('Parte 2 · Supuesto práctico', r.p2, 'No elegiste ningún supuesto (o no contestaste): como en el examen real, esta parte no se corrige.')))
    : h('div', { class: 'card' }, h('div', { class: 'kpi' }, ring(Math.max(0, (total.direct / Math.max(1, total.n)) * 100), { size: 110, stroke: 11, color: total.outOfTen >= 5 ? 'var(--ok)' : 'var(--ko)' }),
      h('div', null, h('div', { class: 'score-big' }, num(total.outOfTen, 2), h('small', { class: 'muted', style: { fontSize: '1.1rem' } }, ' / 10')),
        h('div', { class: 'muted' }, `${plural(total.ok, 'acierto', 'aciertos')} · ${plural(total.ko, 'error', 'errores')} · ${total.blank} en blanco · de ${total.n}`),
        h('div', { class: 'small muted' }, `Nota directa ${num(total.direct, 2)} (error = −1/3) · ${duration(r.elapsed || 0)}`))));

  drawReview();
  return h('div', null,
    h('div', { class: 'row between mb' }, h('h1', { class: 'mb0' }, 'Resultado · ' + d.title), h('div', { class: 'row' },
      failIds.length ? h('button', { class: 'btn primary', onclick: () => startQuiz({ kind: 'test', qids: failIds, n: 200, mode: 'estudio' }) }, icon('target'), `Repetir falladas y blancos (${failIds.length})`) : null,
      h('a', { class: 'btn', href: d.kind === 'simulacro' ? '#/simulacro' : '#/test' }, 'Nuevo'), h('a', { class: 'btn ghost', href: '#/' }, 'Inicio'))),
    head,
    byTopic.length > 1 ? h('div', { class: 'card mt' }, h('h2', null, 'Por tema'), h('div', { class: 'scroll-x' }, h('table', { class: 't' },
      h('thead', null, h('tr', null, ['Tema', 'Preguntas', 'Acierto', ''].map((x) => h('th', null, x)))),
      h('tbody', null, byTopic.map((x) => { const t = topicById(x.t); return h('tr', null, h('td', null, h('a', { href: '#/tema/' + x.t }, `T${t?.global}. ${t?.short || x.t}`)),
        h('td', null, `${x.ok}✓ ${x.ko}✗ ${x.blank ? x.blank + '○' : ''}`), h('td', { style: { minWidth: '8rem' } }, h('div', { class: 'bar thin ' + (x.acc >= 70 ? 'ok' : x.acc >= 50 ? 'warn' : 'ko') }, h('i', { style: { width: (x.acc ?? 0) + '%' } }))), h('td', null, x.acc != null ? pct(x.acc) : '—')); }))))) : null,
    h('h2', { class: 'mt2' }, 'Corrección'), chips, h('div', { class: 'mt' }, review));
}
