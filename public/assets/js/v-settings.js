// Ajustes, copia de seguridad y revisión de preguntas reportadas.
import { h, icon, toast, confirmBox, fts } from './dom.js';
import { api } from './api.js';
import { S, reload, applyTheme, settings, topicById } from './state.js';

const DAYS = [[1, 'Lun'], [2, 'Mar'], [3, 'Mié'], [4, 'Jue'], [5, 'Vie'], [6, 'Sáb'], [7, 'Dom']];

export default async function ajustes() {
  await reload();
  const s = { ...settings() };
  const [health, reports] = await Promise.all([api.get('/health'), api.get('/reports')]);

  const date = h('input', { type: 'date', id: 'f-date', value: s.exam_date || '', oninput: (e) => { s.exam_date = e.target.value || null; } });
  const hours = h('input', { type: 'number', id: 'f-hours', min: 0.5, max: 16, step: 0.5, value: s.hours_per_day, oninput: (e) => { s.hours_per_day = +e.target.value; } });
  const goal = h('input', { type: 'number', id: 'f-goal', min: 5, max: 500, value: s.daily_goal, oninput: (e) => { s.daily_goal = +e.target.value; } });
  const cut = h('input', { type: 'number', id: 'f-cut', min: 30, max: 95, value: s.cut_pct, oninput: (e) => { s.cut_pct = +e.target.value; } });
  const theme = h('select', { id: 'f-theme', onchange: (e) => { s.theme = e.target.value; } }, [['auto', 'Automático (sistema)'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([v, l]) => h('option', { value: v, selected: s.theme === v || null }, l)));
  const shuffle = h('input', { type: 'checkbox', checked: s.shuffle || null, onchange: (e) => { s.shuffle = e.target.checked; } });
  const days = DAYS.map(([n, l]) => h('label', { class: 'chip btn-like', style: { cursor: 'pointer' } }, h('input', { type: 'checkbox', checked: s.study_days.includes(n) || null, onchange: (e) => { const set = new Set(s.study_days); e.target.checked ? set.add(n) : set.delete(n); s.study_days = [...set].sort(); } }), ' ' + l));

  const save = async () => {
    try {
      S.boot.settings = await api.post('/settings', s);
      applyTheme(S.boot.settings.theme);
      toast('Ajustes guardados');
    } catch (e) { toast(e.message, 'err'); }
  };

  const exportFile = async () => {
    try {
      const data = await api.get('/export');
      const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
      const a = h('a', { href: url, download: `tai-copia-${new Date().toISOString().slice(0, 10)}.json` });
      document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e) { toast(e.message, 'err'); }
  };
  const importFile = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (!(await confirmBox('Restaurar copia de seguridad', 'Se sustituirá TODO tu progreso actual por el de la copia. ¿Continuar?', 'Restaurar', true))) { e.target.value = ''; return; }
    try { const data = JSON.parse(await f.text()); const r = await api.post('/import', data); toast(`Copia restaurada (${r.rows} registros)`); await reload(); location.hash = '#/'; location.reload(); }
    catch (err) { toast(err.message || 'Archivo no válido', 'err'); }
  };

  const repList = reports.items.length ? reports.items.map((r) => h('div', { class: 'task' + (r.done ? ' done' : '') },
    h('input', { type: 'checkbox', checked: r.done || null, 'aria-label': 'Resuelto', onchange: async (e) => { await api.post(`/reports/${r.id}/done`, { done: e.target.checked }); } }),
    h('div', { class: 'task-label' }, h('div', { class: 'small muted' }, `${fts(r.ts)} · ${r.kind}${r.q?.topic ? ' · T' + (topicById(r.q.topic)?.global ?? '?') : ''}`),
      h('div', null, r.q ? r.q.q.split('\n')[0] : r.qid), r.q ? h('div', { class: 'small muted' }, 'Marcada como correcta: ' + r.q.o[r.q.a]) : null, r.msg ? h('div', { class: 'small' }, '“' + r.msg + '”') : null))) : [h('p', { class: 'muted' }, 'No has reportado ninguna pregunta. Si ves una respuesta dudosa, pulsa «Reportar» en el test y aparecerá aquí.')];

  return h('div', null, h('h1', null, 'Ajustes'),
    h('div', { class: 'grid g2' },
      h('div', { class: 'card' }, h('h2', null, 'Plan y objetivos'),
        h('div', { class: 'field' }, h('label', { for: 'f-date' }, 'Fecha del examen'), date, h('span', { class: 'hint' }, 'Con la fecha se genera el plan de estudio y se limitan los intervalos de repaso.')),
        h('div', { class: 'field' }, h('label', null, 'Días de estudio a la semana'), h('div', { class: 'row' }, days)),
        h('div', { class: 'grid g2' }, h('div', { class: 'field' }, h('label', { for: 'f-hours' }, 'Horas de estudio al día'), hours), h('div', { class: 'field' }, h('label', { for: 'f-goal' }, 'Objetivo diario (preguntas)'), goal)),
        h('div', { class: 'field' }, h('label', { for: 'f-cut' }, 'Corte supuesto del Tribunal (% de la nota directa)'), cut,
          h('span', { class: 'hint' }, 'Solo afecta a la nota estimada de los simulacros. El corte real se conoce tras el examen; nunca es inferior al 30 %.')),
        h('div', { class: 'field' }, h('label', { for: 'f-theme' }, 'Tema visual'), theme),
        h('label', { class: 'check mb' }, shuffle, 'Barajar el orden de las opciones (se respeta en preguntas del tipo «a y b son correctas»)'),
        h('button', { class: 'btn primary', onclick: save }, icon('check'), 'Guardar ajustes')),
      h('div', { class: 'stack' },
        h('div', { class: 'card' }, h('h2', null, 'Copia de seguridad'),
          h('p', { class: 'muted small' }, 'Tu progreso se guarda en el servidor (SQLite en ', h('code', null, health.data), '). Descarga una copia antes de mover o reinstalar.'),
          h('div', { class: 'row' }, h('button', { class: 'btn', onclick: exportFile }, icon('download'), 'Descargar copia'),
            h('label', { class: 'btn' }, icon('upload'), 'Restaurar copia', h('input', { type: 'file', accept: 'application/json,.json', class: 'sr-only', onchange: importFile })))),
        h('div', { class: 'card' }, h('h2', null, 'Acerca de'),
          h('dl', { class: 'kv' }, h('dt', null, 'Versión'), h('dd', null, health.rev || 'desconocida'), h('dt', null, 'Esquema BD'), h('dd', null, 'v' + health.db), h('dt', null, 'PHP'), h('dd', null, health.php),
            h('dt', null, 'Banco'), h('dd', null, `${S.boot.totals.bank} preguntas · ${S.boot.bank.cards} tarjetas`)),
          h('p', { class: 'hint mt' }, 'Programa y formato del examen: ', h('a', { href: S.boot.temario.convocatoria.url, target: '_blank', rel: 'noopener noreferrer' }, 'convocatoria ' + S.boot.temario.convocatoria.ref), '. Actualizar la web: ', h('code', null, 'git -C /opt/apps/tai pull'), '.'),
          h('div', { class: 'callout warn' }, 'El material (apuntes, preguntas y explicaciones) es una elaboración propia de apoyo: contrástalo con la normativa vigente y usa «Reportar» si ves algún error.')))),
    h('div', { class: 'card mt2' }, h('h2', null, 'Revisión de preguntas reportadas'), repList));
}
